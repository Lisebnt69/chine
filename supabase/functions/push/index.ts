// ═══════════════════════════════════════════════════════════════
// Notifications push de l'app Chine — Supabase Edge Function (Deno)
//
// Réservées à Matis et Lise : s'abonner demande le code de l'assistant (APP_SECRET), et les abonnements sont dans
// une table fermée à la clé publique. Un visiteur ne peut ni s'abonner ni recevoir quoi que ce soit.
//
// Deux familles d'appels :
//   • depuis l'app (en-tête x-app-secret = APP_SECRET) : "cle", "subscribe", "unsubscribe", "test"
//   • depuis la base (en-tête x-push-secret = PUSH_HOOK_SECRET) : "chat" (déclencheur sur chat_messages),
//     "rappels" (pg_cron : transports de la veille / du jour)
//
// Secrets à définir (Supabase → Edge Functions → Secrets), en plus de APP_SECRET déjà posé pour `assistant` :
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   npx web-push generate-vapid-keys
//   VAPID_SUBJECT                          une adresse https:// ou mailto: qui vous identifie auprès d'Apple / Google
//   PUSH_HOOK_SECRET                       un code que vous inventez, le même que push_config.secret en base
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Déploiement : npx supabase functions deploy push --project-ref <ref> --no-verify-jwt
// ═══════════════════════════════════════════════════════════════

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { composerRecap, type Plan } from "./recap.ts";
import { escalesHelsinki, evenementsEscale, evenementsResa, evenementsTrains, evenementsVols, type Evt } from "./horaires.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-app-secret, x-push-secret, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERS = ["matis", "lise"] as const;
type User = typeof USERS[number];
const NOM: Record<User, string> = { matis: "Matis", lise: "Lise" };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "";
let vapidPret = false;
if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); vapidPret = true; }
  catch (e) { console.error("VAPID invalide :", (e as Error).message); }
}

type Json = Record<string, unknown>;
type Notif = { titre: string; corps: string; tag: string; onglet?: string };

// Comparaison à temps constant : ne dit pas, par le temps de réponse, combien de caractères du code sont justes.
function memeCode(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const court = (t: string, n: number) => {
  t = t.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

// ── Envoi ──────────────────────────────────────────────────────
// Envoie à tous les téléphones des personnes données. Un abonnement mort (410 / 404) est supprimé de la base.
async function envoyer(users: User[], notif: Notif, ttl: number): Promise<{ envoyes: number; morts: number; echecs: number }> {
  const bilan = { envoyes: 0, morts: 0, echecs: 0 };
  if (!vapidPret || !users.length) return bilan;
  const { data, error } = await sb.from("push_abonnements").select("id, endpoint, p256dh, auth").in("user_key", users);
  if (error) { console.error("lecture abonnements :", error.message); return bilan; }
  const charge = JSON.stringify(notif);
  await Promise.all((data || []).map(async (a) => {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        charge,
        { TTL: ttl, urgency: "high" },
      );
      bilan.envoyes++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        bilan.morts++;
        await sb.from("push_abonnements").delete().eq("id", a.id);
      } else {
        bilan.echecs++;
        console.error("envoi :", status, (e as Error).message);
      }
    }
  }));
  return bilan;
}

// Une seule notif par clé et par tranche de `secondes` : bloque le spam venant de la clé publique (chat, souhaits).
async function laisserPasser(prefixe: string, auteur: string, secondes: number): Promise<boolean> {
  const { error } = await sb.from("push_envoyes").insert({ cle: `${prefixe}:${auteur}:${Math.floor(Date.now() / (secondes * 1000))}` });
  if (error) return false;
  sb.from("push_envoyes").delete().like("cle", `${prefixe}:%`).lt("created_at", new Date(Date.now() - 86400e3).toISOString()).then(() => {});
  return true;
}

