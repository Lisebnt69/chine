/* ═══════════════════════════════════════════════════════════════
   ia.js — Cerveau + Assistant IA + moteur de planning (les 4 vues du Programme sont dans prog.js)
   Chargé APRÈS le script principal de index.html : réutilise ses globales
   (sb, D, esc, fmtE, goTab, isEditorMode, showToast, navigateToItem, mapInst…).
   ═══════════════════════════════════════════════════════════════ */

const IA_URL = SB_URL + '/functions/v1/assistant';
const IA_TRIGGER = /^(@ia|@roomy|@claude|\/ia)\b/i;
const PERIODE_START = { 'Matin': '09:00', 'Après-midi': '14:00', 'Soir': '19:00', 'Journée': '09:00', '': '10:00' };  // 9h : sortie de l'hôtel, sauf obligation
const PERIODE_ORDER = { 'Matin': 1, 'Journée': 1, 'Après-midi': 2, 'Soir': 3, '': 4 };
const CHINA_TZ = 'Asia/Shanghai';
D.cerveau = D.cerveau || [];

/* ───────────── Utilitaires temps ───────────── */
const toMin = h => { const m = String(h || '').trim().match(/^(\d{1,2})\s*[h:]\s*(\d{0,2})/i); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null; };
const fmtMin = m => { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function chinaNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: CHINA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + (+p.minute) };
}
function kmBetween(a, b) { return (a && b) ? getDistKm(a[0], a[1], b[0], b[1]) : null; }
// À pied sous ~600 m à vol d'oiseau (≈ 800 m réels, 4,6 km/h) ; au-delà métro/DiDi ≈ 18 km/h + attente.
const MARCHE_KM = 0.6;
function travelMin(km) {
  if (km == null) return 20;
  if (km <= MARCHE_KM) return Math.max(2, Math.round(km * 1.3 * 13) + 1);
  // Au-delà de 15 km à vol d'oiseau on est hors ville : route (×1,5 en relief) à ~55 km/h + 10 min d'attente.
  // Ex. Wulingyuan → Tianmen : 33 km à vol d'oiseau = ~51 km de route = ~1 h (au lieu de 2 h à 18 km/h).
  if (km > 15) return Math.round(km * 1.5 / 55 * 60 + 10);
  return Math.max(10, Math.round(km / 18 * 60 + 8));
}
const travelMode = km => km == null ? 'trajet' : km <= MARCHE_KM ? 'à pied' : 'métro / DiDi';

/* Métro ou DiDi : durée et prix estimés pour chaque trajet. Tarifs publics relevés en novembre 2026 ; ils varient
   (heure, demande), l'appli DiDi donne le prix exact. taxi : [prise en charge ¥, km inclus, ¥ par km en plus].
   metro : [prix de base ¥, km inclus, km par ¥ en plus, plafond ¥]. Pas de métro à Zhangjiajie, Furong ou Wulong. */
const TARIFS_VILLES = [
  { c: [31.23, 121.47], rayon: 70, taxi: [14, 3, 2.7], metro: [3, 6, 10, 15] },  // Shanghai, Pudong et Disney compris
  { c: [29.56, 106.55], rayon: 40, taxi: [10, 3, 2], metro: [2, 6, 6, 11] },     // Chongqing
  { c: [30.66, 104.06], rayon: 40, taxi: [9, 2, 2.2], metro: [2, 4, 6, 10] },    // Chengdu
];
const TAXI_AILLEURS = [10, 3, 2.3];  // calé sur Wulingyuan → Tianmen, ~50 km pour 100 à 150 ¥
const METRO_OUVERT = [6 * 60, 22 * 60 + 30], MAJORATION_NUIT = 1.2;
const estNuit = t => t != null && (t >= 23 * 60 || t < 5 * 60);
const villeTarif = p => p ? TARIFS_VILLES.find(v => kmBetween(p, v.c) <= v.rayon) : null;
function prixDidi(km, taxi, t) {
  const route = km * (km > 15 ? 1.5 : 1.3), [base, inclus, parKm] = taxi;
  return (base + Math.max(0, route - inclus) * parKm) * (estNuit(t) ? MAJORATION_NUIT : 1);
}
function prixMetro(km, [base, inclus, parYuan, plafond]) {
  return Math.min(plafond, base + Math.ceil(Math.max(0, km * 1.3 - inclus) / parYuan));
}
/* Navettes gratuites des hôtels, proposées sur tout trajet entre l'hôtel et une destination desservie, quel que soit
   le jour : elles suivent les activités du planning. Source : page Trip.com de l'hôtel, novembre 2026. */
const NAVETTES = [{
  hotel: [31.134184, 121.759277],  // Vienna, 1226 Chuannanfeng Rd (pas le Vienna du Free Trade Zone)
  vers: [
    { pos: [31.142736, 121.804113], min: 15, note: 'à réserver' },                       // aéroport de Pudong
    { pos: [31.1462, 121.6563], min: 30, note: 'à réserver, départ 7h20 à confirmer', retour: 'place du soir à réserver' },  // Shanghai Disney Resort
  ],
}];
function navetteHotel(o) {
  if (!o.de || !o.vers) return null;
  for (const n of NAVETTES) for (const [a, b] of [[o.de, o.vers], [o.vers, o.de]]) {
    if (kmBetween(a, n.hotel) > 0.3) continue;
    const v = n.vers.find(x => kmBetween(b, x.pos) <= 3);
    if (v) return { mode: 'Navette hôtel', min: v.min, yuan: 0, note: a === o.vers ? v.retour || v.note : v.note };
  }
  return null;
}
// Options du trajet, la conseillée d'abord. o : { de, vers, t (minutes), bagages }.
function optionsTrajet(km, o = {}) {
  const r = optionsRoute(km, o), navette = navetteHotel(o);
  if (navette) r.options.unshift(navette);
  return r;
}
function optionsRoute(km, o) {
  const v = villeTarif(o.de || o.vers), memeVille = v && (!o.de || !o.vers || villeTarif(o.vers) === v);
  const didi = { mode: 'DiDi', min: travelMin(km), yuan: prixDidi(km, v ? v.taxi : TAXI_AILLEURS, o.t) };
  const ferme = o.t != null && (o.t < METRO_OUVERT[0] || o.t >= METRO_OUVERT[1]);
  if (!memeVille || ferme || km < 1.5) return { options: [didi], ferme: !!(memeVille && ferme) };
  const metro = { mode: 'Métro', min: Math.max(15, Math.round(km * 1.3 / 30 * 60 + 12)), yuan: prixMetro(km, v.metro) };
  return { options: o.bagages || km > 15 || km < 2.5 ? [didi, metro] : [metro, didi], ferme: false };
}
function itemPos(it) { return (it && it.lat && it.lng) ? [parseFloat(it.lat), parseFloat(it.lng)] : null; }
function sortedDays() { return [...D.planning].sort((a, b) => String(a.date_voyage).localeCompare(String(b.date_voyage))); }
function hotelForDay(day) {
  if (day.hotel_id) return D.items.find(x => x.id == day.hotel_id);
  // Sinon : hôtel dont la période (check-in + nuits) couvre la date
  return D.items.find(h => h.type === 'hotel' && h.adresse && (() => {
    const start = new Date(h.adresse), n = parseInt(h.prix_type) || 1, d = new Date(day.date_voyage);
    return d >= start && d < new Date(start.getTime() + n * 86400000);
  })());
}
function transportsForDay(day) {
  const veille = new Date(new Date(day.date_voyage) - 86400000).toISOString().split('T')[0];
  return D.items.filter(x => x.type === 'transport' && (x.adresse === day.date_voyage || (x.adresse === veille && String(x.notes || '').includes('J+1'))));
}

