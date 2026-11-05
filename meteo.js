/* ═══════════════════════════════════════════════════════════════
   meteo.js — Météo du voyage

   Les prévisions viennent de meteo.json, réécrit 3 fois par jour par
   .github/workflows/meteo.yml (tools/maj_meteo.py, source Open-Meteo)
   jusqu'au 22 novembre 2026. Ce fichier ne fait que les afficher :

     - une pastille (icône + température max) en haut de chaque jour du Planning ;
     - une carte « Météo » sur l'Accueil ;
     - une vue qui ne montre que la météo : aujourd'hui en grand, puis chaque jour
       du voyage avec la température, les heures de pluie et leur durée.

   Un tap sur la pastille ou sur la carte ouvre la vue. Hors ligne, la dernière
   prévision reçue reste lisible (localStorage + cache du service worker).
   Chargé AVANT accueil.js. Aucune dépendance à Supabase.
   ═══════════════════════════════════════════════════════════════ */

const MT = { data: null, cle: 'chine_meteo', charge: 0 };

/* ───────────── Lieux : quel texte du planning correspond à quelle prévision ───────────── */
const MT_VILLES = [
  ['Karst de Wulong', /wulong|karst|武隆/i],
  ['Furong', /furong|wangcun|yongshun|芙蓉/i],
  ['Zhangjiajie', /zhangjiajie|wulingyuan|tianmen|avatar|张家界/i],
  ['Chengdu', /chengdu|kuanzhai|panda|成都/i],
  ['Shanghai', /shanghai|pudong|bund|waitan|上海/i],
  ['Chongqing', /chong ?qing|hongyadong|jiefangbei|重庆|重慶/i],
];
// « Furong → Zhangjiajie » : on est arrivé à Zhangjiajie, c'est la dernière ville citée qui compte.
function mtVilleDeTexte(t) {
  t = String(t || '');
  let best = null, pos = -1;
  for (const [nom, rx] of MT_VILLES) {
    const m = rx.exec(t);
    if (m && m.index > pos) { best = nom; pos = m.index; }
  }
  return best;
}
// Une journée peut changer de ville. On lit le planning dans l'ordre (matin, après-midi, soir) :
//   - « Chengdu → Chongqing » + horaire « 21h02 → 22h17 » : on est à Chengdu jusqu'à l'arrivée,
//     à Chongqing à partir de 22 h 17 ;
//   - une seule ville qui change, sans horaire : on y est dès le début de la tranche ;
//   - aucune ville reconnue (« En vol », « Déjeuner puis… ») : on reste où l'on était.
// Avant la première ville reconnue (jour de vol depuis la France), pas de météo.
const MT_PLAGES = [[0, 12, 'matin_lieu', 'matin_h'], [12, 18, 'aprem_lieu', 'aprem_h'], [18, 24, 'soir_lieu', 'soir_h']];
function mtVillesDeTexte(t) {
  t = String(t || '');
  return MT_VILLES.map(([nom, rx]) => [nom, rx.exec(t)]).filter(([, m]) => m).sort((a, b) => a[1].index - b[1].index).map(([nom]) => nom);
}
// Heures (décimales) citées dans « 06h32 → 07h48 » ou « jusqu'à 13h30 ou 14h30 → 15h30 ».
function mtHeures(t) {
  return [...String(t || '').matchAll(/(\d{1,2})\s*h\s*(\d{2})?/g)].map(m => +m[1] + (m[2] ? +m[2] / 60 : 0));
}
function mtGroupesDuJour(day, veille) {
  const hotel = day.hotel_id && typeof D !== 'undefined' ? (D.items || []).find(x => x.id === day.hotel_id) : null;
  if (!veille && !hotel) return null; // jour de vol depuis la France : pas encore sur place
  const lieux = MT_PLAGES.map(([, , k]) => mtVillesDeTexte(day[k]));
  const cur = veille || mtVilleDeTexte(hotel && hotel.ville) || lieux.flat()[0] || null;
  if (!cur) return null;
  const ev = [{ ville: cur, from: 0 }];
  const pousse = (ville, from) => {
    if (from >= 24) return;                                   // arrivée après minuit : c'est le jour suivant
    from = Math.max(Math.ceil(from), ev[ev.length - 1].from);   // présent à partir de l'heure pleine qui suit l'arrivée
    if (ville !== ev[ev.length - 1].ville) ev.push({ ville, from });
  };
  MT_PLAGES.forEach(([s, e, , hk], i) => {
    const vs = lieux[i]; if (!vs.length) return;
    const hs = mtHeures(day[hk]), trajet = hs.length >= 2;
    const arrivee = trajet ? (hs[hs.length - 1] < hs[0] ? 24 : hs[hs.length - 1]) : null; // « 22h25 → 00h30 » : demain
    if (vs.length >= 2) {
      pousse(vs[0], s);
      pousse(vs[vs.length - 1], arrivee != null ? arrivee : (s + e) / 2);
    } else {
      pousse(vs[0], arrivee != null ? arrivee : s);
    }
  });
  const out = [];
  ev.forEach((x, j) => {
    const h1 = j + 1 < ev.length ? ev[j + 1].from : 24;
    if (h1 > x.from) out.push({ ville: x.ville, h0: out.length ? x.from : 0, h1 });
  });
  return out;
}
function mtJoursVoyage() {
  const out = []; let veille = null;
  for (const day of sortedDays()) {
    const groupes = mtGroupesDuJour(day, veille);
    if (!groupes) continue;
    veille = groupes[groupes.length - 1].ville;
    groupes.forEach(g => { g.rec = mtRecHeures(g.ville, day.date_voyage, g.h0, g.h1); });
    const main = groupes.find(g => g.h0 <= 15 && g.h1 > 15) || groupes[0]; // l'après-midi résume la journée
    out.push({ date: day.date_voyage, ville: main.ville, rec: main.rec, groupes });
  }
  return out;
}
function mtRec(ville, date) {
  const l = MT.data && MT.data.lieux && MT.data.lieux[ville];
  return (l && l.find(j => j.d === date)) || null;
}
// Créneaux [début, fin[ où il pleut (au moins 0,2 mm) ; deux averses à une heure d'écart n'en font qu'un.
function mtFenetres(p, h0, h1) {
  const out = [];
  for (let h = h0; h < h1; h++) {
    if ((p[h] || 0) >= 0.2) { const l = out[out.length - 1]; if (l && h - l[1] <= 1) l[1] = h + 1; else out.push([h, h + 1]); }
  }
  return out;
}
// Un code « bruine » ou « averses » sans aucune pluie mesurée n'est pas de la pluie : on affiche nuageux.
const MT_CODES_PLUIE = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
const mtCielSec = (c, mm) => (MT_CODES_PLUIE(c) && !(mm >= 0.2) ? 3 : c);
const mtSomme = (a, h0, h1) => Math.round(a.slice(h0, h1).reduce((s, x) => s + (x || 0), 0) * 10) / 10;
// Résumé d'une tranche d'heures [h0, h1[ dans une ville. Température et ciel sont lus sur les heures éveillées
// (7 h à 23 h) pour que la nuit ne tire pas le matin vers le bas ; la pluie, elle, est lue sur toute la tranche.
function mtRecHeures(ville, date, h0, h1) {
  const b = mtRec(ville, date); if (!b) return null;
  if (!b.t || !b.c || !b.p) return b;       // ancien meteo.json sans heures : résumé du jour
  if (h0 <= 0 && h1 >= 24) return { ...b, code: b.h ? b.code : mtCielSec(b.code, 0) }; // journée entière : extrêmes du jour tels quels
  const a = Math.max(h0, 7), z = Math.min(h1, 23), v0 = a < z ? a : h0, v1 = a < z ? z : h1;
  const t = b.t.slice(v0, v1), c = b.c.slice(v0, v1), f = mtFenetres(b.p, h0, h1);
  return { ...b, min: Math.min(...t), max: Math.max(...t), code: f.length ? Math.max(...c) : mtCielSec(Math.max(...c), 0),
    pluie: f.length ? b.pluie : 0, mm: mtSomme(b.p, h0, h1), f, h: f.reduce((s, [x, y]) => s + y - x, 0), neige: b.s ? mtSomme(b.s, h0, h1) : 0 };
}

