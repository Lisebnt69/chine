// ═══════════════════════════════════════════════════════════════
// Assistant IA du voyage — Supabase Edge Function (Deno)
//
// Reçoit une question depuis l'app, donne à Claude :
//   • l'état du voyage (planning, lieux, budget)
//   • le "cerveau" (reels Insta/TikTok transcrits) via un outil de recherche
//   • la recherche web
//   • des outils pour MODIFIER l'app (planning, lieux, dépenses, carte)
// puis écrit la réponse dans le chat (table chat_messages, auteur 'bot').
//
// Secrets à définir (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY   clé API Anthropic
//   APP_SECRET          code partagé que l'app envoie (évite que n'importe qui crame tes crédits)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
// ═══════════════════════════════════════════════════════════════

import Anthropic from "npm:@anthropic-ai/sdk@1";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-app-secret, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// ───────────────────────── Prompt système (stable → mis en cache) ─────────────────────────
const SYSTEM = `Tu es l'assistant de voyage de Matis et Lise, en Chine du 9 au 22 novembre 2026
(Shanghai, Chongqing, Chengdu, Karst de Wulong, Furong, Zhangjiajie). Tu vis dans leur app de voyage.

Tes sources, par ordre de priorité :
1. Le CERVEAU : les reels Instagram/TikTok qu'ils ont sauvegardés et fait transcrire. C'est ce qui les
   fait kiffer. Cherche-y TOUJOURS d'abord (outil chercher_cerveau) quand on te demande une idée
   d'activité, de resto, de spot. Règles du cerveau :
   - Essaie plusieurs formulations avant de conclure : synonymes, français, anglais et chinois
     ('hot pot', 'hotpot', '火锅'), avec la ville puis sans.
   - Chaque élément qui vient du cerveau cite son lien (le champ url). Sans lien, pas d'affirmation.
   - Si rien ne correspond, dis « rien trouvé dans le cerveau » et propose d'autres mots-clés.
   - Ce qui vient du web ou de tes connaissances générales est signalé à part, comme tel, jamais mélangé.
   - categorie 'piste' = post pas encore analysé, présente-le comme une piste. confiance 'basse' = à vérifier.
   - Circuits et programmes : construis-les d'abord avec des points trouvés dans le cerveau.
2. L'ÉTAT DU VOYAGE fourni dans le message (planning, hôtels, transports, lieux, budget).
3. Le WEB (web_search) pour vérifier horaires, prix, fermetures, météo, trajets, ou compléter.

Tu peux MODIFIER l'app toi-même avec tes outils : ajouter/modifier/supprimer des lieux, les placer dans
le planning à une heure précise, modifier une journée, ajouter/modifier des dépenses, géocoder une adresse
pour la mettre sur la carte. Quand on te demande un changement, fais-le directement avec les outils,
puis confirme en une ligne ce que tu as changé. Ne demande confirmation que si la demande est ambiguë
ou destructive (supprimer plusieurs choses, gros montant).

Règles de modélisation de l'app (important, l'app est construite comme ça) :
- Types de lieux : activite, restaurant, cafe, hotel, transport.
- Les transports et hôtels sont le "vital" : ne les modifie que si on te le demande explicitement.
- Créneaux : periode ∈ Matin | Après-midi | Soir | Journée ; heure au format HH:MM (heure de Chine).
- Durées : 30min | 1h | 2h+. Priorités : coeur | sympa | optionnel. Statuts : idee | planifie | fait.
- Montants en euros (1 € ≈ 7,8 ¥). Budget : personne ∈ matis | lise | les deux.
- Quand tu ajoutes un lieu, donne le maximum d'infos (ville, quartier, adresse) pour qu'il soit placé
  précisément sur la carte. L'outil géocode automatiquement. Si le cerveau n'a pas le nom chinois, cherche-le
  sur le web et mets-le dans adresse_cn : c'est ce qui permet de le placer.
- En Chine, ils naviguent avec Amap : donne le nom ou l'adresse en chinois dès que tu l'as. C'est ce qu'on
  tape dans Amap et qu'on montre au chauffeur.

Pour construire un planning optimisé : regroupe par quartier, enchaîne les lieux proches, respecte
les horaires d'ouverture, garde de la marge pour les trajets (métro/DiDi), pas plus de 3-4 activités
par jour, un vrai repas midi et soir, et tiens compte des transports et check-in d'hôtel du jour.

Style : français, ton pote direct et concret, réponses courtes adaptées au téléphone (puces, heures,
prix). Pas de blabla. Si tu ne sais pas, dis-le.`;