/* ═══════════ 1. MOTEUR DE PLANNING OPTIMISÉ ═══════════
   Pour chaque jour : on part de l'hôtel, on respecte les heures fixées,
   et dans chaque période on enchaîne au plus proche (plus proche voisin),
   en ajoutant le temps de trajet estimé. */
function buildDayPlan(day) {
  const hotel = hotelForDay(day);
  const start = itemPos(hotel);
  const out = [];
  transportsForDay(day).forEach(t => {
    const arrJ1 = t.adresse !== day.date_voyage;
    const time = arrJ1 ? toMin(t.description) : toMin(t.quartier);
    out.push({ kind: 'transport', min: time ?? 6 * 60, end: arrJ1 ? time : toMin(t.description), item: t,
      label: t.nom, sub: arrJ1 ? `Arrivée ${t.description || ''}` : `${t.quartier || '?'} → ${t.description || '?'}` });
  });

  const slots = D.slots.filter(s => s.planning_id === day.id)
    .map(s => ({ slot: s, item: D.items.find(x => x.id == s.item_id) })).filter(x => x.item);

  const groups = {};
  slots.forEach(x => { const p = x.slot.periode || ''; (groups[p] = groups[p] || []).push(x); });
  let cursor = null, pos = start;
  // Si on arrive par transport ce jour-là, on ne commence pas avant l'arrivée + 1h
  // Plusieurs trajets dans la journée (aller-retour Chengdu) : on part de l'arrivée qui ouvre le plus long moment libre.
  const trajets = out.filter(o => o.kind === 'transport' && o.end != null);
  const prochainDepart = a => Math.min(24 * 60, ...trajets.map(o => o.min).filter(d => d > a));
  const arrivals = trajets.map(o => o.end).sort((a, b) => (prochainDepart(b) - b) - (prochainDepart(a) - a));
  const firstFree = arrivals.length ? arrivals[0] + 60 : null;

  Object.keys(groups).sort((a, b) => (PERIODE_ORDER[a] || 4) - (PERIODE_ORDER[b] || 4)).forEach(p => {
    const fixed = groups[p].filter(x => toMin(x.slot.heure) != null).sort((a, b) => toMin(a.slot.heure) - toMin(b.slot.heure));
    let free = groups[p].filter(x => toMin(x.slot.heure) == null);
    let pStart = toMin(PERIODE_START[p]);
    if (firstFree && pStart < firstFree && p !== 'Soir') pStart = Math.max(pStart, firstFree);
    if (cursor == null || cursor < pStart) cursor = pStart;
    const seq = [];
    // plus proche voisin pour les créneaux sans heure
    while (free.length) {
      let best = 0, bestD = Infinity;
      free.forEach((x, i) => { const d = kmBetween(pos, itemPos(x.item)); if ((d ?? 999) < bestD) { bestD = d ?? 999; best = i; } });
      const [x] = free.splice(best, 1); seq.push(x); pos = itemPos(x.item) || pos;
    }
    // on fusionne avec les heures fixes
    const merged = [...fixed.map(x => ({ ...x, fixedMin: toMin(x.slot.heure) })), ...seq].sort((a, b) => {
      if (a.fixedMin != null && b.fixedMin != null) return a.fixedMin - b.fixedMin;
      return 0;
    });
    let prevPos = out.length ? (out.filter(o => o.pos).slice(-1)[0]?.pos || start) : start;
    merged.forEach(x => {
      const km = kmBetween(prevPos, itemPos(x.item));
      const tr = travelMin(km);
      let t = Math.max(cursor + tr, x.fixedMin ?? 0);
      if (x.fixedMin != null) t = x.fixedMin;
      const dur = x.slot.etape?.duree_min ?? (p === 'Journée' ? 600 : DUREE_MIN[x.item.duree || ''] || (x.item.type === 'restaurant' ? 75 : 60)); // « Journée » : 10 h sur place, pas d'idées en plein milieu
      out.push({ kind: 'stop', min: t, end: t + dur, item: x.item, slot: x.slot, periode: p, fixed: x.fixedMin != null,
        km, travel: tr, pos: itemPos(x.item), label: x.slot.etape?.titre || x.item.nom });
      cursor = t + dur; prevPos = itemPos(x.item) || prevPos;
    });
  });
  if (hotel) out.push({ kind: 'hotel', min: Math.max(cursor || 0, 21 * 60), item: hotel, label: hotel.nom, sub: 'Nuit · ' + (hotel.ville || '') });
  out.sort((a, b) => a.min - b.min);
  // conflits : chevauchements avec un transport
  out.forEach(o => {
    if (o.kind !== 'stop') return;
    // Une étape de la feuille de route a ses marges : seul un vrai chevauchement avec le transport compte.
    const avant = o.slot?.etape ? 0 : 90, apres = o.slot?.etape ? 0 : 30;
    const clash = out.find(t => t.kind === 'transport' && t.end != null && t.end > t.min && o.min < t.end + apres && o.end > t.min - avant && t.min > 0);
    if (clash) o.warn = `⚠️ Serré avec ${clash.label}`;
  });
  return { day, hotel, entries: out };
}

/* Prochaine étape (toutes journées confondues) */
function nextStep() {
  const now = chinaNow();
  for (const day of sortedDays()) {
    if (day.date_voyage < now.date) continue;
    const plan = buildDayPlan(day);
    const e = plan.entries.find(x => x.kind !== 'hotel' && (day.date_voyage > now.date || (x.end ?? x.min + 30) > now.min));
    if (e) return { day, e, plan };
  }
  return null;
}

/* ═══════════ 2. ONGLET PROGRAMME ═══════════ */
let progView = localStorage.getItem('prog_view') || 'leger';