/* ───────────── Codes météo → icône + libellé ───────────── */
function mtCode(c, neige) {
  if (c === 0) return ['sun', 'Ensoleillé'];
  if (c === 1) return ['sun', 'Plutôt ensoleillé'];
  if (c === 2) return ['cloud-sun', 'Éclaircies'];
  if (c === 3) return ['cloud', 'Nuageux'];
  if (c === 45 || c === 48) return ['fog', 'Brouillard'];
  if (c >= 51 && c <= 55) return ['drizzle', 'Bruine'];
  if (c === 56 || c === 57) return ['rain', 'Bruine verglaçante'];
  if (c === 61) return ['drizzle', 'Pluie faible'];
  if (c === 63) return ['rain', 'Pluie'];
  if (c === 65) return ['rain', 'Forte pluie'];
  if (c === 66 || c === 67) return ['rain', 'Pluie verglaçante'];
  if (c === 71 || c === 85) return ['snow', 'Neige faible'];
  if (c === 73) return ['snow', 'Neige'];
  if (c === 75 || c === 86) return ['snow', 'Forte neige'];
  if (c === 77) return ['snow', 'Grains de neige'];
  if (c === 80) return ['drizzle', 'Averses faibles'];
  if (c === 81) return ['rain', 'Averses'];
  if (c === 82) return ['rain', 'Fortes averses'];
  if (c >= 95) return ['bolt', c === 95 ? 'Orage' : 'Orage et grêle'];
  return neige ? ['snow', 'Neige'] : ['cloud', 'Variable'];
}