// ── Chat ───────────────────────────────────────────────────────
function resumeMessage(content: string): string {
  if (content.startsWith("IMG:")) return "📷 Photo";
  if (content.startsWith("VIDEO:")) return "🎥 Vidéo";
  if (content.startsWith("SNAP:")) return "📸 Snap";
  if (content.startsWith("POLL:")) return "📊 Sondage";
  if (content.startsWith("LOC:")) return "📍 Position partagée : ouvre le chat pour y aller";
  return court(content.replace(/ ✏️$/, ""), 140) || "Nouveau message";
}

async function handleChat(body: Json) {
  const author = String(body.author || "");
  if (!USERS.includes(author as User)) return { ignore: "auteur" };
  const dest = USERS.filter((u) => u !== author);   // l'autre personne, jamais l'auteur
  // Au plus une notif toutes les 20 s par auteur : le chat reste inscriptible avec la clé publique, ça borne le spam.
  if (!await laisserPasser("chat", author, 20)) return { ignore: "limite" };
  const r = await envoyer(dest, {
    titre: `💬 ${NOM[author as User]}`,
    corps: resumeMessage(String(body.content || "")),
    tag: "chat",
    onglet: "chat",
  }, 6 * 3600);
  return r;
}

// ── Souhaits ───────────────────────────────────────────────────
// Un visiteur peut envoyer un ticket sans compte : les deux sont prévenus. Si c'est Matis ou Lise, l'autre seulement.
async function handleSouhait(body: Json) {
  const auteur = String(body.auteur || "visiteur");
  if (!await laisserPasser("souhait", auteur, 10)) return { ignore: "limite" };
  const dest = USERS.filter((u) => u !== auteur);
  const qui = auteur === "matis" || auteur === "lise" ? NOM[auteur] : "Un visiteur";
  const personne = court(String(body.personne || ""), 40);
  return await envoyer(dest, {
    titre: `🎁 Nouveau souhait · ${qui}`,
    corps: court(`${personne ? "Pour " + personne + " : " : ""}${String(body.envie || "")}`, 140),
    tag: "souhait",
    onglet: "souhaits",
  }, 24 * 3600);
}

// ── Réservation faite ──────────────────────────────────────────
async function handleResaFaite(body: Json) {
  const par = String(body.par || "").toLowerCase();
  const dest = USERS.filter((u) => u !== par);   // l'autre personne ; si on ne sait pas qui, les deux
  const qui = par === "matis" || par === "lise" ? NOM[par as User] : "Quelqu'un";
  return await envoyer(dest, {
    titre: `✅ ${qui} a réservé`,
    corps: court(String(body.titre || "Une réservation"), 140),
    tag: "resa-faite",
    onglet: "areserver",
  }, 24 * 3600);
}

// ── Rappels de transport ───────────────────────────────────────
// Heure de Chine = UTC+8 toute l'année (pas d'heure d'été).
const dateChine = (decalJours: number) => new Date(Date.now() + 8 * 3600e3 + decalJours * 86400e3).toISOString().slice(0, 10);