function ensureProgrammeTab() {
  if (document.getElementById('tab-programme')) return;
  const main = document.getElementById('mainContent');
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-programme';
  tab.innerHTML = `
    <div class="ph" style="padding-bottom:8px;"><h1>Programme</h1><p id="progSub"></p></div>
    <div class="prog-switch">
      <button data-v="vital">🏨 Essentiel</button>
      <button data-v="leger">🧭 Idées</button>
      <button data-v="detail">🕐 Heure par heure</button>
      <button data-v="claude"><img class="mimi-mini" src="mascotte/tete.webp" alt="">Roomy</button>
    </div>
    <div id="progHint" style="margin:8px 16px 0;font-size:.78rem;line-height:1.4;color:var(--txt2)"></div>
    <div id="progDays"></div>
    <div id="progBody"></div>`;
  main.appendChild(tab);
  tab.querySelectorAll('.prog-switch button').forEach(b => b.onclick = () => { progView = b.dataset.v; localStorage.setItem('prog_view', progView); renderProgramme(); });

  const cer = document.createElement('div');
  cer.className = 'tab'; cer.id = 'tab-cerveau';
  cer.innerHTML = `
    <div class="ph" style="padding-bottom:8px;"><h1>🧠 Cerveau</h1><p>Vos reels Insta / TikTok transcrits</p></div>
    <div class="prog-toolbar">
      <input class="form-input" id="cerQ" placeholder="Chercher : hot pot, rooftop, panda…" oninput="renderCerveau()">
      <button class="prog-btn" onclick="openCerveauImport()">⬆️ Importer</button>
    </div>
    <div id="cerBody"></div>`;
  main.appendChild(cer);

  // Navigation : "Programme" remplace "Activ." dans la barre du bas ; Activités + Cerveau passent dans le tiroir
  const nbAct = document.getElementById('nb-activites');
  if (nbAct) {
    nbAct.id = 'nb-programme';
    nbAct.setAttribute('onclick', "goTab('programme',this);closeNavDrawer()");
    nbAct.querySelector('.nic').textContent = '🧭';
    nbAct.querySelector('.nlb').textContent = 'Programme';
  }
  const drawerAnchor = document.getElementById('nd-restaurants');
  if (drawerAnchor) {
    [['activites', '🎯', 'Activités'], ['cerveau', '🧠', 'Cerveau']].forEach(([n, ic, lb]) => {
      const b = document.createElement('button');
      b.className = 'nav-drawer-btn'; b.id = 'nd-' + n;
      b.onclick = () => { goTab(n, document.getElementById('nb-more')); closeNavDrawer(); };
      b.innerHTML = `<span class="nav-drawer-ic">${ic}</span><span class="nav-drawer-lbl">${lb}</span>`;
      drawerAnchor.parentNode.insertBefore(b, drawerAnchor);
    });
  }
  const qa = document.querySelector('.qa-row');
  if (qa) {
    qa.insertAdjacentHTML('afterbegin', `<button class="qa-chip accent" onclick="goTabByName('programme')">🧭 Programme</button><button class="qa-chip" onclick="askIA()">🧠 Demander à Roomy</button>`);
  }
  // Puces de l'assistant dans le chat
  const chips = document.getElementById('chatBotChips');
  if (chips) chips.insertAdjacentHTML('afterbegin', `
    <button class="bot-chip ia" onclick="askIA('Qu\\'est-ce qu\\'on fait cet aprem ? Propose 3 options depuis le cerveau.')">🧠 Cet aprem ?</button>
    <button class="bot-chip ia" onclick="askIA('Optimise le planning de demain (ordre et heures) et applique-le.')">⚡ Optimiser demain</button>
    <button class="bot-chip ia" onclick="askIA('Quels reels du cerveau ne sont pas encore dans le planning ? Classe-les par ville.')">🧠 Pas encore casés</button>`);
  const inp = document.getElementById('chatInp');
  if (inp) inp.placeholder = 'Message… (@roomy pour parler à Roomy)';
}

/* Les 4 vues vivent dans prog.js (chargé après ce fichier) : renderProgramme() y est redéfini. */
function renderProgramme() { if (typeof renderProgrammeVues === 'function') renderProgrammeVues(); }

async function applyOptimised(dayId) {
  if (!requireEditorSoft()) return;
  const day = D.planning.find(d => d.id == dayId); if (!day) return;
  const stops = buildDayPlan(day).entries.filter(e => e.kind === 'stop' && !e.fixed);
  await Promise.all(stops.map(e => sb.from('planning_slots').update({ heure: fmtMin(e.min) }).eq('id', e.slot.id)));
  stops.forEach(e => { e.slot.heure = fmtMin(e.min); });
  showToast(`✅ ${stops.length} heure(s) fixée(s)`); renderProgramme(); renderPlanning();
}

/* Après une écriture faite depuis le Programme : on recharge tout et on redessine tous les onglets (Planning compris),
   sans attendre le temps réel, qui peut décrocher en Chine. */