// ───────────────────────── Outils ─────────────────────────
type Json = Record<string, unknown>;

const tools: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 } as Anthropic.Beta.BetaToolUnion,
  {
    name: "chercher_cerveau",
    description:
      "Cherche dans le cerveau (reels Insta/TikTok sauvegardés et transcrits). Chaque résultat est un point (un reel peut en contenir plusieurs). Tous les mots de q doivent être présents, dans le point ou la transcription de son post. Laisse q vide pour lister les points d'une ville.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "mots-clés, ex: 'hot pot', 'rooftop', 'panda'" },
        ville: { type: "string", description: "filtre ville optionnel" },
        limite: { type: "integer", description: "nombre max de résultats (défaut 12)" },
      },
      required: ["q"],
    },
  },
  {
    name: "ajouter_lieu",
    description:
      "Ajoute un lieu (activite, restaurant, cafe) dans l'app. Il est géocodé et placé sur la carte automatiquement si lat/lng ne sont pas fournis. Renvoie l'id du lieu.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["activite", "restaurant", "cafe"] },
        nom: { type: "string" },
        ville: { type: "string" },
        quartier: { type: "string" },
        description: { type: "string" },
        adresse: { type: "string" },
        adresse_cn: { type: "string", description: "adresse en caractères chinois si connue" },
        prix: { type: "number", description: "prix en € pour les deux" },
        duree: { type: "string", enum: ["30min", "1h", "2h+"] },
        moment: { type: "string", enum: ["Matin", "Après-midi", "Soir", "Journée"] },
        priorite: { type: "string", enum: ["coeur", "sympa", "optionnel"] },
        lat: { type: "number" },
        lng: { type: "number" },
        cerveau_id: { type: "string", description: "id du reel du cerveau d'où vient l'idée" },
        notes: { type: "string" },
      },
      required: ["type", "nom", "ville"],
    },
  },
  {
    name: "modifier_lieu",
    description:
      "Modifie un lieu existant (par id). Champs possibles : nom, ville, quartier, description, adresse, adresse_cn, prix, duree, priorite, statut (idee|planifie|fait), lat, lng, notes. Si l'adresse change sans lat/lng, le lieu est re-géocodé.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        champs: { type: "object", description: "les champs à modifier" },
      },
      required: ["id", "champs"],
    },
  },
  {
    name: "supprimer_lieu",
    description: "Supprime un lieu (et ses créneaux de planning). À utiliser seulement si on te le demande.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "planifier",
    description:
      "Place un lieu dans le planning à une date, une période et (idéalement) une heure précise. Passe le lieu au statut 'planifie'.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        periode: { type: "string", enum: ["Matin", "Après-midi", "Soir", "Journée"] },
        heure: { type: "string", description: "HH:MM heure de Chine" },
      },
      required: ["item_id", "date", "periode"],
    },
  },
  {
    name: "deplacer_creneau",
    description: "Change la date, la période et/ou l'heure d'un créneau existant du planning (par slot_id).",
    input_schema: {
      type: "object",
      properties: {
        slot_id: { type: "string" },
        date: { type: "string" },
        periode: { type: "string", enum: ["Matin", "Après-midi", "Soir", "Journée"] },
        heure: { type: "string" },
      },
      required: ["slot_id"],
    },
  },
  {
    name: "retirer_du_planning",
    description: "Retire un créneau du planning (le lieu reste dans les idées).",
    input_schema: { type: "object", properties: { slot_id: { type: "string" } }, required: ["slot_id"] },
  },
  {
    name: "modifier_jour",
    description:
      "Modifie les infos d'une journée : matin_lieu, matin_h, aprem_lieu, aprem_h, soir_lieu, soir_h, notes, hotel_id.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        champs: { type: "object" },
      },
      required: ["date", "champs"],
    },
  },
  {
    name: "ajouter_depense",
    description: "Ajoute une dépense au budget.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        categorie: { type: "string", description: "ex: Repas, Transport, Activité, Hôtel, Shopping, Autre" },
        total: { type: "number", description: "montant en €" },
        personne: { type: "string", enum: ["matis", "lise", "les deux"] },
      },
      required: ["description", "total"],
    },
  },
  {
    name: "modifier_depense",
    description: "Modifie une dépense (par id) : description, categorie, total, personne.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, champs: { type: "object" } },
      required: ["id", "champs"],
    },
  },
  {
    name: "supprimer_depense",
    description: "Supprime une dépense (par id).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "geocoder",
    description: "Trouve les coordonnées GPS d'une adresse ou d'un lieu en Chine (pour vérifier avant d'ajouter).",
    input_schema: {
      type: "object",
      properties: { requete: { type: "string" }, ville: { type: "string" } },
      required: ["requete"],
    },
  },
];