async function handleRappels(body: Json) {
  const moment = body.moment === "jour" ? "jour" : "veille";
  // Le job « jour » tourne à 23 h UTC = 7 h en Chine, donc déjà le lendemain en date de Chine : dateChine(0) est bien « aujourd'hui ».
  const date = moment === "jour" ? dateChine(0) : dateChine(1);
  // La date de départ est dans `adresse`. Quand elle est vide, l'app prend le jour du planning où le transport est placé : pareil ici.
  const { data: tous, error } = await sb.from("items").select("id, nom, quartier, adresse")
    .eq("type", "transport").eq("fait", false);
  if (error) return { erreur: error.message };
  const sansDate = (tous || []).filter((t) => !t.adresse).map((t) => t.id);
  const dateDuSlot = new Map<string, string>();
  if (sansDate.length) {
    const { data: slots } = await sb.from("planning_slots").select("item_id, planning:planning_id(date_voyage)").in("item_id", sansDate);
    for (const sl of (slots || []) as unknown as { item_id: string; planning: { date_voyage?: string } | null }[]) {
      if (sl.planning?.date_voyage) dateDuSlot.set(sl.item_id, sl.planning.date_voyage);
    }
  }
  const data = (tous || []).filter((t) => (t.adresse || dateDuSlot.get(t.id)) === date);

  const bilan = { transports: 0, envoyes: 0 };
  for (const t of data) {
    // Une seule fois par transport et par moment, même si le job est relancé.
    const cle = `${moment}:${t.id}:${date}`;
    const { error: dup } = await sb.from("push_envoyes").insert({ cle });
    if (dup) continue;
    bilan.transports++;
    const heure = t.quartier ? ` à ${t.quartier}` : "";
    const r = await envoyer([...USERS], {
      titre: moment === "jour" ? "🚄 Aujourd'hui" : "🚄 Demain",
      corps: court(`${t.nom || "Transport"}${heure}`, 120),
      tag: `transport-${t.id}`,
      onglet: "transport",
    }, 12 * 3600);
    bilan.envoyes += r.envoyes;
  }
  // Hôtel : le jour du check-in (la date est dans `adresse`, comme pour les transports).
  if (moment === "jour") {
    const { data: hotels } = await sb.from("items").select("id, nom, ville").eq("type", "hotel").eq("adresse", date).eq("fait", false);
    for (const h of hotels || []) {
      const { error: dup } = await sb.from("push_envoyes").insert({ cle: `hotel:${h.id}:${date}` });
      if (dup) continue;
      const r = await envoyer([...USERS], {
        titre: "🏨 Check-in aujourd'hui",
        corps: court(`${h.nom || "Hôtel"}${h.ville ? " · " + h.ville : ""}`, 120),
        tag: `hotel-${h.id}`,
        onglet: "hotels",
      }, 12 * 3600);
      bilan.envoyes += r.envoyes;
    }
  }

  // À réserver : tout ce qui n'est pas fait et doit l'être avant ce jour-là, en UNE notif (pas dix d'un coup).
  const { data: aResa } = await sb.from("a_reserver").select("id, titre").eq("fait", false).eq("avant", date).in("mode", ["resa", "verifier"]);
  const neuves: { id: string; titre: string }[] = [];
  for (const r of aResa || []) {
    const { error: dup } = await sb.from("push_envoyes").insert({ cle: `resa:${moment}:${r.id}:${date}` });
    if (!dup) neuves.push(r);
  }
  if (neuves.length) {
    const noms = neuves.slice(0, 3).map((r) => r.titre).join(" · ") + (neuves.length > 3 ? ` · +${neuves.length - 3}` : "");
    const r = await envoyer([...USERS], {
      titre: `⏰ À réserver ${moment === "jour" ? "aujourd'hui" : "avant demain"}`,
      corps: court(noms, 140),
      tag: `resa-${moment}`,
      onglet: "areserver",
    }, 12 * 3600);
    bilan.envoyes += r.envoyes;
  }
  return bilan;
}

// ── Échéances à l'heure près ───────────────────────────────────
// Appelée chaque minute par pg_cron. Calcule les moments clés (escale d'Helsinki, résas avec une heure) et envoie ceux qui
// viennent d'arriver. Une notif n'est envoyée qu'une fois (push_envoyes) et jamais en retard de plus de FENETRE_MS : si le
// cron a raté un tour, on préfère se taire que dire « repartez maintenant » une heure trop tard.
const FENETRE_MS = 6 * 60e3;
// Les résas des journées passées en Chine seulement : les horaires du 8 et du 22 (vols, train en France) ne sont pas en heure de Chine.
const CHINE_DU = "2026-11-09", CHINE_AU = "2026-11-21";