async function syncEtRendre() {
  try { await loadAll(); } catch (e) { /* hors ligne : le temps réel rattrapera */ }
  renderAll();
}
function quickPlan(itemId, pre) {
  pre = pre || {};
  if (!requireEditorSoft()) return;
  const it = D.items.find(x => x.id == itemId);
  const days = sortedDays().filter(d => !it?.ville || [d.matin_lieu, d.aprem_lieu, d.soir_lieu].some(l => String(l || '').includes(it.ville)));
  const pool = (days.length && !pre.dayId) ? days : sortedDays();
  const sh = document.createElement('div');
  sh.className = 'overlay on'; sh.id = 'qp-sheet';
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Caser « ${esc(it?.nom || '')} »</div>
    <div class="form-group"><div class="form-label">Jour</div><select class="form-input" id="qp-day">${pool.map(d => `<option value="${d.id}" ${pre.dayId == d.id ? 'selected' : ''}>${fmtDate(d.date_voyage)} — ${esc(d.aprem_lieu || d.matin_lieu || '')}</option>`).join('')}</select></div>
    <div class="row-2"><div class="form-group"><div class="form-label">Moment</div><select class="form-input" id="qp-per">${['Matin', 'Après-midi', 'Soir', 'Journée'].map(p => `<option ${p === (pre.periode || it?.prix_type || 'Après-midi') ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div class="form-group"><div class="form-label">Heure (optionnel)</div><input class="form-input" id="qp-h" type="time" value="${esc(pre.heure || '')}"></div></div>
    <button class="btn-primary" style="width:100%;" onclick="confirmQuickPlan('${itemId}')">📅 Ajouter au planning</button></div>`;
  document.body.appendChild(sh);
}
async function confirmQuickPlan(itemId) {
  const planning_id = document.getElementById('qp-day').value, periode = document.getElementById('qp-per').value, heure = document.getElementById('qp-h').value || null;
  const row = { planning_id, item_id: itemId, periode, ordre: 0 }; if (heure) row.heure = heure;
  const { error } = await sb.from('planning_slots').insert(row);
  if (error) { showToast('❌ ' + error.message); return; }
  await sb.from('items').update({ statut: 'planifie' }).eq('id', itemId);
  document.getElementById('qp-sheet')?.remove(); showToast('📅 Ajouté au planning'); await syncEtRendre();
}

/* ═══════════ 3. CERVEAU ═══════════ */
const CER_A_PLACER = ['activite', 'restaurant', 'cafe', 'hotel'];
const CER_IDEES = ['activite', 'restaurant', 'cafe', 'piste'];
const CER_FILTRES = [['', 'Tout'], ['restaurant', '🍜 Restos'], ['activite', '🎯 Visites'], ['cafe', '☕ Bars & cafés'], ['hotel', '🏨 Hôtels'],
  ['pratique', '🧳 Pratique'], ['astuce', '💡 Astuces'], ['itineraire', '🗺️ Itinéraires'], ['piste', '🔎 Pistes']];
const CER_PAGE = 25;
let cerLimite = CER_PAGE, cerCat = '', cerVille = '';

const sansAccent = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Début de mot, comme la recherche côté base : « pot » ne doit pas trouver « spot ».
function contientMots(texte, q) {
  return sansAccent(q).split(/\s+/).filter(Boolean).every(m =>
    /[\u4e00-\u9fff]/.test(m) ? texte.includes(m) : new RegExp('(^|[^a-z0-9])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(texte));
}
// Le fiable et déjà sur la carte d'abord : c'est le plus exploitable sur le terrain.
function cerveauTri(a, b) {
  const rang = c => ({ haute: 0, moyenne: 1 }[c.confiance] ?? 2) + (c.lat ? 0 : 0.5);
  return rang(a) - rang(b);
}
function listeCerveau(list) {
  const reste = list.length - cerLimite;
  return list.slice(0, cerLimite).map(cerveauCard).join('')
    + (reste > 0 ? `<button class="prog-wide" onclick="cerLimite+=50;renderCerveau();renderProgramme()">Voir les ${reste} autres</button>` : '');
}
// Les données du cerveau viennent de posts de tiers et d'une table ouverte : elles passent par
// des attributs data-*, jamais dans le code d'un onclick, et seuls les liens http(s) sont gardés.
const navAttr = c => esc(JSON.stringify({ nom: c.titre, lat: c.lat, lng: c.lng, adresse_cn: c.adresse_cn || '' }));
const lienSur = u => /^https?:\/\//i.test(u || '') ? esc(u) : '';

function cerveauCard(c) {
  const surCarte = CER_A_PLACER.includes(c.categorie);
  // Pas de position connue : on envoie la recherche à Amap, qui connaît le lieu mieux qu'OSM.
  const amap = surCarte && !c.lat ? buildAmapUrl({ adresse_cn: c.adresse_cn, nom: (c.titre || '').replace(/\s*[(（«:].*$/, ''), ville: c.ville }) : '';
  return `<div class="prog-card cer">
    <div class="prog-card-ic">${c.source === 'tiktok' ? '🎵' : c.source === 'instagram' ? '📸' : '🧠'}</div>
    <div class="prog-card-main">
      <div class="prog-card-t">${esc(c.titre || c.lieu_nom || 'Reel')}</div>
      <div class="prog-card-s">${esc([c.ville, c.rubrique, c.auteur && '@' + c.auteur].filter(Boolean).join(' · '))}</div>
      ${c.resume ? `<div class="prog-card-s">${esc(c.resume)}</div>` : ''}
      ${c.prix_texte ? `<div class="prog-card-s">💰 ${esc(c.prix_texte)}</div>` : ''}
      ${c.adresse ? `<div class="prog-card-s">📍 ${esc(c.adresse)}</div>` : ''}
      ${c.categorie === 'piste' ? '<div class="prog-tl-w">Piste : ce post n\'a pas encore été analysé.</div>' : c.confiance === 'basse' ? '<div class="prog-tl-w">Info peu sûre : à vérifier.</div>' : ''}
      ${(c.tags || []).length ? `<div class="prog-tags">${c.tags.slice(0, 5).map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="prog-card-r" style="gap:6px;">
      ${lienSur(c.url) ? `<a class="prog-btn light" href="${lienSur(c.url)}" target="_blank" rel="noopener" title="Voir le post">▶︎</a>` : ''}
      ${c.lat ? `<button class="prog-btn light" title="Y aller" data-nav="${navAttr(c)}" onclick="navigateToItem(JSON.parse(this.dataset.nav))">🧭</button>` : ''}
      ${amap ? `<a class="prog-btn light" href="${esc(amap)}" target="_blank" rel="noopener" title="Chercher dans Amap">🔎 Amap</a>` : ''}
      ${c.item_id ? '<span class="prog-ok">✓ dans l\'app</span>' : surCarte && c.categorie !== 'hotel' ? `<button class="prog-btn" data-cle="${esc(c.cle)}" onclick="cerveauToItem(this.dataset.cle)">＋ Idée</button>` : ''}
    </div></div>`;
}

function renderCerveau() {
  ensureProgrammeTab();
  const body = document.getElementById('cerBody'); if (!body) return;
  const q = document.getElementById('cerQ')?.value || '';
  const compte = {};
  D.cerveau.forEach(c => { if (c.ville) compte[c.ville] = (compte[c.ville] || 0) + 1; });
  const villes = Object.keys(compte).sort((a, b) => compte[b] - compte[a]);
  const list = D.cerveau
    .filter(c => (!cerCat || c.categorie === cerCat) && (!cerVille || c.ville === cerVille))
    .filter(c => !q.trim() || contientMots(sansAccent([c.titre, c.lieu_nom, c.ville, c.resume, c.rubrique, c.adresse, (c.tags || []).join(' ')].join(' ')), q))
    .sort(cerveauTri);
  const places = D.cerveau.filter(c => CER_A_PLACER.includes(c.categorie));
  body.innerHTML = `<div class="prog-kpis"><div><b>${D.cerveau.length}</b><span>points</span></div><div><b>${places.filter(c => c.lat).length}/${places.length}</b><span>sur la carte</span></div><div><b>${D.cerveau.filter(c => c.item_id).length}</b><span>dans l'app</span></div></div>
    <div class="prog-chips flush">${[['', 'Toutes'], ...villes.map(v => [v, `${VILLE_IC[v] || ''} ${v} ${compte[v]}`])].map(([v, l]) => `<button class="${cerVille === v ? 'on' : ''}" data-v="${esc(v)}" onclick="cerVille=this.dataset.v;cerLimite=CER_PAGE;renderCerveau()">${esc(l)}</button>`).join('')}</div>
    <div class="prog-chips flush">${CER_FILTRES.map(([k, l]) => `<button class="${cerCat === k ? 'on' : ''}" onclick="cerCat='${k}';cerLimite=CER_PAGE;renderCerveau()">${l}</button>`).join('')}</div>`
    + (list.length ? listeCerveau(list) : emptyBox('🧠', D.cerveau.length ? 'Rien trouvé dans le cerveau.' : 'Cerveau vide. Clique « Importer » pour ajouter tes reels.'));
}

async function cerveauToItem(cle) {
  if (!requireEditorSoft()) return;
  const c = D.cerveau.find(x => x.cle === cle); if (!c) return;
  const type = ['activite', 'restaurant', 'cafe'].includes(c.categorie) ? c.categorie : 'activite';
  // Le titre est le nom du lieu ; le champ « lieu » du cerveau est souvent juste la rue.
  const row = { type, nom: c.titre || c.lieu_nom || 'Reel', ville: c.ville || '', quartier: c.lieu_nom && c.lieu_nom !== c.titre ? c.lieu_nom : '', description: c.resume || '',
    adresse: c.adresse || '', adresse_cn: c.adresse_cn || '', prix: c.prix_estime || 0, prix_type: c.meilleur_moment || '', duree: c.duree || '', statut: 'idee', priorite: '',
    notes: [c.prix_texte && 'Prix : ' + c.prix_texte, c.url].filter(Boolean).join(' | '), fait: false, matis: 0, lise: 0, lat: c.lat || null, lng: c.lng || null, cerveau_id: c.id || null };
  if (!row.lat) { const g = await geocodeQuery(row); if (g) { row.lat = g.lat; row.lng = g.lng; } }
  const { data, error } = await sb.from('items').insert(row).select('id').single();
  if (error) { showToast('❌ ' + error.message); return; }
  await sb.from('cerveau').update({ item_id: data.id, lat: row.lat, lng: row.lng }).eq('cle', cle);
  c.item_id = data.id; showToast('💡 Ajouté aux idées' + (row.lat ? ' + carte' : ''));
  renderCerveau(); await syncEtRendre();
  return data.id;
}

/* Import : accepte JSON (tableau d'objets) ou CSV avec en-têtes.
   Champs reconnus : url, source, auteur, titre, transcription, resume, categorie, ville, lieu_nom, adresse, adresse_cn, lat, lng, prix_estime, duree, meilleur_moment, tags */
function openCerveauImport() {
  if (!requireEditorSoft()) return;
  const sh = document.createElement('div');
  sh.className = 'overlay on'; sh.id = 'cer-import';
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Importer le cerveau</div>
    <div class="prog-hint">Colle un JSON (liste de reels) ou un CSV avec en-têtes. Champs : cle, url, source, auteur, titre, transcription, resume, categorie, ville, lieu_nom, adresse, adresse_cn, prix_texte, duree, meilleur_moment, tags. Une entrée déjà présente (même cle, ou même url et même lieu) est mise à jour.</div>
    <textarea class="form-input" id="cer-raw" rows="9" placeholder='[{"url":"https://www.tiktok.com/@x/video/1","titre":"Hot pot caché","ville":"Chongqing","lieu_nom":"...","transcription":"..."}]'></textarea>
    <input type="file" accept=".json,.csv,.txt" style="margin:8px 0;" onchange="this.files[0]&&this.files[0].text().then(t=>document.getElementById('cer-raw').value=t)">
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;margin:6px 0 12px;"><input type="checkbox" id="cer-geo" checked> Placer les adresses sur la carte (≈1 s par lieu)</label>
    <button class="btn-primary" style="width:100%;" onclick="importCerveau()">⬆️ Importer</button>
    <div id="cer-status" class="prog-hint"></div></div>`;
  document.body.appendChild(sh);
}

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...rest] = rows.filter(r => r.some(c => c.trim()));
  return rest.map(r => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] || '').trim()])));
}

