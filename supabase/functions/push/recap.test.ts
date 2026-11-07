// `node --experimental-strip-types supabase/functions/push/recap.test.ts`
import assert from "node:assert/strict";
import { composerRecap } from "./recap.ts";

const vide = { depenses: { total: 0, matis: 0, lise: 0, deux: 0, nb: 0 }, aujourdhui: { faits: 0, total: 0 }, demain: { villes: "", transports: [], lieux: [] } };

// Journée normale
const r = composerRecap({
  depenses: { total: 87.4, matis: 24, lise: 22.4, deux: 41, nb: 6 },
  aujourdhui: { faits: 3, total: 4 },
  demain: { villes: "Chengdu → Chongqing", transports: [{ heure: "09:00", nom: "Train Chengdu → Chongqing" }],
    lieux: [{ heure: null, nom: "Sans heure" }, { heure: "14h30", nom: "Hongyadong" }, { heure: "20:00", nom: "Dîner" }] },
})!;
assert.equal(r.titre, "🌙 Récap du jour");
assert.equal(r.corps, "Aujourd'hui : 87 € dépensés (Matis 24 € · Lise 22 € · à deux 41 €), 3/4 lieux faits. Demain (Chengdu → Chongqing) : 🚄 9h00 Train Chengdu → Chongqing · 3 lieux, premier : 14h30 Hongyadong.");

// Un seul payeur : pas de détail inutile ; petite somme avec décimale française
assert.match(composerRecap({ ...vide, depenses: { total: 8.5, matis: 0, lise: 8.5, deux: 0, nb: 1 }, demain: { villes: "Shanghai", transports: [], lieux: [] } })!.corps, /^Aujourd'hui : 8,5 € dépensés\. Demain \(Shanghai\) : rien de prévu\.$/);

// Aucune dépense : on le dit (rappel de noter), et le dernier soir annonce le vol du lendemain
const veille = composerRecap({ ...vide, demain: { villes: "Shanghai", transports: [{ heure: "8h40", nom: "Shanghai → Helsinki ✈" }], lieux: [] } })!;
assert.equal(veille.corps, "Aujourd'hui : aucune dépense notée. Demain (Shanghai) : 🚄 8h40 Shanghai → Helsinki ✈.");

// Un seul lieu
assert.match(composerRecap({ ...vide, demain: { villes: "", transports: [], lieux: [{ heure: "10h", nom: "Bund" }] } })!.corps, /1 lieu, le seul : 10h00 Bund/);
// Lieu sans heure : pas de « : » qui traîne
assert.match(composerRecap({ ...vide, demain: { villes: "", transports: [], lieux: [{ heure: null, nom: "Bund" }] } })!.corps, /1 lieu, le seul : Bund/);

// Rien à dire : pas de notif
assert.equal(composerRecap(vide), null);
// Texte long : coupé, jamais plus de 230 caractères
const long = composerRecap({ ...vide, demain: { villes: "A".repeat(300), transports: [], lieux: [] } })!;
assert.ok(long.corps.length <= 230 && long.corps.endsWith("…"));
console.log("recap : tout passe");