// ───────────────────────── Géocodage (OpenStreetMap / Nominatim) ─────────────────────────
// ville -> [lat, lng, demi-largeur de la zone de recherche en degrés]
const VILLES: Record<string, [number, number, number]> = {
  Shanghai: [31.2304, 121.4737, 0.55], Chongqing: [29.5630, 106.5516, 0.6], Chengdu: [30.5723, 104.0665, 0.5],
  "Karst de Wulong": [29.3568, 107.7560, 0.35], Furong: [28.7621, 109.9561, 0.2], Zhangjiajie: [29.1248, 110.4795, 0.6],
};

// Limité à la ville quand on la connaît. Un résultat qui n'est que la ville entière (rang < 18)
// est refusé : mieux vaut pas de pin qu'un pin faux.
async function geocode(ville: unknown, ...queries: (string | undefined | null)[]): Promise<{ lat: number; lng: number; label: string } | null> {
  const z = VILLES[String(ville || "")];
  const zone = z ? `&bounded=1&viewbox=${z[1] - z[2]},${z[0] + z[2]},${z[1] + z[2]},${z[0] - z[2]}` : "";
  for (const q of queries) {
    if (!q || !q.trim()) continue;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cn${zone}&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "chine2026-trip-app/1.0", "Accept-Language": "fr,en,zh" } });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length && data[0].place_rank >= 18) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
      }
    } catch (_) { /* on tente la requête suivante */ }
    await new Promise((res) => setTimeout(res, 1100)); // politesse Nominatim : 1 req/s
  }
  return null;
}

function geoQueries(x: Json) {
  const s = (k: string) => (x[k] ? String(x[k]) : "");
  return [
    s("adresse_cn"),
    s("adresse") && `${s("adresse")} ${s("ville")}`,
    `${s("nom")} ${s("ville")}`,
    s("quartier") && `${s("quartier")} ${s("ville")}`,
  ];
}

const ITEM_FIELDS = ["nom", "ville", "quartier", "description", "adresse", "adresse_cn", "prix", "duree", "priorite", "statut", "lat", "lng", "notes"];
const DAY_FIELDS = ["matin_lieu", "matin_h", "aprem_lieu", "aprem_h", "soir_lieu", "soir_h", "notes", "hotel_id"];
const BUDGET_FIELDS = ["description", "categorie", "total", "personne"];
const pick = (obj: Json, keys: string[]) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keys.includes(k)));

async function dayIdFor(date: string): Promise<string> {
  const { data, error } = await sb.from("planning").select("id").eq("date_voyage", date).limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error(`Aucune journée ${date} dans le planning (voyage du 2026-11-09 au 2026-11-22).`);
  return data[0].id;
}