const CER_FIELDS = ['cle', 'url', 'source', 'auteur', 'titre', 'transcription', 'resume', 'categorie', 'rubrique', 'ville', 'lieu_nom', 'adresse', 'adresse_cn', 'lat', 'lng', 'geo', 'prix_estime', 'prix_texte', 'duree', 'meilleur_moment', 'tags', 'confiance'];
function normaliseReel(o) {
  const alias = { link: 'url', lien: 'url', title: 'titre', transcript: 'transcription', summary: 'resume', detail: 'resume', prix: 'prix_texte', city: 'ville', place: 'lieu_nom', lieu: 'lieu_nom', nom: 'lieu_nom', address: 'adresse', category: 'categorie', author: 'auteur' };
  const r = {};
  Object.entries(o || {}).forEach(([k, v]) => { const kk = alias[k.toLowerCase()] || k.toLowerCase(); if (CER_FIELDS.includes(kk) && v !== '' && v != null) r[kk] = v; });
  if (typeof r.tags === 'string') r.tags = r.tags.split(/[,#;|]/).map(s => s.trim()).filter(Boolean);
  ['lat', 'lng', 'prix_estime'].forEach(k => { if (r[k] != null) { r[k] = parseFloat(String(r[k]).replace(',', '.')); if (isNaN(r[k])) delete r[k]; } });
  if (!r.source && r.url) r.source = /tiktok/i.test(r.url) ? 'tiktok' : /instagram/i.test(r.url) ? 'instagram' : 'autre';
  if (r.ville) { const v = VILLES.find(x => x.toLowerCase() === String(r.ville).toLowerCase()); if (v) r.ville = v; }
  r.cle = r.cle || [r.url, r.lieu_nom || r.titre].filter(Boolean).join('#');
  return r;
}

async function importCerveau() {
  const raw = document.getElementById('cer-raw').value.trim(); const st = document.getElementById('cer-status');
  let arr;
  try { arr = raw.startsWith('[') || raw.startsWith('{') ? JSON.parse(raw) : parseCSV(raw); } catch (e) { st.textContent = '❌ Format illisible : ' + e.message; return; }
  if (!Array.isArray(arr)) arr = arr.reels || arr.items || arr.data || [arr];
  const rows = arr.map(normaliseReel).filter(r => r.url || r.titre || r.lieu_nom);
  if (!rows.length) { st.textContent = '❌ Aucun reel reconnu.'; return; }
  if (document.getElementById('cer-geo').checked) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.lat && r.lng) continue;
      if (!(r.adresse_cn || r.adresse || r.lieu_nom)) continue;
      st.textContent = `📍 Géocodage ${i + 1}/${rows.length}…`;
      const g = await geocodeQuery({ nom: r.lieu_nom, adresse: r.adresse, adresse_cn: r.adresse_cn, ville: r.ville });
      if (g) { r.lat = g.lat; r.lng = g.lng; }
    }
  }
  st.textContent = '⬆️ Envoi…';
  const { error } = await sb.from('cerveau').upsert(rows, { onConflict: 'cle' });
  if (error) { st.textContent = '❌ ' + error.message; return; }
  await loadCerveau(); st.textContent = `✅ ${rows.length} reel(s) importé(s)`;
  setTimeout(() => document.getElementById('cer-import')?.remove(), 1200);
}

// Sans la transcription : elle reste côté base pour l'IA, et ferait exploser le cache local.
const CER_COLS = 'id,cle,source,url,auteur,titre,resume,categorie,rubrique,ville,lieu_nom,adresse,adresse_cn,lat,lng,geo,prix_estime,prix_texte,duree,meilleur_moment,tags,confiance,item_id';

// La base d'abord (elle sait ce qui est déjà ajouté à l'app), sinon cerveau.json, livré
// avec l'app : le cerveau reste consultable si la base ne répond pas.
async function loadCerveau() {
  let rows = null;
  try {
    const { data, error } = await sb.from('cerveau').select(CER_COLS);
    if (!error && data?.length) rows = data;
  } catch (e) { /* base injoignable */ }
  if (!rows) {
    try { const r = await fetch('cerveau.json'); if (r.ok) rows = await r.json(); } catch (e) { /* hors-ligne : on garde le cache */ }
  }
  if (rows) D.cerveau = rows;
  masquerPrix();
  renderCerveau(); if (progView === 'leger') renderProgramme();
}

