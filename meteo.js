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
// Ville d'un jour : l'après-midi d'abord (c'est là qu'on passe le plus de temps), puis le matin,
// le soir, la ville de l'hôtel. Sinon celle de la veille ; avant la première ville reconnue
// (jour de vol depuis la France), pas de météo.
function mtVilleDuJour(day, veille) {
  const hotel = day.hotel_id && typeof D !== 'undefined' ? (D.items || []).find(x => x.id === day.hotel_id) : null;
  if (!veille && !hotel) return null; // jour de vol depuis la France : pas encore sur place
  for (const t of [day.aprem_lieu, day.matin_lieu, day.soir_lieu, hotel && hotel.ville]) {
    const v = mtVilleDeTexte(t); if (v) return v;
  }
  return veille || null;
}
function mtJoursVoyage() {
  const out = []; let veille = null;
  for (const day of sortedDays()) {
    const ville = mtVilleDuJour(day, veille); veille = ville;
    if (!ville) continue;
    out.push({ date: day.date_voyage, ville, rec: mtRec(ville, day.date_voyage) });
  }
  return out;
}
function mtRec(ville, date) {
  const l = MT.data && MT.data.lieux && MT.data.lieux[ville];
  return (l && l.find(j => j.d === date)) || null;
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
  return jours.find(j => j.date === now) ? { ...jours.find(j => j.date === now), avant: false } : null;
}

/* ───────────── 1. Pastille en haut de chaque jour du Planning ───────────── */
function mtBadgeHtml(date, ville) {
  const r = mtRec(ville, date); if (!r) return '';
  const [ic, lib] = mtCode(r.code, r.neige);
  const p = mtPluie(r);
  return '<button type="button" class="mt-badge" onclick="event.stopPropagation();mtOuvrir(\'' + date + '\')" aria-label="Météo du ' + fmtDate(date) + ' : ' + lib + ', ' + r.max + ' degrés' + (p.pluie ? ', pluie prévue' : '') + '. Ouvrir la météo">'
    + mtIcone(ic, 22) + '<span>' + r.max + '°</span></button>';
}
// Appelée par le gabarit du Planning. Le conteneur reste dans le DOM même sans donnée :
// mtRafraichir() le remplit dès que meteo.json arrive.
function mtBadge(day) {
  const e = mtJoursVoyage().find(j => j.date === day.date_voyage);
  return '<span class="mt-slot" data-d="' + day.date_voyage + '">' + (e ? mtBadgeHtml(e.date, e.ville) : '') + '</span>';
}

/* ───────────── 2. Carte sur l'Accueil ───────────── */
function mtAccueil() {
  const c = mtCible(); if (!c || !c.rec) return '';
  const r = c.rec, [ic, lib] = mtCode(r.code, r.neige), p = mtPluie(r);
  const quand = c.avant ? 'Premier jour, ' + fmtDate(c.date) : "Aujourd'hui";
  return '<button type="button" class="mt-home" data-act="meteo" aria-label="Ouvrir la météo du voyage">'
    + '<span class="mt-home-ic">' + mtIcone(ic, 38) + '</span>'
    + '<span class="mt-home-tx"><b>' + esc(c.ville) + ' · ' + esc(quand) + '</b>'
    + '<span>' + esc(lib) + ', ' + mtTemp(r) + '</span>'
    + '<em class="' + (p.pluie ? 'mt-pluie' : '') + '">' + esc(p.txt) + '</em></span>'
    + window.ic('arrow-right') + '</button>';
}

