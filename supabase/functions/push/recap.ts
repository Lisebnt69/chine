// ═══════════════════════════════════════════════════════════════
// Récap du soir (21 h, heure de Chine) : fonctions pures, testées par recap.test.ts.
// Le serveur lit la base et remplit RecapIn ; ici on ne fait que composer le texte.
// ═══════════════════════════════════════════════════════════════
import { hm, toMin } from "./horaires.ts";

export type Plan = { heure: string | null; nom: string };
export type RecapIn = {
  depenses: { total: number; matis: number; lise: number; deux: number; nb: number };   // en euros, du jour (heure de Chine)
  aujourdhui: { faits: number; total: number };                                         // lieux du planning du jour
  demain: { villes: string; transports: Plan[]; lieux: Plan[] };
};

const eur = (x: number) => `${(x < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toString().replace(".", ",")} €`;
const heureDe = (h: string | null) => { const m = toMin(h); return m == null ? "" : hm(m) + " "; };
const court = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const parHeure = (a: Plan, b: Plan) => (toMin(a.heure) ?? 1e9) - (toMin(b.heure) ?? 1e9);

export function composerRecap(r: RecapIn): { titre: string; corps: string } | null {
  const d = r.depenses;
  let jour: string;
  if (d.nb > 0) {
    const parts = [d.matis > 0 && `Matis ${eur(d.matis)}`, d.lise > 0 && `Lise ${eur(d.lise)}`, d.deux > 0 && `à deux ${eur(d.deux)}`].filter(Boolean) as string[];
    jour = `${eur(d.total)} dépensés${parts.length > 1 ? ` (${parts.join(" · ")})` : ""}`;
  } else {
    jour = "aucune dépense notée";
  }
  if (r.aujourdhui.total > 0) jour += `, ${r.aujourdhui.faits}/${r.aujourdhui.total} lieux faits`;

  const trans = [...r.demain.transports].sort(parHeure).map((t) => `${heureDe(t.heure)}${t.nom}`.trim());
  const lieux = [...r.demain.lieux].sort(parHeure);
  const morceaux: string[] = [];
  if (trans.length) morceaux.push(trans.map((t) => "🚄 " + t).join(" · "));
  if (lieux.length) {
    const p = lieux[0];
    morceaux.push(`${lieux.length} lieu${lieux.length > 1 ? "x" : ""}, ${lieux.length > 1 ? "premier" : "le seul"} : ${heureDe(p.heure)}${p.nom}`.replace(/ : $/, ""));
  }
  const demain = morceaux.length ? morceaux.join(" · ") : "rien de prévu";
  const ville = r.demain.villes ? ` (${r.demain.villes})` : "";

  // Rien à dire du tout : ni dépense, ni lieu aujourd'hui, ni rien demain → pas de notif pour rien.
  if (d.nb === 0 && r.aujourdhui.total === 0 && !trans.length && !lieux.length && !r.demain.villes) return null;
  return { titre: "🌙 Récap du jour", corps: court(`Aujourd'hui : ${jour}. Demain${ville} : ${demain}.`, 230) };
}