/* ───────────── Icônes (SVG maison, même trait que icons.js) ───────────── */
const MT_NUAGE = 'M7.5 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.6A3.2 3.2 0 0 1 17 15z';
const MT_TRACES = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  'cloud-sun': '<circle cx="7.5" cy="7.5" r="2.6"/><path d="M7.5 2.5v1M2.5 7.5h1M4 4l.7.7M11 4l-.7.7"/><path d="M9.5 20.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.6 3.2 3.2 0 0 1-1.1 6.4z"/>',
  cloud: '<path d="M7.5 19a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.8A3.6 3.6 0 0 1 17.5 19z"/>',
  drizzle: '<path d="' + MT_NUAGE + '"/><path d="M9 18l-.6 1.8M13 18l-.6 1.8M17 18l-.6 1.8"/>',
  rain: '<path d="' + MT_NUAGE + '"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  snow: '<path d="' + MT_NUAGE + '"/><path d="M8.5 17.5v3M7 19h3M15.5 17.5v3M14 19h3"/>',
  bolt: '<path d="' + MT_NUAGE + '"/><path d="M12.8 12.5l-2.3 3.8h3l-1.5 4.2"/>',
  fog: '<path d="M4 8h13M7 12h13M4 16h10M16 16h4"/>',
};
function mtIcone(nom, px) {
  return '<svg class="gi mt-i mt-i-' + nom + '" viewBox="0 0 24 24" aria-hidden="true"' + (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '>' + (MT_TRACES[nom] || MT_TRACES.cloud) + '</svg>';
}

/* ───────────── Textes ───────────── */
const mtH = h => (h === 0 || h >= 24 ? 'minuit' : h + ' h');
const mtDuree = h => (h <= 1 ? '1 h' : h + ' h');
function mtTemp(r) { return r.min === r.max ? r.max + ' °C' : r.min + '–' + r.max + ' °C'; }
// Quand il pleut et pendant combien de temps. Renvoie { txt, pluie } (pluie = true s'il pleut ou neige).
function mtPluie(r) {
  const neige = r.neige >= 0.5, mot = neige ? 'Neige' : 'Pluie';
  if (!r.h) {
    return { pluie: false, txt: r.pluie >= 40 ? 'Pas de pluie prévue, risque de ' + r.pluie + ' %' : 'Pas de pluie prévue' };
  }
  const f = r.f.map(([a, b]) => 'de ' + mtH(a) + ' à ' + mtH(b)).join(' et ');
  const quant = neige ? Math.round(r.neige) + ' cm' : (r.mm >= 0.5 ? Math.round(r.mm) + ' mm' : 'quelques gouttes');
  // Plusieurs averses : on ajoute le total. Une seule : sa durée se lit déjà dans le créneau.
  const parts = [mot + ' ' + f, r.f.length > 1 ? mtDuree(r.h) + ' au total' : mtDuree(r.h), quant];
  return { pluie: true, txt: parts.join(' · ') };
}
function mtMajTexte() {
  if (!MT.data || !MT.data.maj) return '';
  const d = new Date(MT.data.maj); if (isNaN(d)) return '';
  const q = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(d);
  return 'Mis à jour le ' + q.replace(':', ' h ') + ' (heure de Chine)';
}

/* ───────────── Jour mis en avant : aujourd'hui, ou le premier jour avant le départ ───────────── */
function mtCible() {
  const jours = mtJoursVoyage(); if (!jours.length) return null;
  const now = chinaNow().date;
  if (now < jours[0].date) return { ...jours[0], avant: true };
  const j = jours.find(x => x.date === now);
  return j ? { ...j, avant: false } : null;
}

// « Maintenant » : la ville où l'on est à cette heure (d'après le planning) et le temps qu'il y fait
// à cette heure précise, avec la pluie à venir tant qu'on reste dans cette ville.
function mtMaintenant() {
  const c = mtCible(); if (!c) return null;
  if (c.avant) return { ...c, g: c.groupes[0], temp: null };
  const h = Math.floor(chinaNow().min / 60);
  const g = c.groupes.find(x => h >= x.h0 && h < x.h1) || c.groupes[c.groupes.length - 1];
  const b = mtRec(g.ville, c.date);
  if (!b) return { ...c, ville: g.ville, rec: null, g };
  if (!b.t || !b.c || !b.p) return { ...c, ville: g.ville, rec: g.rec, g, temp: null };
  const f = mtFenetres(b.p, h, g.h1);
  const reste = { ...b, f, h: f.reduce((s, [x, y]) => s + y - x, 0), mm: mtSomme(b.p, h, g.h1), neige: b.s ? mtSomme(b.s, h, g.h1) : 0 };
  const p = mtPluie(reste), fin = g.h1 >= 24 ? "d'ici ce soir" : "jusqu'à " + mtH(g.h1);
  const enCours = f.length && f[0][0] <= h;
  const txt = p.pluie ? (enCours ? 'Il pleut en ce moment · ' : '') + p.txt : 'Pas de pluie prévue ' + fin;
  return { ...c, ville: g.ville, rec: g.rec, g, h, temp: b.t[h], code: mtCielSec(b.c[h], b.p[h]), pluie: p.pluie, txt, neige: reste.neige };
}
// « jusqu'à 15 h », « de 15 h à 17 h », « dès 17 h » (rien si la journée entière est au même endroit).
const mtPlage = (h0, h1) => h0 <= 0 && h1 >= 24 ? '' : h0 <= 0 ? "jusqu'à " + mtH(h1) : h1 >= 24 ? 'dès ' + mtH(h0) : 'de ' + mtH(h0) + ' à ' + mtH(h1);

/* ───────────── 1. Pastille en haut de chaque jour du Planning ───────────── */
function mtBadgeHtml(e) {
  const r = e.rec; if (!r) return '';
  const [ic, lib] = mtCode(r.code, r.neige);
  const p = mtPluie(r);
  return '<button type="button" class="mt-badge" onclick="event.stopPropagation();mtOuvrir(\'' + e.date + '\')" aria-label="Météo du ' + fmtDate(e.date) + ' : ' + lib + ', ' + r.max + ' degrés' + (p.pluie ? ', pluie prévue' : '') + '. Ouvrir la météo">'
    + mtIcone(ic, 22) + '<span>' + r.max + '°</span></button>';
}
// Appelée par le gabarit du Planning. Le conteneur reste dans le DOM même sans donnée :
// mtRafraichir() le remplit dès que meteo.json arrive.
function mtBadge(day) {
  const e = mtJoursVoyage().find(j => j.date === day.date_voyage);
  return '<span class="mt-slot" data-d="' + day.date_voyage + '">' + (e ? mtBadgeHtml(e) : '') + '</span>';
}

/* ───────────── 2. Carte sur l'Accueil ───────────── */
function mtAccueil() {
  const m = mtMaintenant(); if (!m || !m.rec) return '';
  const r = m.rec, maint = !m.avant && m.temp != null;
  const [ic, lib] = maint ? mtCode(m.code, m.neige) : mtCode(r.code, r.neige);
  const p = maint ? { pluie: m.pluie, txt: m.txt } : mtPluie(r);
  const quand = m.avant ? 'Premier jour, ' + fmtDate(m.date) : 'Maintenant';
  const deg = maint ? m.temp + ' °C' : mtTemp(r);
  return '<button type="button" class="mt-home" data-act="meteo" aria-label="Ouvrir la météo du voyage">'
    + '<span class="mt-home-ic">' + mtIcone(ic, 38) + '</span>'
    + '<span class="mt-home-tx"><b>' + esc(m.ville) + ' · ' + esc(quand) + '</b>'
    + '<span>' + esc(lib) + ', ' + deg + '</span>'
    + '<em class="' + (p.pluie ? 'mt-pluie' : '') + '">' + esc(p.txt) + '</em></span>'
    + window.ic('arrow-right') + '</button>';
}

/* ───────────── 3. Vue « juste la météo » ───────────── */
function mtGroupeHtml(e, g, multi) {
  const titre = esc(g.ville) + (multi ? ' · ' + mtPlage(g.h0, g.h1) : '');
  const r = g.rec;
  if (!r) {
    const n = typeof METEO_DATA !== 'undefined' && METEO_DATA[g.ville];
    return '<div class="mt-g"><div class="mt-mid"><b>' + titre + '</b><span>Prévision pas encore publiée</span>'
      + (n ? '<em>Normale de saison : ' + n.min + '–' + n.max + ' °C</em>' : '') + '</div></div>';
  }
  const [ic, lib] = mtCode(r.code, r.neige), p = mtPluie(r);
  return '<div class="mt-g"><div class="mt-mid"><b>' + titre + '</b><span>' + esc(lib) + '</span>'
    + '<em class="' + (p.pluie ? 'mt-pluie' : '') + '">' + esc(p.txt) + '</em></div>'
    + '<div class="mt-r">' + mtIcone(ic, 30) + '<b>' + mtTemp(r) + '</b></div></div>';
}
function mtLigneHtml(e, cible) {
  const dt = new Date(e.date + 'T12:00:00');
  const jour = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), num = dt.getDate();
  const multi = e.groupes.length > 1;
  return '<div class="mt-row' + (cible ? ' cible' : '') + '" id="mt-row-' + e.date + '"><div class="mt-d"><b>' + num + '</b><span>' + jour + '</span></div>'
    + '<div class="mt-gs">' + e.groupes.map(g => mtGroupeHtml(e, g, multi)).join('') + '</div></div>';
}
function mtHeroHtml() {
  const m = mtMaintenant(); if (!m) return '';
  if (!m.rec) return '<div class="mt-hero"><div class="mt-hero-t">' + esc(m.ville) + '</div><p>Pas de prévision pour ce jour pour l\'instant.</p></div>';
  const r = m.rec, maint = !m.avant && m.temp != null;
  const [ic, lib] = maint ? mtCode(m.code, m.neige) : mtCode(r.code, r.neige);
  const p = maint ? { pluie: m.pluie, txt: m.txt } : mtPluie(r);
  const titre = m.avant ? 'Premier jour, ' + fmtDate(m.date) + ' · ' + m.ville : 'Maintenant, ' + mtH(m.h) + ' · ' + m.ville;
  const gros = maint ? m.temp : r.max, petit = maint ? (r.min === r.max ? '' : "aujourd'hui " + mtTemp(r) + ' ici') : 'minimum ' + r.min + '°';
  const neige = (maint ? m.neige : r.neige) >= 0.5;
  return '<div class="mt-hero"><div class="mt-hero-t">' + esc(titre) + '</div>'
    + '<div class="mt-hero-m">' + mtIcone(ic, 56) + '<div><strong>' + gros + '°</strong><span>' + esc(petit) + '</span></div></div>'
    + '<div class="mt-hero-l">' + esc(lib) + '</div>'
    + '<div class="mt-hero-p ' + (p.pluie ? 'mt-pluie' : '') + '">' + mtIcone(p.pluie ? (neige ? 'snow' : 'rain') : 'sun', 20) + '<span>' + esc(p.txt) + '</span></div></div>';
}
function mtVueHtml(focus) {
  const jours = mtJoursVoyage(), cible = mtCible();
  if (!MT.data) return '<p class="mt-vide">Pas encore de prévision sur ce téléphone. Elle se charge dès qu\'il y a du réseau.</p>';
  if (!jours.length) return '<p class="mt-vide">Le planning est vide : aucun jour à afficher.</p>';
  const maj = mtMajTexte();
  return (cible ? mtHeroHtml() : '')
    + '<div class="mt-sl">Tous les jours du voyage</div>'
    + '<div class="mt-list">' + jours.map(e => mtLigneHtml(e, e.date === focus)).join('') + '</div>'
    + '<p class="mt-src">' + esc(maj) + (maj ? ' · ' : '') + 'Prévisions Open-Meteo. Elles bougent : reviens voir la veille.</p>';
}
function mtOuvrir(date) {
  mtEnsureVue();
  const cible = mtCible(), focus = date || (cible && cible.date) || null;
  document.getElementById('mtBody').innerHTML = mtVueHtml(focus);
  document.getElementById('mtOverlay').dataset.focus = focus || '';
  openOverlay('mtOverlay');
  const sheet = document.querySelector('#mtOverlay .sheet'); if (sheet) sheet.scrollTop = 0;
  if (date) setTimeout(() => document.getElementById('mt-row-' + date)?.scrollIntoView({ block: 'center' }), 60);
  setTimeout(() => document.getElementById('mtClose')?.focus(), 80);
}
function mtFermer() { closeOverlay('mtOverlay'); }
function mtEnsureVue() {
  if (document.getElementById('mtOverlay')) return;
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'mtOverlay';
  o.onclick = e => { if (e.target === o) mtFermer(); };
  o.innerHTML = '<div class="sheet mt-sheet" role="dialog" aria-modal="true" aria-label="Météo du voyage">'
    + '<div class="sheet-handle"></div>'
    + '<div class="mt-top"><h2 class="sheet-title">Météo du voyage</h2><button type="button" id="mtClose" class="mt-close" aria-label="Fermer la météo" onclick="mtFermer()">' + window.ic('x') + '</button></div>'
    + '<div id="mtBody"></div></div>';
  document.body.appendChild(o);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('mtOverlay')?.classList.contains('on')) mtFermer(); });

