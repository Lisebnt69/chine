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
