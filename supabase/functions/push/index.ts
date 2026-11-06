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

// ── Chat ───────────────────────────────────────────────────────
function resumeMessage(content: string): string {
  if (content.startsWith("IMG:")) return "📷 Photo";
  if (content.startsWith("VIDEO:")) return "🎥 Vidéo";
  if (content.startsWith("SNAP:")) return "📸 Snap";
  if (content.startsWith("POLL:")) return "📊 Sondage";
  return court(content.replace(/ ✏️$/, ""), 140) || "Nouveau message";
}

async function handleChat(body: Json) {
  const author = String(body.author || "");
  if (!USERS.includes(author as User)) return { ignore: "auteur" };
  const dest = USERS.filter((u) => u !== author);   // l'autre personne, jamais l'auteur
  // Au plus une notif toutes les 20 s par auteur : le chat reste inscriptible avec la clé publique, ça borne le spam.
  const { error: dup } = await sb.from("push_envoyes").insert({ cle: `chat:${author}:${Math.floor(Date.now() / 20000)}` });
  if (dup) return { ignore: "limite" };
  sb.from("push_envoyes").delete().like("cle", "chat:%").lt("created_at", new Date(Date.now() - 86400e3).toISOString()).then(() => {});
  const r = await envoyer(dest, {
    titre: `💬 ${NOM[author as User]}`,
    corps: resumeMessage(String(body.content || "")),
    tag: "chat",
    onglet: "chat",
  }, 6 * 3600);
  return r;
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
  return bilan;
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
  if (mode === "chat" || mode === "rappels") {
    if (!memeCode(req.headers.get("x-push-secret"), Deno.env.get("PUSH_HOOK_SECRET"))) return json({ error: "Code invalide" }, 401);
    if (!vapidPret) return json({ error: "VAPID non configuré" }, 503);
    return json(mode === "chat" ? await handleChat(body) : await handleRappels(body));
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