async function handleEcheances() {
  const maintenant = Date.now();
  const evenements: Evt[] = [];

  const { data: transports } = await sb.from("items").select("nom, adresse, quartier, description, prix_type, notes").eq("type", "transport");
  const escales = escalesHelsinki(transports || []);
  for (const e of escales) evenements.push(...evenementsEscale(e.de, e.a));
  // Les vols : le départ d'Helsinki après une escale est déjà dans le plan d'escale, on ne le redit pas.
  evenements.push(...evenementsVols(transports || [], escales.map((e) => e.a)));
  evenements.push(...evenementsTrains(transports || []));

  const { data: resas } = await sb.from("a_reserver").select("id, titre, jour, heure, ou, item:item_id(type)")
    .not("heure", "is", null).not("jour", "is", null).gte("jour", CHINE_DU).lte("jour", CHINE_AU);
  for (const r of (resas || []) as unknown as { id: string; titre: string; jour: string; heure: string; ou: string | null; item: { type?: string } | null }[]) {
    if (r.item?.type === "transport") continue;   // vols et trains ont leurs propres rappels
    evenements.push(...evenementsResa(r));
  }

  const bilan = { dus: 0, envoyes: 0 };
  for (const e of evenements) {
    const age = maintenant - e.ts;
    if (age < 0 || age >= FENETRE_MS) continue;
    const { error: dup } = await sb.from("push_envoyes").insert({ cle: e.cle });
    if (dup) continue;
    bilan.dus++;
    const r = await envoyer([...USERS], { titre: e.titre, corps: e.corps, tag: e.tag, onglet: e.onglet }, 3600);
    bilan.envoyes += r.envoyes;
  }
  return bilan;
}

// ── Récap du soir (21 h en Chine, appelé par pg_cron) ─────────
// Dépenses du jour, lieux faits, et ce qui attend le lendemain (transports d'abord, c'est le vital).
async function handleRecap() {
  const jour = dateChine(0);   // le cron tourne à 13 h UTC = 21 h en Chine : même date
  if (jour < CHINE_DU || jour > CHINE_AU) return { ignore: "hors voyage en Chine" };
  const cle = `recap:${jour}`;
  const { error: dup } = await sb.from("push_envoyes").insert({ cle });
  if (dup) return { ignore: "déjà envoyé" };
  try {
    const demain = dateChine(1);
    const debut = new Date(`${jour}T00:00:00+08:00`), fin = new Date(debut.getTime() + 86400e3);

    const [{ data: budget }, { data: jours }, { data: transports }] = await Promise.all([
      sb.from("budget").select("total, personne").gte("created_at", debut.toISOString()).lt("created_at", fin.toISOString()),
      sb.from("planning").select("id, date_voyage, matin_lieu, aprem_lieu, soir_lieu").in("date_voyage", [jour, demain]),
      sb.from("items").select("nom, quartier").eq("type", "transport").eq("adresse", demain),
    ]);

    const d = { total: 0, matis: 0, lise: 0, deux: 0, nb: 0 };
    for (const b of budget || []) {
      const t = Number(b.total) || 0;
      d.total += t; d.nb++;
      if (b.personne === "matis") d.matis += t; else if (b.personne === "lise") d.lise += t; else d.deux += t;
    }

    const idJour = (jours || []).find((j) => j.date_voyage === jour)?.id;
    const jourDemain = (jours || []).find((j) => j.date_voyage === demain);
    const ids = [idJour, jourDemain?.id].filter(Boolean) as string[];
    type Slot = { planning_id: string; heure: string | null; item: { nom: string; type: string; fait: boolean } | null };
    const { data: slots } = ids.length
      ? await sb.from("planning_slots").select("planning_id, heure, item:item_id(nom, type, fait)").in("planning_id", ids)
      : { data: [] };
    const sorties = (id?: string) => ((slots || []) as unknown as Slot[])
      .filter((x) => x.planning_id === id && x.item && ["activite", "restaurant", "cafe"].includes(x.item.type));
    const duJour = sorties(idJour);
    const lieuxDemain: Plan[] = sorties(jourDemain?.id).map((x) => ({ heure: x.heure, nom: x.item!.nom }));

    const villes = jourDemain
      ? [...new Set([jourDemain.matin_lieu, jourDemain.aprem_lieu, jourDemain.soir_lieu].filter((v) => v && v !== "—"))].join(" → ")
      : "";
    const recap = composerRecap({
      depenses: d,
      aujourdhui: { faits: duJour.filter((x) => x.item!.fait).length, total: duJour.length },
      demain: { villes, transports: (transports || []).map((t) => ({ heure: t.quartier, nom: t.nom || "Transport" })), lieux: lieuxDemain },
    });
    if (!recap) return { ignore: "rien à dire" };
    const r = await envoyer([...USERS], { titre: recap.titre, corps: recap.corps, tag: "recap", onglet: "budget" }, 6 * 3600);
    return { ...r, corps: recap.corps };
  } catch (e) {
    await sb.from("push_envoyes").delete().eq("cle", cle);   // permet de relancer à la main
    return { erreur: (e as Error).message };
  }
}

