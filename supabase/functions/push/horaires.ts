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
export const TZ_PARIS = "Europe/Paris";
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
export type Transport = {
  nom?: string | null; adresse?: string | null; quartier?: string | null; description?: string | null;
  prix_type?: string | null; notes?: string | null;
};
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

// ── Vols : partir, être à l'aéroport, la porte, l'embarquement ──
// Fuseau de la ville de départ, deviné d'après son nom. Inconnu = on ne dit rien plutôt que de se tromper d'heure.
const VILLES_CN = /shanghai|chongqing|chengdu|wulong|furong|zhangjiajie|beijing|p[ée]kin|xi.?an|hong.?kong|guilin|hangzhou|suzhou/i;
const VILLES_FR = /paris|lyon|marseille|nice|bordeaux|toulouse|lille|nantes|strasbourg|montpellier|orly|\bcdg\b/i;
export function fuseauDeVille(ville: string): string | null {
  if (/helsinki/i.test(ville)) return TZ_HELSINKI;
  if (VILLES_CN.test(ville)) return TZ_CHINE;
  if (VILLES_FR.test(ville)) return TZ_PARIS;
  return null;
}
// Même test que l'app pour savoir si un transport est un vol (icône ✈ ou « vol » dans le type, ou un numéro de vol dans les notes).
export const estUnVol = (t: Transport) => /vol|✈|🛫|avion/i.test(t.prix_type || "") || /(?:^|\|)\s*VOL:/i.test(t.notes || "");

// `escalesA` : les départs d'Helsinki déjà couverts par le plan d'escale (minutes naïves de legsDe) : pas de doublon.
export function evenementsVols(items: Transport[], escalesA: number[] = []): Evt[] {
  const out: Evt[] = [];
  for (const t of items) {
    if (!estUnVol(t) || !/^\d{4}-\d\d-\d\d$/.test(t.adresse || "")) continue;
    const min = toMin(t.quartier);
    if (min == null) continue;
    const n = noms(t.nom);
    const tz = fuseauDeVille(n.dep);
    if (!tz) continue;
    const dep = jourMs(t.adresse!) / 60000 + min;
    if (/helsinki/i.test(n.dep) && escalesA.includes(dep)) continue;
    const interieur = VILLES_CN.test(n.dep) && VILLES_CN.test(n.arr);
    const avance = interieur ? 120 : 180;   // comme l'onglet Pratique : 3 h en international, 2 h en intérieur
    const nom = t.nom || "Vol";
    const e = (avantMin: number, k: string, titre: string, corps: string): Evt => ({
      ts: murVersUtc((dep - avantMin) * 60000, tz), cle: `vol:${dep}:${k}`, titre, corps, tag: `vol-${k}-${dep}`, onglet: "transport",
    });
    out.push(
      e(avance + 60, "partir", `✈️ Dans ${(avance + 60) / 60} h : on se prépare`,
        `${nom} à ${hm(min)}. Soyez à l'aéroport à ${hm(min - avance)} : partez à temps pour y être.`),
      e(avance, "aeroport", "🧳 À l'aéroport maintenant",
        `Dépôt des bagages et enregistrement. ${nom} à ${hm(min)}. Passeport et carte d'embarquement en main.`),
      e(95, "porte", "🚪 Direction la porte d'embarquement",
        `Passeport et sécurité passés ? Repérez la porte sur les écrans. Embarquement à ${hm(min - 45)}.`),
      e(45, "embarquement", "✈️ Embarquement",
        `La porte ferme à ${hm(min - 15)}. Vol à ${hm(min)}.`),
    );
  }
  return out;
}

// ── Trains : partir pour la gare, la gare, le quai ──
// Un positif est exigé (icône ou mot de train) : l'app met 🚄 par défaut, donc un métro ou un taxi sans type ne doit pas passer.
export const estUnTrain = (t: Transport) =>
  !estUnVol(t) && /🚄|🚅|🚆|🚂|train|tgv|ouigo|\bTER\b|grande vitesse|high.?speed/i.test(`${t.prix_type || ""} ${t.nom || ""}`);

export function evenementsTrains(items: Transport[]): Evt[] {
  const out: Evt[] = [];
  for (const t of items) {
    if (!estUnTrain(t) || !/^\d{4}-\d\d-\d\d$/.test(t.adresse || "")) continue;
    const min = toMin(t.quartier);
    if (min == null) continue;
    const tz = fuseauDeVille(noms(t.nom).dep);
    if (!tz) continue;
    const dep = jourMs(t.adresse!) / 60000 + min;
    const avance = tz === TZ_CHINE ? 60 : 30;   // grandes gares chinoises : contrôle des papiers et sécurité ; en France, le quai s'affiche vers -20 min
    const nom = t.nom || "Train";
    const e = (avantMin: number, k: string, titre: string, corps: string): Evt => ({
      ts: murVersUtc((dep - avantMin) * 60000, tz), cle: `train:${dep}:${k}`, titre, corps, tag: `train-${k}-${dep}`, onglet: "transport",
    });
    out.push(
      e(avance + 30, "partir", "🚄 Départ pour la gare",
        `${nom} à ${hm(min)}. Soyez à la gare à ${hm(min - avance)} : partez à temps pour y être.`),
      e(avance, "gare", "🚉 À la gare maintenant",
        `${tz === TZ_CHINE ? "Contrôle des papiers et sécurité, puis repérez votre salle d'attente. Passeport et billet prêts. " : "Repérez la voie sur les écrans. "}${nom} à ${hm(min)}.`),
      e(15, "quai", "🚪 Direction le quai",
        `${nom} à ${hm(min)}. Les portiques ferment peu avant le départ ; voiture et place sont sur votre billet.`),
    );
  }
  return out;
}