/* ───────────── Carte « Météo novembre » du Planning : prévision réelle quand on l'a ───────────── */
function mtLigneVille(ville) {
  const c = mtCible(), date = c ? c.date : chinaNow().date;
  const r = mtRec(ville, date); if (!r) return null;
  const [ic, lib] = mtCode(r.code, r.neige);
  return { ic: mtIcone(ic, 24), desc: lib, min: r.min, max: r.max };
}

/* ───────────── Réponse du chat local ───────────── */
function mtResumeTexte() {
  const m = mtMaintenant(); if (!m || !m.rec) return '';
  if (m.avant || m.temp == null) {
    const lib = mtCode(m.rec.code, m.rec.neige)[1];
    return (m.avant ? 'Premier jour (' + fmtDate(m.date) + ')' : "Aujourd'hui") + ' à ' + m.ville + ' : ' + lib + ', ' + mtTemp(m.rec) + '. ' + mtPluie(m.rec).txt + '.';
  }
  return 'Maintenant à ' + m.ville + ' : ' + mtCode(m.code, m.neige)[1] + ', ' + m.temp + ' °C. ' + m.txt + '.';
}

/* ───────────── Chargement ───────────── */
function mtRafraichir() {
  document.querySelectorAll('.mt-slot').forEach(s => {
    const e = mtJoursVoyage().find(j => j.date === s.dataset.d);
    s.innerHTML = e ? mtBadgeHtml(e) : '';
  });
  if (typeof loadMeteo === 'function') loadMeteo();
  if (typeof acSafeRender === 'function') acSafeRender();
  const o = document.getElementById('mtOverlay');
  if (o && o.classList.contains('on')) document.getElementById('mtBody').innerHTML = mtVueHtml(o.dataset.focus || null);
}
async function mtCharger() {
  try {
    const r = await fetch('meteo.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j && j.lieux) { MT.data = j; try { localStorage.setItem(MT.cle, JSON.stringify(j)); } catch (e) { /* stockage plein */ } }
  } catch (e) {
    if (!MT.data) { try { MT.data = JSON.parse(localStorage.getItem(MT.cle) || 'null'); } catch (e2) { /* cache illisible */ } }
  }
  MT.charge = Date.now();
  try { mtRafraichir(); } catch (e) { console.warn('Météo :', e); }
}
try { MT.data = JSON.parse(localStorage.getItem(MT.cle) || 'null'); } catch (e) { MT.data = null; }
mtCharger();
// Le fichier change 3 fois par jour : on le relit au retour sur l'app s'il a plus d'une heure.
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - MT.charge > 3600000) mtCharger(); });

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
.mt-i{flex:none}
.mt-i-sun{color:#c58a1d}.mt-i-cloud-sun{color:#b8893a}.mt-i-cloud{color:#7d6b63}.mt-i-fog{color:#8f7f76}
.mt-i-drizzle,.mt-i-rain{color:#3d6f94}.mt-i-snow{color:#5b86a8}.mt-i-bolt{color:#b3202a}
.mt-slot{display:contents}
.mt-badge{display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:4px 10px 4px 8px;margin:0 6px;border:1px solid var(--border);border-radius:999px;background:#fff;font:inherit;font-size:.78rem;font-weight:700;color:var(--txt);cursor:pointer;flex:none;box-shadow:var(--shadow-sm)}
.mt-badge:active{background:var(--bg)}
.mt-badge:focus-visible,.mt-home:focus-visible,.mt-close:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mt-home{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;background:linear-gradient(180deg,#fff 0%,#fffaf4 100%);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;color:var(--txt);cursor:pointer;box-shadow:var(--shadow-sm)}
.mt-home:active{background:var(--bg)}
.mt-home-ic{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--bg);flex:none}
.mt-home-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mt-home-tx b{font-size:.74rem;font-weight:700;color:var(--txt2)}
.mt-home-tx span{font-size:.95rem;font-weight:700}
.mt-home-tx em,.mt-mid em,.mt-hero-p span{font-style:normal;font-size:.78rem;line-height:1.35;color:var(--txt2)}
.mt-home>.gi{width:20px;height:20px;color:var(--txt3)}
.mt-pluie{color:#2f5f86!important;font-weight:600}
.mt-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mt-top .sheet-title{margin-bottom:14px}
.mt-close{display:grid;place-items:center;width:44px;height:44px;margin:-6px -8px 8px 0;border:none;border-radius:50%;background:var(--bg);color:var(--txt);cursor:pointer}
.mt-hero{border:1px solid var(--or);border-radius:var(--radius);padding:14px 16px;margin-bottom:16px;background:linear-gradient(135deg,#fff8ea 0%,#fffdf8 100%)}
.mt-hero-t{font-size:.74rem;font-weight:700;color:var(--or);text-transform:uppercase;letter-spacing:.5px}
.mt-hero-m{display:flex;align-items:center;gap:14px;margin:8px 0 2px}
.mt-hero-m strong{display:block;font-size:2.4rem;line-height:1;font-weight:700}
.mt-hero-m span{font-size:.8rem;color:var(--txt2)}
.mt-hero-l{font-size:1rem;font-weight:700;margin-bottom:8px}
.mt-hero-p{display:flex;align-items:flex-start;gap:8px}
.mt-hero p{margin:6px 0 0;font-size:.86rem;color:var(--txt2)}
.mt-sl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin:4px 0 8px}
.mt-list{display:flex;flex-direction:column;gap:8px}
.mt-row{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff}
.mt-row.cible{border-color:var(--accent);box-shadow:0 0 0 2px var(--tint)}
.mt-d{display:flex;flex-direction:column;align-items:center;min-width:38px;line-height:1.1}
.mt-d b{font-size:1.3rem}.mt-d span{font-size:.7rem;color:var(--txt2);text-transform:uppercase}
.mt-gs{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.mt-g{display:flex;align-items:center;gap:10px}
.mt-g+.mt-g{border-top:1px dashed var(--border2);padding-top:8px}
.mt-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mt-mid b{font-size:.84rem}.mt-mid span{font-size:.78rem;color:var(--txt2)}
.mt-r{display:flex;flex-direction:column;align-items:center;gap:2px;flex:none}
.mt-r b{font-size:.8rem;white-space:nowrap}
.mt-vide,.mt-src{font-size:.78rem;line-height:1.45;color:var(--txt2)}
.mt-src{margin:14px 0 4px}
.ac-meteo-sec{margin-bottom:14px}
@media (prefers-reduced-motion:reduce){.mt-sheet{animation:none}}
</style>`);