// ── Abonnements (depuis l'app) ─────────────────────────────────
function abonnementValide(s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  const x = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  return !!x && typeof x.endpoint === "string" && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000
    && typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: Json;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const mode = String(body.mode || "");

  // La clé publique VAPID est faite pour être publique : l'app la lit ici plutôt que de l'avoir écrite en dur.
  if (mode === "cle") return json({ key: VAPID_PUBLIC || null, pret: vapidPret });

  // Appels de la base : code PUSH_HOOK_SECRET.
  if (mode === "chat" || mode === "rappels" || mode === "souhait" || mode === "resa_faite" || mode === "echeances" || mode === "recap") {
    if (!memeCode(req.headers.get("x-push-secret"), Deno.env.get("PUSH_HOOK_SECRET"))) return json({ error: "Code invalide" }, 401);
    if (!vapidPret) return json({ error: "VAPID non configuré" }, 503);
    const gestionnaire = { chat: handleChat, rappels: handleRappels, souhait: handleSouhait, resa_faite: handleResaFaite, echeances: handleEcheances, recap: handleRecap }[mode]!;
    return json(await gestionnaire(body));
  }

  // Appels de l'app : code de l'assistant, que seuls Matis et Lise ont. Sans secret configuré on refuse tout.
  if (!memeCode(req.headers.get("x-app-secret"), Deno.env.get("APP_SECRET"))) return json({ error: "Code assistant invalide" }, 401);

  // Se désabonner n'a pas besoin de savoir qui : à la déconnexion, le téléphone retire son abonnement quel que soit le compte.
  if (mode === "unsubscribe") {
    const endpoint = String(body.endpoint || "");
    if (!endpoint) return json({ error: "endpoint manquant" }, 400);
    const { error } = await sb.from("push_abonnements").delete().eq("endpoint", endpoint);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const user = String(body.user || "") as User;
  if (!USERS.includes(user)) return json({ error: "Réservé à Matis et Lise" }, 403);

  if (mode === "subscribe") {
    if (!vapidPret) return json({ error: "Les clés VAPID ne sont pas configurées sur la fonction", code: "vapid" }, 503);
    if (!abonnementValide(body.subscription)) return json({ error: "Abonnement invalide" }, 400);
    const s = body.subscription;
    // endpoint est unique : si ce téléphone change de personne (déconnexion / reconnexion), la ligne passe à la nouvelle.
    const { error } = await sb.from("push_abonnements").upsert({
      user_key: user, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      appareil: court(String(body.appareil || ""), 120),
    }, { onConflict: "endpoint" });
    if (error) return json({ error: error.message, code: /relation|does not exist/.test(error.message) ? "table" : undefined }, 500);
    return json({ ok: true });
  }

  if (mode === "test") {
    if (!vapidPret) return json({ error: "Les clés VAPID ne sont pas configurées sur la fonction", code: "vapid" }, 503);
    const r = await envoyer([user], { titre: "🔔 Ça marche", corps: "Les notifications arrivent sur ce téléphone.", tag: "test" }, 300);
    return json(r);
  }

  return json({ error: "Mode inconnu" }, 400);
});
