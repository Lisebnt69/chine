// Test des horaires : `node --experimental-strip-types supabase/functions/push/horaires.test.ts` (ou deno test).
import assert from "node:assert/strict";
import { escalesHelsinki, evenementsEscale, evenementsResa, hm, murVersUtc, toMin, TZ_CHINE, TZ_HELSINKI } from "./horaires.ts";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

// Lecture des heures
assert.equal(toMin("6h50"), 410); assert.equal(toMin("20h"), 1200); assert.equal(toMin("00h30"), 30); assert.equal(toMin("10:45"), 645);
assert.equal(toMin("n'importe quoi"), null); assert.equal(hm(790), "13h10"); assert.equal(hm(1500), "1h00");

// Fuseaux : Helsinki = UTC+2 en novembre (heure d'hiver depuis le 25 octobre 2026), Shanghai = UTC+8
assert.equal(iso(murVersUtc(Date.UTC(2026, 10, 8, 10, 45), TZ_HELSINKI)), "2026-11-08T08:45Z");
assert.equal(iso(murVersUtc(Date.UTC(2026, 10, 16, 20, 0), TZ_CHINE)), "2026-11-16T12:00Z");
// … et l'heure d'été existe bien (UTC+3) : le calcul n'est pas figé à +2
assert.equal(iso(murVersUtc(Date.UTC(2026, 6, 1, 12, 0), TZ_HELSINKI)), "2026-07-01T09:00Z");

// Les quatre vols du voyage (noms et formats comme dans la base)
const vols = [
  { nom: "Paris → Helsinki", adresse: "2026-11-08", quartier: "06:50", description: "10:45" },
  { nom: "Helsinki → Shanghai", adresse: "2026-11-08", quartier: "16:40", description: "07:40" },
  { nom: "Shanghai → Helsinki", adresse: "2026-11-22", quartier: "08:40", description: "12:55" },
  { nom: "Helsinki -> Paris", adresse: "2026-11-22", quartier: "16:05", description: "18:15" },
  { nom: "Train Shanghai → Chongqing", adresse: "2026-11-10", quartier: "09:00", description: "20:00" },
];
const escales = escalesHelsinki(vols);
assert.equal(escales.length, 2, "deux escales : aller et retour");
assert.equal(escales[0].a - escales[0].de, 355, "aller : 10h45 → 16h40 = 5 h 55");
assert.equal(escales[1].a - escales[1].de, 190, "retour : 12h55 → 16h05 = 3 h 10 (comme le README)");

// Aller : le plan complet, avec les heures d'Helsinki
const aller = evenementsEscale(escales[0].de, escales[0].a);
const parTag = Object.fromEntries(aller.map((e) => [e.tag, e]));
assert.deepEqual(aller.map((e) => e.tag), ["escale-atterri", "escale-repartir", "escale-gare", "escale-dernier", "escale-aeroport", "escale-porte", "escale-embarquement"]);
assert.equal(iso(parTag["escale-atterri"].ts), "2026-11-08T08:45Z", "10h45 à Helsinki");
assert.equal(iso(parTag["escale-repartir"].ts), "2026-11-08T10:56Z", "12h56 : repartir vers la gare");
assert.equal(iso(parTag["escale-gare"].ts), "2026-11-08T11:10Z", "13h10 : à la gare");
assert.equal(iso(parTag["escale-aeroport"].ts), "2026-11-08T12:00Z", "14h00 : passeport");
assert.equal(iso(parTag["escale-embarquement"].ts), "2026-11-08T13:55Z", "15h55 : embarquement");
assert.match(parTag["escale-gare"].corps, /13h20/, "train de 13h20");
assert.match(parTag["escale-gare"].corps, /16h40/, "vol de 16h40");
assert.match(parTag["escale-embarquement"].corps, /16h25/, "la porte ferme à 16h25");
assert.ok(aller.every((e, i) => i === 0 || e.ts >= aller[i - 1].ts), "dans l'ordre du temps");
assert.equal(new Set(aller.map((e) => e.cle)).size, aller.length, "clés uniques");

