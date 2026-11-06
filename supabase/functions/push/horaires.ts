// ═══════════════════════════════════════════════════════════════
// Horaires des rappels « à l'heure près » (escale d'Helsinki, résas avec une heure). Fonctions pures, sans base ni réseau :
// elles sont testées par horaires.test.ts. Le plan d'escale reprend celui de prog.js (escalePlan) : si l'un change, changer l'autre.
//
// Les heures des vols sont des heures MURALES du lieu (départ = heure du départ, arrivée = heure d'arrivée), comme dans l'app.
// Pour l'escale, arrivée et départ suivant sont tous les deux à Helsinki : on les compare directement, puis on convertit en
// instant réel avec le fuseau d'Helsinki (heure d'hiver UTC+2 en novembre, mais calculée par Intl, pas écrite en dur).
// ═══════════════════════════════════════════════════════════════

export const TZ_HELSINKI = "Europe/Helsinki";
export const TZ_CHINE = "Asia/Shanghai";
export const ESCALE_LONGUE_MIN = 330;   // comme dans prog.js

export type Evt = { ts: number; cle: string; titre: string; corps: string; tag: string; onglet: string };

// « 10:45 », « 10h45 », « 6h50 », « 20h » → minutes depuis minuit ; null si illisible.
export const toMin = (h: unknown): number | null => {
  const m = String(h ?? "").trim().match(/^(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
  return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null;
};
// Minutes → « 13h10 » (modulo 24 h).
export const hm = (m: number): string => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
};

// Décalage (ms) du fuseau `tz` à l'instant UTC `utcMs`.
export function decalageMs(tz: string, utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  const commeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return commeUtc - (utcMs - (utcMs % 1000 + 1000) % 1000);
}
// Heure murale (exprimée comme des ms « naïves » : Date.UTC de la date et de l'heure lues sur l'horloge) → instant réel.
export function murVersUtc(murMs: number, tz: string): number {
  let utc = murMs;
  for (let i = 0; i < 3; i++) utc = murMs - decalageMs(tz, utc);
  return utc;
}
const jourMs = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };

// ── Vols → escales d'Helsinki ───────────────────────────────────
export type Transport = { nom?: string | null; adresse?: string | null; quartier?: string | null; description?: string | null };
type Leg = { dep: number; arr: number; depNom: string; arrNom: string };   // minutes « naïves » (jours depuis 1970 × 1440 + minutes)

function noms(nom: string | null | undefined) {
  const parts = String(nom || "").split(/\s*(?:→|->|—|–|↔|=>)\s*/).map((x) => x.trim()).filter(Boolean);
  return { dep: parts[0] || "", arr: parts[parts.length - 1] || "" };
}
export function legsDe(items: Transport[]): Leg[] {
  return items
    .filter((t) => /^\d{4}-\d\d-\d\d$/.test(t.adresse || "") && toMin(t.quartier) != null)
    .map((t) => {
      const base = jourMs(t.adresse!) / 60000, dep = base + toMin(t.quartier)!;
      const arrM = toMin(t.description);
      let arr = arrM == null ? dep + 120 : base + arrM;
      if (arr <= dep) arr += 1440;          // arrivée avant le départ = lendemain (comme l'app)
      const n = noms(t.nom);
      return { dep, arr, depNom: n.dep, arrNom: n.arr };
    })
    .sort((a, b) => a.dep - b.dep);
}
// Chaque arrivée à Helsinki suivie d'un départ d'Helsinki : { de, a } en minutes naïves.
export function escalesHelsinki(items: Transport[]): { de: number; a: number }[] {
  const legs = legsDe(items), out: { de: number; a: number }[] = [];
  for (const l of legs) {
    if (!/helsinki/i.test(l.arrNom)) continue;
    const suivant = legs.find((x) => x.dep >= l.arr && /helsinki/i.test(x.depNom));
    if (suivant) out.push({ de: l.arr, a: suivant.dep });
  }
  return out;
}