/* ═══════════ 4. CARTE : placer toutes les adresses automatiquement ═══════════ */
// Limité à la ville quand on la connaît, et on refuse un résultat qui n'est que la ville
// entière (rang OSM < 18) : mieux vaut pas de pin qu'un pin faux.
async function geocodeQuery(x) {
  const centre = VILLE_COORDS[x.ville];
  const zone = centre ? `&bounded=1&viewbox=${centre[1] - .6},${centre[0] + .6},${centre[1] + .6},${centre[0] - .6}` : '';
  const dans = t => t && (centre ? t : `${t} ${x.ville || ''}`);
  const qs = [x.adresse_cn, dans(x.adresse), dans(x.nom), dans(x.quartier)].filter(q => q && q.trim());
  for (const q of qs) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cn${zone}&q=${encodeURIComponent(q.trim())}`, { headers: { 'Accept-Language': 'fr,en,zh' } });
      const d = await r.json();
      await new Promise(res => setTimeout(res, 1100)); // 1 requête/s max (règle OSM)
      if (d?.length && d[0].place_rank >= 18) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), label: d[0].display_name };
    } catch (e) { /* requête suivante */ }
  }
  return null;
}

// Amap travaille en GCJ-02, le système imposé en Chine, alors que le GPS et OSM sont en
// WGS-84 : l'écart est de plusieurs centaines de mètres.
function wgs84ToGcj02(lat, lng) {
  const a = 6378245, ee = 0.00669342162296594323, pi = Math.PI, x = lng - 105, y = lat - 35;
  const dLat = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x))
    + (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3
    + (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3
    + (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
  const dLng = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x))
    + (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3
    + (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3
    + (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3;
  const rad = lat / 180 * pi, m = 1 - ee * Math.sin(rad) ** 2, sq = Math.sqrt(m);
  return [lat + dLat * 180 / (a * (1 - ee) / (m * sq) * pi), lng + dLng * 180 / (a / sq * Math.cos(rad) * pi)];
}

// Les tuiles Amap sont en GCJ-02. Plutôt que de convertir chaque pin, le GPS et les trajets,
// on décale uniquement le calque de tuiles marqué gcj02 : tout le reste de l'app reste en WGS-84.
{
  const { _setZoomTransform: poser, _getTiledPixelBounds: bornes } = L.GridLayer.prototype;
  const decale = (calque, c) => {
    if (!calque.options.gcj02 || !c) return c;
    const [lat, lng] = wgs84ToGcj02(c.lat, c.lng);
    return L.latLng(lat, lng);
  };
  L.GridLayer.include({
    _setZoomTransform(niveau, centre, zoom) { return poser.call(this, niveau, decale(this, centre), zoom); },
    _getTiledPixelBounds(centre) { return bornes.call(this, decale(this, centre)); },
  });
}

let geocodingAll = false;
async function geocodeAllMissing(silent) {
  if (geocodingAll || !isEditorMode()) return;
  const todo = D.items.filter(x => ['activite', 'restaurant', 'cafe', 'hotel'].includes(x.type) && !(x.lat && x.lng) && !x._geoFail && (x.adresse_cn || x.nom));
  if (!todo.length) { if (!silent) showToast('📍 Toutes les adresses sont déjà sur la carte'); return; }
  geocodingAll = true;
  let ok = 0;
  const btn = document.getElementById('geoAllBtn');
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    if (btn) btn.textContent = `${i + 1}/${todo.length}`;
    const g = await geocodeQuery({ ...it, adresse: it.type === 'hotel' ? '' : it.adresse });  // pour les hôtels, "adresse" = date de check-in
    if (g) { await sb.from('items').update({ lat: g.lat, lng: g.lng }).eq('id', it.id); it.lat = g.lat; it.lng = g.lng; ok++; }
    else it._geoFail = true;
  }
  geocodingAll = false;
  if (btn) btn.textContent = '📍';
  showToast(`📍 ${ok}/${todo.length} adresse(s) placée(s) sur la carte` + (ok < todo.length ? ' — les autres : ajoute l\'adresse chinoise' : ''));
  if (mapInst) renderMapMarkers();
}

let cerveauLayer = [], routeLayer = null;
const GEO_AVERT = { nom: 'Placé d\'après le nom : ça peut être une autre adresse de la même enseigne.', rue: 'Placé sur la rue, pas à la porte.', quartier: 'Position approximative : rue ou quartier.' };
// Même gabarit que la fiche d'un lieu de la liste (index.html, .map-popup). Le bouton « Y aller » prend
// .mp-go : la classe .nav est celle de la barre du bas, elle le collait en bas de l'écran (position fixe).
function popupCerveau(c) {
  const resume = c.resume ? (c.resume.length > 160 ? c.resume.slice(0, 160).replace(/\s+\S*$/, '') + '…' : c.resume) : '';
  const lien = lienSur(c.url);
  return `<div class="map-popup">
    <div class="mp-type">${ic('brain')} Cerveau</div>
    <div class="mp-name">${esc(c.titre || c.lieu_nom || 'Reel')}</div>
    <div class="mp-meta">${esc(c.ville || '')}${c.rubrique ? ' · ' + esc(c.rubrique) : ''}</div>
    ${resume ? `<div class="mp-resume">${esc(resume)}</div>` : ''}
    ${GEO_AVERT[c.geo] ? `<div class="mp-warn">${ic('warning')}<span>${GEO_AVERT[c.geo]}</span></div>` : ''}
    <div class="mp-actions">
      ${lien ? `<a class="mp-btn mp-full" href="${lien}" target="_blank" rel="noopener">Voir le reel</a>` : ''}
      ${c.categorie !== 'hotel' ? `<button type="button" class="mp-btn" data-cle="${esc(c.cle)}" onclick="cerveauToItem(this.dataset.cle)">${ic('plus')} Idée</button>` : ''}
      <button type="button" class="mp-btn mp-go" data-nav="${navAttr(c)}" onclick="navigateToItem(JSON.parse(this.dataset.nav))">${ic('compass')} Y aller</button>
    </div>
  </div>`;
}
function renderCerveauMarkers() {
  if (!mapInst) return;
  cerveauLayer.forEach(m => m.remove()); cerveauLayer = [];
  // Mêmes filtres que les lieux de la liste : un type (Restos, Cafés...) garde les points du cerveau de ce type.
  // « Planifiés » n'en garde aucun : un point du cerveau n'est pas encore au planning.
  const seuil = { proche: 2, proche500: 0.5 }[mapFilter];
  const garde = c => {
    if (mapFilter === 'all' || mapFilter === 'cerveau') return true;
    if (mapFilter === 'planifie') return false;
    if (seuil !== undefined) return !myPos || getDistKm(myPos.lat, myPos.lng, c.lat, c.lng) <= seuil;
    return c.categorie === mapFilter;
  };
  const visibles = D.cerveau.filter(c => c.lat && c.lng && !c.item_id && garde(c));
  // Plusieurs points au même endroit (un reel qui en cite dix) : on les range en cercle autour de la
  // vraie position, décalés en pixels pour que ça reste lisible à tous les zooms.
  const piles = {};
  visibles.forEach(c => { (piles[c.lat.toFixed(4) + ',' + c.lng.toFixed(4)] ||= []).push(c); });
  Object.values(piles).forEach(pile => pile.forEach((c, i) => {
    const n = pile.length, r = n === 1 ? 0 : Math.max(17, 8 * n / Math.PI * 1.6), a = -Math.PI / 2 + 2 * Math.PI * i / n;
    c._dx = Math.round(r * Math.cos(a)); c._dy = Math.round(r * Math.sin(a));
  }));
  visibles.forEach(c => {
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: `<div class="cer-pin">${TYPE_EMOJI[c.categorie] || '🧠'}</div>`, iconSize: [28, 28], iconAnchor: [14 - c._dx, 14 - c._dy] }) })
      .bindPopup(popupCerveau(c))
      .addTo(mapInst);
    cerveauLayer.push(m);
  });
}

function showDayOnMap(dayId) {
  const day = D.planning.find(d => d.id == dayId); if (!day) return;
  const plan = buildDayPlan(day);
  const pts = [itemPos(plan.hotel), ...plan.entries.filter(e => e.kind === 'stop').map(e => e.pos)].filter(Boolean);
  goTabByName('carte');
  setTimeout(() => {
    if (!mapInst) return;
    if (routeLayer) routeLayer.remove();
    routeLayer = L.layerGroup().addTo(mapInst);
    if (pts.length > 1) L.polyline(pts, { color: '#8b1d2c', weight: 4, opacity: .8, dashArray: '6 8' }).addTo(routeLayer);
    plan.entries.filter(e => e.kind === 'stop' && e.pos).forEach((e, i) => {
      L.marker(e.pos, { icon: L.divIcon({ className: '', html: `<div class="route-num">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 30] }) })
        .bindTooltip(`${fmtMin(e.min)} · ${esc(e.label)}`).addTo(routeLayer);
    });
    if (pts.length) mapInst.fitBounds(L.latLngBounds(pts).pad(0.25));
    else showToast('📍 Aucune étape de ce jour n\'a d\'adresse placée');
  }, 350);
}