// Retour : escale courte, pas de ville
const retour = evenementsEscale(escales[1].de, escales[1].a);
assert.deepEqual(retour.map((e) => e.tag), ["escale-atterri", "escale-porte", "escale-embarquement"]);
assert.equal(iso(retour[2].ts), "2026-11-22T13:20Z", "15h20 Helsinki = 13h20 UTC");
assert.ok(!retour.some((e) => /gare/i.test(e.titre)), "pas de balade en ville au retour");

// Escale trop courte : rien
assert.deepEqual(evenementsEscale(0, 50), []);
// Pas d'escale sans vol suivant
assert.deepEqual(escalesHelsinki([vols[0]]), []);

// Résa : le spectacle de Furong, 20h le 16 novembre (heure de Chine)
const spectacle = evenementsResa({ id: "x", titre: "Spectacle du soir à Furong", jour: "2026-11-16", heure: "20h", ou: "Furong" });
assert.equal(iso(spectacle[0].ts), "2026-11-16T10:00Z", "dans 2 h = 18h en Chine = 10h UTC");
assert.equal(iso(spectacle[1].ts), "2026-11-16T11:30Z", "dans 30 min = 19h30 en Chine");
assert.equal(spectacle[0].corps, "Spectacle du soir à Furong à 20h00 · Furong");
// Navette à 00h30 le 20 : le rappel de 2 h tombe le 19 au soir
const navette = evenementsResa({ id: "n", titre: "Navette", jour: "2026-11-20", heure: "00h30" });
assert.equal(iso(navette[0].ts), "2026-11-19T14:30Z", "22h30 le 19 en Chine");
// Données incomplètes : rien, sans planter
assert.deepEqual(evenementsResa({ id: "z", titre: "?", jour: null, heure: "20h" }), []);
assert.deepEqual(evenementsResa({ id: "z", titre: "?", jour: "2026-11-16", heure: "soir" }), []);

console.log("horaires : tout passe");

// ── Vols ──
import { evenementsVols, estUnVol, fuseauDeVille, TZ_PARIS } from "./horaires.ts";
assert.equal(fuseauDeVille("Paris CDG"), TZ_PARIS); assert.equal(fuseauDeVille("Shanghai Pudong"), TZ_CHINE); assert.equal(fuseauDeVille("Helsinki"), TZ_HELSINKI);
assert.equal(fuseauDeVille("Tokyo"), null, "ville inconnue : on ne devine pas le fuseau");

const avion = (nom: string, adresse: string, quartier: string, description: string) =>
  ({ nom, adresse, quartier, description, prix_type: "✈️ Vol", notes: "" });