/* ───────────── 3. Vue « juste la météo » ───────────── */
function mtLigneHtml(e, cible) {
  const dt = new Date(e.date + 'T12:00:00');
  const jour = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), num = dt.getDate();
  if (!e.rec) {
    const n = typeof METEO_DATA !== 'undefined' && METEO_DATA[e.ville];
    return '<div class="mt-row mt-row-vide' + (cible ? ' cible' : '') + '" id="mt-row-' + e.date + '"><div class="mt-d"><b>' + num + '</b><span>' + jour + '</span></div>'
      + '<div class="mt-mid"><b>' + esc(e.ville) + '</b><span>Prévision pas encore publiée</span>'
      + (n ? '<em>Normale de saison : ' + n.min + '–' + n.max + ' °C</em>' : '') + '</div></div>';
  }
  const r = e.rec, [ic, lib] = mtCode(r.code, r.neige), p = mtPluie(r);
  return '<div class="mt-row' + (cible ? ' cible' : '') + '" id="mt-row-' + e.date + '"><div class="mt-d"><b>' + num + '</b><span>' + jour + '</span></div>'
    + '<div class="mt-mid"><b>' + esc(e.ville) + '</b><span>' + esc(lib) + '</span>'
    + '<em class="' + (p.pluie ? 'mt-pluie' : '') + '">' + esc(p.txt) + '</em></div>'
    + '<div class="mt-r">' + mtIcone(ic, 30) + '<b>' + mtTemp(r) + '</b></div></div>';
}
function mtHeroHtml(c) {
  if (!c) return '';
  if (!c.rec) return '<div class="mt-hero"><div class="mt-hero-t">' + esc(c.ville) + '</div><p>Pas de prévision pour ce jour pour l\'instant.</p></div>';
  const r = c.rec, [ic, lib] = mtCode(r.code, r.neige), p = mtPluie(r);
  const titre = c.avant ? 'Premier jour, ' + fmtDate(c.date) : "Aujourd'hui, " + fmtDate(c.date);
  return '<div class="mt-hero"><div class="mt-hero-t">' + esc(titre) + ' · ' + esc(c.ville) + '</div>'
    + '<div class="mt-hero-m">' + mtIcone(ic, 56) + '<div><strong>' + r.max + '°</strong><span>minimum ' + r.min + '°</span></div></div>'
    + '<div class="mt-hero-l">' + esc(lib) + '</div>'
    + '<div class="mt-hero-p ' + (p.pluie ? 'mt-pluie' : '') + '">' + mtIcone(p.pluie ? (r.neige >= 0.5 ? 'snow' : 'rain') : 'sun', 20) + '<span>' + esc(p.txt) + '</span></div></div>';
}
function mtVueHtml(focus) {
  const jours = mtJoursVoyage(), cible = mtCible();
  if (!MT.data) return '<p class="mt-vide">Pas encore de prévision sur ce téléphone. Elle se charge dès qu\'il y a du réseau.</p>';
  if (!jours.length) return '<p class="mt-vide">Le planning est vide : aucun jour à afficher.</p>';
  const maj = mtMajTexte();
  return (cible ? mtHeroHtml(cible) : '')
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
  const c = mtCible(); if (!c || !c.rec) return '';
  const r = c.rec, [, lib] = mtCode(r.code, r.neige);
  return (c.avant ? 'Premier jour (' + fmtDate(c.date) + ')' : "Aujourd'hui") + ' à ' + c.ville + ' : ' + lib + ', ' + mtTemp(r) + '. ' + mtPluie(r).txt + '.';
}

/* ───────────── Chargement ───────────── */
function mtRafraichir() {
  document.querySelectorAll('.mt-slot').forEach(s => {
    const e = mtJoursVoyage().find(j => j.date === s.dataset.d);
    s.innerHTML = e ? mtBadgeHtml(e.date, e.ville) : '';
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
.mt-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff}
.mt-row.cible{border-color:var(--accent);box-shadow:0 0 0 2px var(--tint)}
.mt-row-vide{opacity:.75}
.mt-d{display:flex;flex-direction:column;align-items:center;min-width:38px;line-height:1.1}
.mt-d b{font-size:1.3rem}.mt-d span{font-size:.7rem;color:var(--txt2);text-transform:uppercase}
.mt-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mt-mid b{font-size:.84rem}.mt-mid span{font-size:.78rem;color:var(--txt2)}
.mt-r{display:flex;flex-direction:column;align-items:center;gap:2px;flex:none}
.mt-r b{font-size:.8rem;white-space:nowrap}
.mt-vide,.mt-src{font-size:.78rem;line-height:1.45;color:var(--txt2)}
.mt-src{margin:14px 0 4px}
.ac-meteo-sec{margin-bottom:14px}
@media (prefers-reduced-motion:reduce){.mt-sheet{animation:none}}
</style>`);