async function runTool(name: string, input: Json, changes: string[]): Promise<string> {
  switch (name) {
    case "chercher_cerveau": {
      const { data, error } = await sb.rpc("chercher_cerveau", {
        q: String(input.q || ""),
        v: input.ville ? String(input.ville) : null,
        lim: Number(input.limite || 12),
      });
      if (error) throw error;
      if (!data?.length) return "Rien dans le cerveau pour cette recherche.";
      return JSON.stringify(
        data.map((c: Json) => ({
          id: c.id, titre: c.titre, auteur: c.auteur, source: c.source, url: c.url, ville: c.ville,
          lieu: c.lieu_nom, adresse: c.adresse, adresse_cn: c.adresse_cn, categorie: c.categorie,
          rubrique: c.rubrique, resume: c.resume, prix: c.prix_texte, duree: c.duree, moment: c.meilleur_moment,
          tags: c.tags, confiance: c.confiance, sur_carte: !!c.lat, deja_dans_app: !!c.item_id,
          transcription: c.transcription ? String(c.transcription).slice(0, 1200) : undefined,
        })),
      );
    }
    case "ajouter_lieu": {
      const row: Json = {
        type: input.type, nom: input.nom, ville: input.ville || "", quartier: input.quartier || "",
        description: input.description || "", adresse: input.adresse || "", adresse_cn: input.adresse_cn || "",
        prix: input.prix || 0, prix_type: input.moment || "", duree: input.duree || "",
        priorite: input.priorite || "", statut: "idee", notes: input.notes || "", fait: false,
        matis: 0, lise: 0, lat: input.lat ?? null, lng: input.lng ?? null,
      };
      if (input.cerveau_id) row.cerveau_id = input.cerveau_id;
      let geo = "";
      if (row.lat == null || row.lng == null) {
        const g = await geocode(row.ville, ...geoQueries(row));
        if (g) { row.lat = g.lat; row.lng = g.lng; geo = ` (placé sur la carte : ${g.label.split(",").slice(0, 3).join(",")})`; }
        else geo = " (adresse introuvable : position approximative au centre-ville)";
      }
      const { data, error } = await sb.from("items").insert(row).select("id").single();
      if (error) throw error;
      if (input.cerveau_id) await sb.from("cerveau").update({ item_id: data.id }).eq("id", input.cerveau_id);
      changes.push(`➕ ${input.nom}`);
      return `OK, lieu ajouté id=${data.id}${geo}`;
    }
    case "modifier_lieu": {
      const champs = pick(input.champs as Json, ITEM_FIELDS);
      if ("statut" in champs) champs.fait = champs.statut === "fait";
      if ((champs.adresse || champs.adresse_cn) && champs.lat == null) {
        const { data: cur } = await sb.from("items").select("*").eq("id", input.id).single();
        const g = await geocode(champs.ville ?? cur?.ville, ...geoQueries({ ...(cur || {}), ...champs }));
        if (g) { champs.lat = g.lat; champs.lng = g.lng; }
      }
      const { error } = await sb.from("items").update(champs).eq("id", input.id);
      if (error) throw error;
      changes.push(`✏️ lieu modifié`);
      return "OK, lieu modifié.";
    }
    case "supprimer_lieu": {
      await sb.from("planning_slots").delete().eq("item_id", input.id);
      const { error } = await sb.from("items").delete().eq("id", input.id);
      if (error) throw error;
      changes.push(`🗑️ lieu supprimé`);
      return "OK, lieu supprimé.";
    }
    case "planifier": {
      const planning_id = await dayIdFor(String(input.date));
      const { data, error } = await sb.from("planning_slots")
        .insert({ planning_id, item_id: input.item_id, periode: input.periode, heure: input.heure || null, ordre: 0 })
        .select("id").single();
      if (error) throw error;
      await sb.from("items").update({ statut: "planifie" }).eq("id", input.item_id);
      changes.push(`📅 planifié le ${input.date}${input.heure ? " à " + input.heure : ""}`);
      return `OK, créneau créé slot_id=${data.id}`;
    }
    case "deplacer_creneau": {
      const upd: Json = {};
      if (input.date) upd.planning_id = await dayIdFor(String(input.date));
      if (input.periode) upd.periode = input.periode;
      if (input.heure !== undefined) upd.heure = input.heure || null;
      const { error } = await sb.from("planning_slots").update(upd).eq("id", input.slot_id);
      if (error) throw error;
      changes.push(`🔀 créneau déplacé`);
      return "OK, créneau déplacé.";
    }
    case "retirer_du_planning": {
      const { data: slot } = await sb.from("planning_slots").select("item_id").eq("id", input.slot_id).single();
      const { error } = await sb.from("planning_slots").delete().eq("id", input.slot_id);
      if (error) throw error;
      if (slot?.item_id) {
        const { data: rest } = await sb.from("planning_slots").select("id").eq("item_id", slot.item_id);
        if (!rest?.length) await sb.from("items").update({ statut: "idee" }).eq("id", slot.item_id);
      }
      changes.push(`➖ retiré du planning`);
      return "OK, retiré du planning.";
    }
    case "modifier_jour": {
      const id = await dayIdFor(String(input.date));
      const { error } = await sb.from("planning").update(pick(input.champs as Json, DAY_FIELDS)).eq("id", id);
      if (error) throw error;
      changes.push(`🗓️ journée du ${input.date} modifiée`);
      return "OK, journée modifiée.";
    }
    case "ajouter_depense": {
      const { data, error } = await sb.from("budget").insert({
        description: input.description, categorie: input.categorie || "Autre", total: Number(input.total) || 0,
        personne: input.personne || "les deux", source: "assistant",
      }).select("id").single();
      if (error) throw error;
      changes.push(`💸 ${input.description} ${input.total}€`);
      return `OK, dépense ajoutée id=${data.id}`;
    }
    case "modifier_depense": {
      const { error } = await sb.from("budget").update(pick(input.champs as Json, BUDGET_FIELDS)).eq("id", input.id);
      if (error) throw error;
      changes.push(`💸 dépense modifiée`);
      return "OK, dépense modifiée.";
    }
    case "supprimer_depense": {
      const { error } = await sb.from("budget").delete().eq("id", input.id);
      if (error) throw error;
      changes.push(`💸 dépense supprimée`);
      return "OK, dépense supprimée.";
    }
    case "geocoder": {
      const g = await geocode(input.ville, String(input.requete));
      return g ? JSON.stringify(g) : "Introuvable sur OpenStreetMap.";
    }
    default:
      throw new Error(`Outil inconnu: ${name}`);
  }
}