const lesVols = [
  avion("Paris → Helsinki", "2026-11-08", "06:50", "10:45"),
  avion("Helsinki → Shanghai", "2026-11-08", "16:40", "07:40"),
  avion("Shanghai → Helsinki", "2026-11-22", "08:40", "12:55"),
  avion("Helsinki → Paris", "2026-11-22", "16:05", "18:15"),
  { nom: "Train Paris → Lyon", adresse: "2026-11-22", quartier: "20:39", description: "22:50", prix_type: "🚄 TGV", notes: "" },
  avion("Shanghai → Chongqing", "2026-11-10", "10:00", "12:30"),
];
assert.ok(estUnVol(lesVols[0]) && !estUnVol(lesVols[4]));
const evts = evenementsVols(lesVols, escales.map((x) => x.a));
const tags = (m: string) => evts.filter((e) => e.cle.includes(m));
// 3 vols seulement : les deux départs d'Helsinki sont déjà dans le plan d'escale, et le train n'est pas un vol
assert.equal(evts.length, 12, "3 vols × 4 rappels");
// Paris → Helsinki, 6h50 heure de Paris (UTC+1) : prévenu 4 h avant, à l'aéroport 3 h avant
const paris = evts.filter((e) => e.corps.includes("Paris → Helsinki"));
assert.equal(iso(paris[0].ts), "2026-11-08T01:50Z", "2h50 à Paris");
assert.equal(iso(paris[1].ts), "2026-11-08T02:50Z", "3h50 à Paris : à l'aéroport");
assert.match(paris[0].corps, /3h50/, "être à l'aéroport à 3h50");
assert.equal(iso(evts.find((e) => e.tag.startsWith("vol-embarquement") && e.corps.includes("6h50"))!.ts), "2026-11-08T05:05Z", "6h05 à Paris");
// Shanghai → Helsinki, 8h40 heure de Chine (UTC+8)
const retourCN = evts.filter((e) => e.corps.includes("Shanghai → Helsinki"));
assert.equal(iso(retourCN[0].ts), "2026-11-21T20:40Z", "4h40 en Chine = 20h40 UTC la veille");
// Vol intérieur en Chine : 2 h d'avance seulement
const interieur = evts.filter((e) => e.corps.includes("Chongqing"));
assert.equal(iso(interieur[0].ts), "2026-11-09T23:00Z", "dans 3 h : 7h en Chine = 23h UTC la veille");
assert.equal(iso(interieur[1].ts), "2026-11-10T00:00Z", "à l'aéroport 2 h avant : 8h en Chine");
assert.match(interieur[0].titre, /3 h/); assert.match(paris[0].titre, /4 h/);
// Pas de doublon avec l'escale
assert.ok(!evts.some((e) => e.corps.includes("Helsinki → Shanghai") || e.corps.includes("Helsinki → Paris")));
// … mais sans escale connue, un départ d'Helsinki reste couvert
assert.equal(evenementsVols([lesVols[1]], []).length, 4);
assert.equal(new Set(evts.map((e) => e.cle)).size, evts.length, "clés uniques");

console.log("vols : tout passe");

// ── Trains ──
import { estUnTrain, evenementsTrains } from "./horaires.ts";
const train = (nom: string, adresse: string, quartier: string, prix_type: string) => ({ nom, adresse, quartier, description: "", prix_type, notes: "" });
const rails = [
  train("Train Paris → Lyon", "2026-11-22", "20:39", "🚄 TGV"),
  train("Shanghai → Chongqing", "2026-11-10", "09:00", "🚄 Train"),
  train("Métro ligne 2", "2026-11-10", "09:00", "🚇 Métro"),
  train("Taxi vers l'hôtel", "2026-11-10", "09:00", "🚕 Taxi"),
  avion("Paris → Helsinki", "2026-11-08", "06:50", "10:45"),
  train("Train Tokyo → Kyoto", "2026-11-10", "09:00", "🚄 Train"),
];
assert.ok(estUnTrain(rails[0]) && estUnTrain(rails[1]) && !estUnTrain(rails[2]) && !estUnTrain(rails[3]) && !estUnTrain(rails[4]));
const tr = evenementsTrains(rails);
assert.equal(tr.length, 6, "2 trains × 3 rappels (métro, taxi, avion et ville inconnue exclus)");
// Paris → Lyon, 20h39 heure de Paris (UTC+1) : partir à 19h39, gare à 20h09, quai à 20h24
const lyon = tr.filter((e) => e.corps.includes("Paris → Lyon"));
assert.deepEqual(lyon.map((e) => iso(e.ts)), ["2026-11-22T18:39Z", "2026-11-22T19:09Z", "2026-11-22T19:24Z"]);
assert.match(lyon[0].corps, /20h09/, "être à la gare à 20h09");
// Shanghai → Chongqing, 9h00 heure de Chine : partir 7h30, gare 8h00 (grande gare : 1 h), quai 8h45
const cq = tr.filter((e) => e.corps.includes("Chongqing"));
assert.deepEqual(cq.map((e) => iso(e.ts)), ["2026-11-09T23:30Z", "2026-11-10T00:00Z", "2026-11-10T00:45Z"]);
assert.equal(new Set(tr.map((e) => e.cle)).size, tr.length, "clés uniques");
// Un vol n'est jamais compté deux fois
assert.equal(evenementsVols(rails, []).length, 4);

console.log("trains : tout passe");