/* ═══════════ 5. ASSISTANT IA (via le chat) ═══════════ */
function iaSecret(force) {
  let s = localStorage.getItem('ia_secret');
  if (!s || force) { s = prompt('Code de l\'assistant IA (APP_SECRET défini dans Supabase) :', s || '') || ''; if (s) localStorage.setItem('ia_secret', s); }
  return s;
}

async function callIA(question) {
  showBotTyping();
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': iaSecret() },
      body: JSON.stringify({ question, user: USERS[currentUser]?.name || currentUser }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.removeItem('ia_secret'); showToast('🔒 Code assistant invalide'); }
    else if (!r.ok) showToast('⚠️ IA : ' + (j.error || r.status));
    else if (j.changes?.length) showToast('🧠 ' + j.changes.slice(0, 3).join(' · '));
    // La réponse arrive dans le chat via le temps réel (insérée par la fonction).
  } catch (e) {
    showToast('⚠️ Assistant injoignable (réseau ou fonction non déployée)');
  } finally { hideBotTyping(); }
}

function askIA(q) {
  if (!currentUser || currentUser === 'visiteur') { showToast('Connecte-toi d\'abord'); return; }
  goTabByName('chat');
  const inp = document.getElementById('chatInp');
  if (!inp) return;
  if (!q) { inp.value = '@ia '; inp.focus(); return; }
  inp.value = '@ia ' + q; sendChat();
}

// On enrichit sendChat : "@ia …" ou "@roomy …" part vers Roomy, le reste ne change pas.
const _sendChatOrig = sendChat;
sendChat = async function () {
  const inp = document.getElementById('chatInp');
  const text = (inp?.value || '').trim();
  if (!IA_TRIGGER.test(text)) return _sendChatOrig();
  if (!currentUser) { showToast('Connecte-toi d\'abord'); return; }
  inp.value = ''; inp.style.height = '';
  const { error } = await sb.from('chat_messages').insert({ author: currentUser, content: text });
  if (error) { showToast('❌ ' + error.message); return; }
  callIA(text.replace(IA_TRIGGER, '').trim() || 'Aide');
};

/* ═══════════ 6. Branchements sur l'app existante ═══════════ */
function requireEditorSoft() { if (!isEditorMode()) { showToast('🔒 Mode lecteur'); return false; } return true; }
function emptyBox(ic, txt) { return `<div class="empty"><div class="empty-ic">${ic}</div>${txt}</div>`; }
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }

// Le visiteur ne voit aucun prix. On retire les montants des données dès le chargement, texte
// libre compris, pour couvrir d'un coup toutes les vues. Le visiteur n'écrit jamais en base,
// donc rien de tout ça ne peut y repartir. C'est de l'affichage : la clé publique lit toujours tout.
const RE_PRIX = /[~≈]?\s*\d[\d\s.,]*(?:\s*(?:à|-|–)\s*\d[\d\s.,]*)?\s*(?:€|euros?\b|¥|yuans?\b|CNY\b|RMB\b|francs?\b)|[€¥]\s*\d[\d.,]*/gi;
const sansPrix = t => t ? String(t).replace(RE_PRIX, ' …') : t;
function masquerPrix() {
  if (currentUser !== 'visiteur') return;
  D.budget = [];
  D.items.forEach(x => { x.prix = 0; x.notes = sansPrix(x.notes); x.description = sansPrix(x.description); });
  D.planning.forEach(x => { x.notes = sansPrix(x.notes); });
  D.notes.forEach(x => { x.titre = sansPrix(x.titre); x.corps = sansPrix(x.corps); });
  D.checklist.forEach(x => { x.label = sansPrix(x.label); });
  (D.cerveau || []).forEach(x => { x.titre = sansPrix(x.titre); x.resume = sansPrix(x.resume); x.prix_texte = null; x.prix_estime = null; });
}

const _renderAllOrig = renderAll;
renderAll = function () {
  masquerPrix();
  _renderAllOrig();
  if (currentUser === 'visiteur' && document.getElementById('tab-budget')?.classList.contains('on')) goTab('programme');
  if (document.getElementById('tab-programme')?.classList.contains('on')) renderProgramme();
  if (document.getElementById('tab-cerveau')?.classList.contains('on')) renderCerveau();
};
const _goTabOrig = goTab;
goTab = function (n, el) {
  if (currentUser === 'visiteur' && n === 'budget') { n = 'programme'; el = document.getElementById('nb-programme'); }
  ensureProgrammeTab();
  _goTabOrig(n, el);
  if (n === 'programme') renderProgramme();
  if (n === 'cerveau') renderCerveau();
  if (n === 'carte') setTimeout(() => { addMapExtras(); renderCerveauMarkers(); geocodeAllMissing(true); }, 400);
};
const _drawerMapOrig = getDrawerMainNavMap;
getDrawerMainNavMap = function () { return { ..._drawerMapOrig(), programme: 'nb-programme', activites: 'nb-more', cerveau: 'nb-more' }; };
const _syncDrawerOrig = syncNavDrawerState;
syncNavDrawerState = function (t) { _syncDrawerOrig(t); if (t === 'activites' || t === 'cerveau') document.getElementById('nd-' + t)?.classList.add('active'); };
const _renderMarkersOrig = renderMapMarkers;
renderMapMarkers = function () { _renderMarkersOrig(); renderCerveauMarkers(); };