// ───────────────────────── Snapshot compact du voyage ─────────────────────────
async function snapshot(): Promise<string> {
  const [planning, items, slots, budget] = await Promise.all([
    sb.from("planning").select("*").order("date_voyage"),
    sb.from("items").select("id,type,nom,ville,quartier,description,adresse,prix,prix_type,duree,priorite,statut,notes,lat,lng"),
    sb.from("planning_slots").select("id,planning_id,item_id,periode,heure"),
    sb.from("budget").select("id,description,categorie,total,personne"),
  ]);
  const its = items.data || [];
  const byId = new Map(its.map((i: Json) => [i.id, i]));
  const days = (planning.data || []).map((d: Json) => ({
    date: d.date_voyage, jour: d.jour_label,
    matin: [d.matin_lieu, d.matin_h].filter(Boolean).join(" "),
    aprem: [d.aprem_lieu, d.aprem_h].filter(Boolean).join(" "),
    soir: [d.soir_lieu, d.soir_h].filter(Boolean).join(" "),
    hotel: (byId.get(d.hotel_id) as Json | undefined)?.nom,
    notes: d.notes || undefined,
    creneaux: (slots.data || []).filter((s: Json) => s.planning_id === d.id).map((s: Json) => ({
      slot_id: s.id, item_id: s.item_id, nom: (byId.get(s.item_id) as Json | undefined)?.nom, periode: s.periode, heure: s.heure,
    })),
  }));
  const vital = its.filter((i: Json) => i.type === "hotel" || i.type === "transport").map((i: Json) =>
    i.type === "hotel"
      ? { id: i.id, type: "hotel", nom: i.nom, ville: i.ville, checkin: i.adresse, nuits: i.prix_type, prix: i.prix }
      : { id: i.id, type: "transport", nom: i.nom, mode: i.prix_type, date: i.adresse, depart: i.quartier, arrivee: i.description, prix: i.prix, infos: String(i.notes || "").replace(/(DEP|ARR)_(LAT|LNG):[^|]*\|?/g, "") }
  );
  const lieux = its.filter((i: Json) => !["hotel", "transport"].includes(String(i.type))).map((i: Json) => ({
    id: i.id, type: i.type, nom: i.nom, ville: i.ville, quartier: i.quartier || undefined, prix: i.prix || undefined,
    duree: i.duree || undefined, moment: i.prix_type || undefined, priorite: i.priorite || undefined, statut: i.statut || "idee",
    sur_carte: !!(i.lat && i.lng),
  }));
  const b = budget.data || [];
  const total = b.reduce((s: number, x: Json) => s + (Number(x.total) || 0), 0);
  return JSON.stringify({
    jours: days, vital, lieux,
    budget: { total_depense: Math.round(total), nb_lignes: b.length, dernieres: b.slice(-15) },
  });
}