// ── Plan d'escale : quand dire quoi ─────────────────────────────
// `de` / `a` en minutes naïves (heure d'Helsinki). Les instants sortent en ms UTC.
export function evenementsEscale(de: number, a: number): Evt[] {
  const dureeMin = a - de;
  if (dureeMin < 60) return [];
  const cle = (k: string) => `esc:${a}:${k}`;
  const e = (min: number, k: string, titre: string, corps: string): Evt => ({
    ts: murVersUtc(min * 60000, TZ_HELSINKI), cle: cle(k), titre, corps, tag: `escale-${k}`, onglet: "",
  });
  const out: Evt[] = [];
  if (dureeMin >= ESCALE_LONGUE_MIN) {
    const retour = a - 210;   // être à la gare centrale
    out.push(
      e(de, "atterri", "🛬 Helsinki : ville ou aéroport ?",
        `En ville seulement si l'avion a atterri avant ${hm(de + 30)}, sans neige ni verglas, et si vous tenez debout. Sinon on reste à l'aéroport.`),
      e(de + 131, "repartir", "🚶 C'est l'heure de repartir",
        `Retour à pied vers la gare centrale (12 à 15 min), sans vous arrêter. Train pour l'aéroport vers ${hm(retour + 10)}.`),
      e(retour, "gare", "🚉 À la gare centrale, maintenant",
        `Train pour l'aéroport vers ${hm(retour + 10)}. Dernier délai absolu : ${hm(retour + 30)}. Vol à ${hm(a)}.`),
      e(retour + 22, "dernier", "⚠️ Dernier train pour l'aéroport",
        `Si vous n'êtes pas encore dans le train, c'est maintenant (dernier délai ${hm(retour + 30)}). Déjà dedans : ignorez. Vol à ${hm(a)}.`),
      e(a - 160, "aeroport", "🛂 Aéroport : passeport puis sécurité",
        `Contrôle de passeport (hors Schengen) puis sécurité : 15 à 30 min de file chacun. Vol à ${hm(a)}.`),
    );
  } else {
    out.push(e(de, "atterri", "🛬 Escale à Helsinki",
      `Vol à ${hm(a)}. Restez dans l'aéroport, embarquement à ${hm(a - 45)}.`));
  }
  if (a - 95 > de + 10) out.push(e(a - 95, "porte", "🚪 Direction la porte d'embarquement",
    `Repérez la porte sur la carte d'embarquement ou les écrans. Embarquement à ${hm(a - 45)}.`));
  out.push(e(a - 45, "embarquement", "✈️ Embarquement",
    `La porte ferme à ${hm(a - 15)}. Vol à ${hm(a)}.`));
  return out;
}

// ── Résas avec une heure (spectacle…) : 2 h avant et 30 min avant, heure de Chine ──
export type Resa = { id: string; titre: string; jour: string | null; heure: string | null; ou?: string | null };
export function evenementsResa(r: Resa): Evt[] {
  const min = toMin(r.heure);
  if (!r.jour || min == null || !/^\d{4}-\d\d-\d\d$/.test(r.jour)) return [];
  const debut = murVersUtc(jourMs(r.jour) + min * 60000, TZ_CHINE);
  const quoi = `${r.titre} à ${hm(min)}${r.ou ? " · " + String(r.ou).slice(0, 60) : ""}`;
  return [
    { ts: debut - 120 * 60000, cle: `resa:${r.id}:${r.jour}:${r.heure}:2h`, titre: "🎟️ Dans 2 h", corps: quoi, tag: `resa-${r.id}`, onglet: "areserver" },
    { ts: debut - 30 * 60000, cle: `resa:${r.id}:${r.jour}:${r.heure}:30`, titre: "🎟️ Dans 30 min", corps: quoi, tag: `resa-${r.id}`, onglet: "areserver" },
  ];
}