function addMapExtras() {
  const ctr = document.querySelector('.map-controls');
  if (ctr && !document.getElementById('geoAllBtn')) {
    ctr.insertAdjacentHTML('beforeend', `<button class="map-ctrl-btn" id="geoAllBtn" onclick="geocodeAllMissing(false)" title="Placer toutes les adresses manquantes">📍</button>`);
  }
  const fr = document.querySelector('.map-filter-row');
  if (fr && !fr.querySelector('[data-cer]')) fr.insertAdjacentHTML('beforeend', `<button class="map-f-chip" data-cer="1" onclick="toggleMapFilter('cerveau',this)">🧠 Cerveau</button>`);
}

// Temps réel sur le cerveau
function subCerveau() {
  try {
    sb.channel('rt-cerveau').on('postgres_changes', { event: '*', schema: 'public', table: 'cerveau' }, () => loadCerveau()).subscribe();
  } catch (e) { }
}

/* ── Styles ── */
document.head.insertAdjacentHTML('beforeend', `<style>
.prog-switch{display:flex;gap:6px;padding:0 16px 12px;overflow-x:auto;scrollbar-width:none}
.prog-switch button,.prog-chips button{flex:none;border:1px solid var(--border);background:var(--surface);color:var(--txt2);border-radius:999px;padding:8px 13px;font:600 .74rem var(--font);cursor:pointer}
.prog-switch button.on,.prog-chips button.on{background:var(--txt);color:var(--bg);border-color:var(--txt)}
.prog-chips{display:flex;gap:6px;padding:0 16px 8px;overflow-x:auto;scrollbar-width:none}
.prog-chips button{padding:6px 11px;font-size:.7rem}
.prog-chips.flush{padding:0 0 8px}
.reader-mode .prog-switch button[data-v="claude"],.reader-mode [data-act="ask"],.reader-mode .qa-chip[onclick^="askIA"],.reader-mode #nb-budget,.reader-mode .qa-chip[onclick*="openBudgetSheet"],.reader-mode .qa-chip[onclick*="'stats'"],.reader-mode .gc-price,.reader-mode .ic-quick,.reader-mode .ic-prix,.reader-mode .tr-price,.reader-mode .tl-day-total,.reader-mode .form-group:has(.prix-masque){display:none!important}
#progBody,#cerBody{padding:0 16px 24px}
.prog-section-t{font:700 .78rem var(--font);color:var(--txt2);text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px}
.prog-card{display:flex;gap:11px;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;box-shadow:var(--shadow-sm);cursor:pointer}
.prog-card-ic{font-size:1.25rem;line-height:1.2}
.prog-card-main{flex:1;min-width:0}
.prog-card-t{font-weight:600;font-size:.9rem}
.prog-card-s{font-size:.74rem;color:var(--txt2);margin-top:2px;overflow-wrap:anywhere}
.prog-card-r{display:flex;flex-direction:column;align-items:flex-end;font-size:.78rem;font-weight:600;gap:4px}
.prog-pin{font-size:.75rem}.prog-pin.off{opacity:.45;font-size:.65rem}
.prog-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.prog-tags span{font-size:.62rem;background:var(--sand);border-radius:6px;padding:2px 6px;color:var(--txt2)}
.prog-btn{border:none;background:var(--accent);color:#fff;border-radius:10px;padding:7px 11px;font:600 .72rem var(--font);cursor:pointer;text-decoration:none;white-space:nowrap}
.prog-btn.light{background:var(--sand);color:var(--txt)}
.prog-ok{font-size:.66rem;color:var(--green)}
.prog-wide{width:100%;margin:10px 0 4px;border:1px dashed var(--border2);background:transparent;color:var(--txt);border-radius:var(--radius-sm);padding:11px;font:600 .8rem var(--font);cursor:pointer}
.prog-hint{font-size:.72rem;color:var(--txt2);margin:6px 0 10px;line-height:1.45}
.prog-warn{background:#fff7e6;color:#92400e;border-radius:10px;padding:9px 12px;font-size:.76rem;margin-bottom:10px}
.prog-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:8px;margin-bottom:12px}
.prog-kpis div{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}
.prog-kpis b{display:block;font-size:1.05rem}.prog-kpis span{font-size:.65rem;color:var(--txt2)}
.prog-next{background:linear-gradient(135deg,#1f1411,#4a2c24);color:#fff;border-radius:var(--radius);padding:16px;margin-bottom:6px;box-shadow:var(--shadow)}
.prog-next-k{font-size:.66rem;opacity:.7;text-transform:uppercase;letter-spacing:.06em}
.prog-next-name{font-size:1.2rem;font-weight:700;margin:4px 0}
.prog-next-when{font-size:.8rem;opacity:.85}
.prog-next-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.prog-day{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 12px 4px;margin-bottom:12px}
.prog-day-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.prog-day-h span{font-size:.72rem;color:var(--txt2)}
.prog-day-a{display:flex;gap:6px}
.prog-tl{position:relative;margin:4px 0 8px}
.prog-tl-row{display:grid;grid-template-columns:50px 14px 1fr;gap:8px;align-items:start;padding:6px 0}
.prog-tl-row.past{opacity:.4}
.prog-tl-h{font:700 .78rem var(--font);text-align:right;padding-top:2px}.prog-tl-h i{font-style:normal;font-size:.6rem;display:block}
.prog-tl-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);margin-top:5px;box-shadow:0 0 0 3px var(--rose)}
.k-transport .prog-tl-dot{background:var(--blue)}.k-hotel .prog-tl-dot{background:var(--gold)}
.prog-tl-t{font-weight:600;font-size:.86rem}
.prog-tl-s{font-size:.72rem;color:var(--txt2);margin-top:2px}
.prog-tl-w{font-size:.68rem;color:#b45309;margin-top:3px}
.prog-leg{font-size:.66rem;color:var(--txt3);padding-left:72px}
.prog-toolbar{display:flex;gap:8px;padding:0 16px 12px}.prog-toolbar input{flex:1}
.bot-chip.ia{background:linear-gradient(135deg,#1f1411,#4a2c24);color:#fff;border-color:transparent}
.map-popup .mp-resume{font-size:.7rem;line-height:1.4;color:var(--txt);margin-bottom:8px}
.map-popup .mp-warn{display:flex;gap:6px;align-items:flex-start;font-size:.64rem;line-height:1.35;color:#8a5a14;background:#fbf1dc;border-radius:8px;padding:5px 8px;margin-bottom:8px}
.map-popup .mp-warn .gi{width:12px;height:12px;flex-shrink:0;margin-top:1px}
.map-popup .mp-type .gi,.map-popup .mp-btn .gi{width:13px;height:13px;vertical-align:-2px;margin-right:3px}
.map-popup .mp-actions{flex-wrap:wrap}
.map-popup .mp-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 6px;min-height:34px;text-decoration:none;color:var(--txt)}
.map-popup .mp-btn.mp-go{color:#fff}
.map-popup .mp-btn.mp-full{flex:1 1 100%;color:var(--accent)}
.cer-pin{width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid #3f9480;display:flex;align-items:center;justify-content:center;font-size:.9rem;box-shadow:0 3px 10px rgba(0,0,0,.2)}
.route-num{width:24px;height:24px;border-radius:50%;background:#8b1d2c;color:#fff;font:700 .75rem var(--font);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
</style>`);

/* ── Démarrage ── */
ensureProgrammeTab();
loadCerveau(); subCerveau();