async function history(): Promise<Anthropic.Beta.BetaMessageParam[]> {
  // Derniers échanges avec l'assistant pour la mémoire de conversation (texte seulement).
  const { data } = await sb.from("chat_messages").select("author,content,created_at")
    .order("created_at", { ascending: false }).limit(30);
  const msgs = (data || []).reverse().filter((m: Json) => {
    const c = String(m.content || "");
    return m.author === "bot" ? c.startsWith("🧠") : /^(@ia|@claude|\/ia)\b/i.test(c);
  }).slice(-10);
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of msgs) {
    const role = m.author === "bot" ? "assistant" : "user";
    const text = String(m.content).replace(/\|\|REACT:.*$/, "");
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].content += "\n" + text;
    } else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop(); // la question courante est ajoutée à part
  return out;
}

// ───────────────────────── Handler ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const secret = Deno.env.get("APP_SECRET");
  // Sans secret configuré on refuse tout : un oubli ne doit pas ouvrir l'accès aux crédits API.
  if (!secret || req.headers.get("x-app-secret") !== secret) return json({ error: "Code assistant invalide" }, 401);

  let body: Json;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const question = String(body.question || "").trim();
  const user = String(body.user || "quelqu'un");
  if (!question) return json({ error: "Question vide" }, 400);
  const changes: string[] = [];

  const nowChina = new Date().toLocaleString("fr-FR", { timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "short" });
  const [snap, hist] = await Promise.all([snapshot(), history()]);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...hist,
    {
      role: "user",
      content: [
        { type: "text", text: `<etat_voyage>\n${snap}\n</etat_voyage>` },
        { type: "text", text: `Maintenant en Chine : ${nowChina}.\n${user} demande : ${question}` },
      ],
    },
  ];

  try {
    let final: Anthropic.Beta.BetaMessage | null = null;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // deno-lint-ignore no-explicit-any
      const params: any = {
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      };
      const res = await anthropic.beta.messages.create(params);
      final = res;

      if (res.stop_reason === "refusal") break;
      if (res.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: res.content }); continue; }
      if (res.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      await Promise.all(res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use").map(async (b) => {
        try {
          results.push({ type: "tool_result", tool_use_id: b.id, content: await runTool(b.name, b.input as Json, changes) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: b.id, content: `Erreur: ${(e as Error).message}`, is_error: true });
        }
      }));
      messages.push({ role: "user", content: results });
    }

    let reply = final?.stop_reason === "refusal"
      ? "Je ne peux pas répondre à ça."
      : (final?.content || []).filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!reply) reply = changes.length ? "C'est fait." : "Je n'ai pas réussi à répondre, réessaie.";
    const content = "🧠 " + reply;
    await sb.from("chat_messages").insert({ author: "bot", content });
    return json({ reply: content, changes });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : (e as Error).message;
    console.error(msg);
    await sb.from("chat_messages").insert({ author: "bot", content: "🧠 ⚠️ Assistant indisponible : " + msg });
    return json({ error: msg, changes }, 500);
  }
});
