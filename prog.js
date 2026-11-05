/* ═══════════════════════════════════════════════════════════════
   prog.js — Onglet Programme : 4 vues sur les jours choisis
     1. Vital     transports, trains, hôtels, activités réservées ou à heure fixe
     2. Léger     les grandes heures + des idées dans les trous (liste, puis cerveau)
     3. Détaillé  la journée minute par minute, trajets compris
     4. Claude    conversation qui ne modifie QUE le programme
   Chargé APRÈS ia.js : réutilise ses fonctions (buildDayPlan, quickPlan, …).
   ═══════════════════════════════════════════════════════════════ */

/* ───────────── Jours affichés (communs aux 4 vues) ───────────── */
let progSel = (() => { try { return JSON.parse(localStorage.getItem('prog_sel') || '[]'); } catch (e) { return []; } })();
let progMulti = progSel.length > 1;

function progDaysSelected() {
  const all = sortedDays();
  if (!all.length) return [];
  let sel = all.filter(d => progSel.includes(d.date_voyage));
  if (!sel.length) {
    const now = chinaNow().date;
    sel = [all.find(d => d.date_voyage === now) || all.find(d => d.date_voyage > now) || all[all.length - 1]];
  }
  return sel;
}
function progSetSel(dates) {
  progSel = dates;
  try { localStorage.setItem('prog_sel', JSON.stringify(dates)); } catch (e) { /* stockage indisponible : tant pis */ }
}
function progPickDay(date) {
  const cur = progDaysSelected().map(d => d.date_voyage);
  if (progMulti) {
    const next = cur.includes(date) ? cur.filter(x => x !== date) : [...cur, date];
    progSetSel(next.length ? next : [date]);
  } else progSetSel([date]);
  renderProgramme();
}
function progPickAll() { progMulti = true; progSetSel(sortedDays().map(d => d.date_voyage)); renderProgramme(); }
function progToggleMulti() {
  progMulti = !progMulti;
  if (!progMulti) { const first = progDaysSelected()[0]; progSetSel(first ? [first.date_voyage] : []); }
  renderProgramme();
}

function renderDaysBar() {
  const box = document.getElementById('progDays'); if (!box) return;
  const all = sortedDays(), sel = progDaysSelected().map(d => d.date_voyage), today = chinaNow().date;
  if (!all.length) { box.innerHTML = ''; return; }
  const allOn = sel.length === all.length;
  box.innerHTML = `<div class="pd-bar">
    <button class="pd pd-opt ${allOn ? 'on' : ''}" data-act="all">Tout</button>
    <button class="pd pd-opt ${progMulti && !allOn ? 'on' : ''}" data-act="multi" title="Choisir plusieurs jours">Plusieurs</button>
    ${all.map(d => {
      const dt = new Date(d.date_voyage + 'T12:00:00');
      const wd = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      return `<button class="pd ${sel.includes(d.date_voyage) ? 'on' : ''} ${d.date_voyage === today ? 'today' : ''}" data-act="day" data-d="${esc(d.date_voyage)}"><i>${wd}</i><b>${dt.getDate()}</b></button>`;
    }).join('')}</div>`;
  box.querySelector('.pd.on:not(.pd-opt)')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/* ───────────── Rendu principal ───────────── */
function renderProgrammeVues() {
  ensureProgrammeTab();
  const body = document.getElementById('progBody'); if (!body) return;
  if (!['vital', 'leger', 'detail', 'claude'].includes(progView)) progView = 'leger'; // anciennes valeurs mémorisées
  document.querySelectorAll('#tab-programme .prog-switch button').forEach(b => b.classList.toggle('on', b.dataset.v === progView));
  const days = sortedDays(), now = chinaNow(), first = days[0]?.date_voyage;
  const sub = document.getElementById('progSub');
  if (sub) sub.textContent = first && now.date < first ? `Départ dans ${Math.ceil((new Date(first) - new Date(now.date)) / 86400000)} jours` : (days.length ? `${days.length} jours · heure de Chine ${fmtMin(now.min)}` : '');
  if (!body.dataset.bound) { body.dataset.bound = '1'; body.addEventListener('click', progClick); body.addEventListener('keydown', progKey); }
  const bar = document.getElementById('progDays');
  if (bar && !bar.dataset.bound) { bar.dataset.bound = '1'; bar.addEventListener('click', progClick); }
  renderDaysBar();
  if (!days.length) { body.innerHTML = emptyBox('📅', 'Pas encore de jours dans le planning.'); return; }
  if (progView === 'claude') { renderClaudeView(); return; }
  body.innerHTML = ({ vital: viewVital, leger: viewLeger, detail: viewDetail })[progView]();
}

/* Un seul gestionnaire de clics pour tout l'onglet : les données passent par data-*, jamais dans un onclick. */
function progClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset;
  switch (d.act) {
    case 'day': progPickDay(d.d); break;
    case 'all': progPickAll(); break;
    case 'multi': progToggleMulti(); break;
    case 'nav': navigateToItem(JSON.parse(d.nav)); break;
    case 'cn': copyPhrase(d.cn); break;
    case 'open': { const it = D.items.find(x => x.id == d.id); if (it) openItemSheet(it.type, it); break; }
    case 'caser': progCaser(d); break;
    case 'ask': askProg(d.q); break;
    case 'fill': { const i = document.getElementById('pcInp'); if (i) { i.value = d.q; i.focus(); } break; }
    case 'send': sendProg(); break;
    case 'locate': progLocate(true); break;
    case 'reset': progChat = []; saveChat(); renderClaudeView(); break;
  }
}
function progKey(e) {
  if (e.target.id === 'pcInp' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendProg(); }
}

/* ───────────── Utilitaires communs ───────────── */
// « réservé(e)(s) », « résa », « confirmé » : mais pas « à réserver » ni « pas réservé »
const RESERVE_RE = /(^|[^a-zà-ÿ])(r[ée]serv[ée]e?s?|r[ée]sa|confirm[ée]e?s?)($|[^a-zà-ÿ])/i;
const PAS_RESERVE_RE = /(pas|non|plus|jamais)\s+(encore\s+)?(r[ée]serv|confirm)/i;
function isReserved(it) {
  if (!it) return false;
  if (it.fait && (it.type === 'hotel' || it.type === 'transport')) return true;
  const txt = `${it.notes || ''} ${it.description || ''}`;
  return RESERVE_RE.test(txt) && !PAS_RESERVE_RE.test(txt);
}
const round5 = m => Math.ceil(m / 5) * 5;
const periodeDe = m => m < 12 * 60 + 30 ? 'Matin' : m < 18 * 60 ? 'Après-midi' : 'Soir';
const hm = m => { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`; };
const dureeTxt = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`;
function legInfo(km) { return { min: travelMin(km), mode: travelMode(km), km }; }
function legTxt(l) { return `${l.min} min ${l.mode}${l.km != null ? ' · ' + (Math.round(l.km * 10) / 10) + ' km' : ''}`; }
const navData = (nom, pos, cn) => esc(JSON.stringify({ nom, lat: pos[0], lng: pos[1], adresse_cn: cn || '' }));
function navBtns(nom, pos, cn, cls) {
  return (pos ? `<button class="prog-btn light ${cls || ''}" data-act="nav" data-nav="${navData(nom, pos, cn)}">🧭 Y aller</button>` : '')
    + (cn ? `<button class="prog-btn light ${cls || ''}" data-act="cn" data-cn="${esc(cn)}">📋 Adresse chinoise</button>` : '');
}
// Les transports stockent leurs coordonnées dans les notes (DEP_LAT / DEP_LNG / ARR_LAT / ARR_LNG).
function transportPos(t, which) {
  const n = String(t?.notes || '');
  const la = n.match(new RegExp(which + '_LAT:\\s*(-?[\\d.]+)')), ln = n.match(new RegExp(which + '_LNG:\\s*(-?[\\d.]+)'));
  return la && ln ? [parseFloat(la[1]), parseFloat(ln[1])] : null;
}
// prix_type vient de la base : on n'en garde l'icône que si elle est connue, jamais le texte brut.
const ICONES_TRANSPORT = ['🚄', '🚅', '🚆', '🚂', '🚇', '✈️', '✈', '🛫', '🚌', '🚍', '🚗', '🚕', '🚖', '🚢', '⛴️', '⛴'];
const transportIcon = t => { const x = String(t?.prix_type || '').trim().split(' ')[0]; return ICONES_TRANSPORT.includes(x) ? x : '🚄'; };
const dayVilles = day => [...new Set([day.matin_lieu, day.aprem_lieu, day.soir_lieu].filter(x => x && x !== '—'))].join(' → ');
function dayHead(day) {
  return `<div class="pd-head"><b>${fmtDate(day.date_voyage)}</b><span>${esc(dayVilles(day))}</span></div>`;
}
const posOf = it => it ? (itemPos(it) || null) : null;
// Le matin on part de l'hôtel de la nuit précédente ; le jour du départ la journée n'a plus d'hôtel à elle.
function departHotel(day) {
  const veille = new Date(new Date(day.date_voyage + 'T12:00:00') - 86400000).toISOString().split('T')[0];
  return hotelForDay(D.planning.find(d => d.date_voyage === veille) || { date_voyage: veille }) || hotelForDay(day);
}

/* ── Où est-on ? ──
   Avant l'arrivée en Chine (Paris, escale à Helsinki, vol) et après le départ, on ne propose rien pour la Chine.
   On le déduit des vols : drapeaux « D: / A: » des notes, sinon le nom des villes dans « Départ → Arrivée ». */
const VILLES_CN = /shanghai|chongqing|chengdu|wulong|furong|zhangjiajie|beijing|p[ée]kin|xi.?an|hong.?kong|guilin|hangzhou|suzhou/i;
const dayNum = iso => Math.round(new Date(iso + 'T12:00:00').getTime() / 86400000);
function transportNoms(t) {
  const parts = String(t.nom || '').split(/\s*(?:→|->|—|–|↔|=>)\s*/).map(x => x.trim()).filter(Boolean);
  return { dep: parts[0] || '', arr: parts[parts.length - 1] || '' };
}
// Tous les vols / trajets datés, en minutes absolues (jours depuis 1970 × 1440 + minutes). Arrivée avant le départ = lendemain.
function transportLegs() {
  return D.items.filter(t => t.type === 'transport' && /^\d{4}-\d\d-\d\d$/.test(t.adresse || '') && toMin(t.quartier) != null).map(t => {
    const n = transportNoms(t), notes = String(t.notes || '');
    const dep = dayNum(t.adresse) * 1440 + toMin(t.quartier), arrM = toMin(t.description);
    let arr = arrM == null ? dep + 120 : dayNum(t.adresse) * 1440 + arrM;
    if (arr <= dep) arr += 1440;
    const flag = k => (notes.match(new RegExp('(?:^|\\|)\\s*' + k + ':([^|]*)')) || [])[1] || '';
    const cn = (txt, nom) => /🇨🇳|\bCN\b/.test(txt) || VILLES_CN.test(nom);
    return { t, dep, arr, depNom: n.dep, arrNom: n.arr, depCN: cn(flag('D'), n.dep), arrCN: cn(flag('A'), n.arr) };
  }).sort((a, b) => a.dep - b.dep);
}
// Fenêtre passée en Chine pour une journée : [cs, ce] en minutes depuis minuit. Sans vol connu : toute la journée.
function chinaWindow(day) {
  const legs = transportLegs(), base = dayNum(day.date_voyage) * 1440, clamp = v => Math.min(1440, Math.max(0, v));
  const entree = legs.filter(l => l.arrCN && !l.depCN).map(l => l.arr), sortie = legs.filter(l => l.depCN && !l.arrCN).map(l => l.dep);
  return { cs: clamp((entree.length ? Math.min(...entree) : -Infinity) - base), ce: clamp((sortie.length ? Math.max(...sortie) : Infinity) - base), legs, base };
}
// À la minute m de la journée : en vol, ou posé quelque part (dernière arrivée connue) entre deux vols.
function horsChine(day, m) {
  const { legs, base } = chinaWindow(day), abs = base + m;
  if (legs.some(l => l.dep <= abs && abs < l.arr)) return { enVol: true };
  const last = [...legs].reverse().find(l => l.arr <= abs), next = legs.find(l => l.dep > abs);
  return { enVol: false, nom: last ? last.arrNom : '', de: last ? last.arr - base : null, a: next ? next.dep - base : null };
}
const hmJour = m => m == null ? '' : hm(Math.min(1440, Math.max(0, m)) % 1440);
function nuitHtml(day, hotel) {
  if (hotel) return `<div class="pv-night">🌙 Nuit : <b>${esc(hotel.nom)}</b>${hotel.ville ? ' · ' + esc(hotel.ville) : ''}${hotel.fait ? '' : ' <em>à réserver</em>'}</div>`;
  const { cs, ce, legs, base } = chinaWindow(day);
  const envol = legs.find(l => l.dep < base + 1440 && l.arr > base + 1440);
  if (envol) return `<div class="pv-night">🌙 Nuit en vol : <b>${esc(envol.depNom)} → ${esc(envol.arrNom)}</b></div>`;
  if (ce < 1440) return `<div class="pv-night">✈️ Départ de Chine ce jour-là : pas de nuit à l'hôtel.</div>`;
  if (cs >= 1440) return '';
  return `<div class="prog-warn">Pas d'hôtel pour cette nuit.</div>`;
}
function escaleBlock(e) {
  const lieu = e.nom ? `Escale à ${esc(e.nom)}` : 'En transit';
  const duree = e.de != null && e.a != null ? `de ${hmJour(e.de)} à ${hmJour(e.a)}` : '';
  return `<div class="pl-esc"><div class="pl-esc-t">✈️ ${lieu}</div><div class="pl-esc-s">${duree}${duree ? ' · ' : ''}vous n'êtes pas en Chine à ce moment-là : rien n'est proposé.</div></div>`;
}

/* ── Prix : billets 🎫 (1 = pas cher, 2 = moyen, 3 = cher) et estimation en euros ──
   Seuils par personne : activités 10 € / 35 €, restos 8 € / 25 €. Gratuit ou inconnu : rien. */
const TAUX_EUR = { yuan: 1 / 7.8, dollar: 0.92 };
const nombreFr = x => parseFloat(String(x).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
function prixEuroTexte(texte) {
  const t = String(texte || '');
  if (!t.trim()) return null;
  if (/gratuit|entr[ée]e libre|\bfree\b/i.test(t) && !/\d/.test(t)) return 0;
  if (/\bjours?\b|\bnuits?\b|\bsemaines?\b/i.test(t)) return null; // budget de voyage, pas un prix d'activité
  const NB = '(\\d[\\d\\s\\u00a0\\u202f]*(?:[.,]\\d+)?)', RANGE = NB + '(?:\\s*(?:à|-|–)\\s*' + NB + ')?\\s*';
  for (const [dev, taux] of [['€|euros?', 1], ['¥|yuans?|rmb|cny|kuai', TAUX_EUR.yuan], ['\\$|usd|dollars?', TAUX_EUR.dollar]]) {
    const m = t.match(new RegExp(RANGE + '(?:' + dev + ')', 'i'));
    if (!m) continue;
    const a = nombreFr(m[1]), b = m[2] ? nombreFr(m[2]) : a;
    if (!isFinite(a) || !isFinite(b)) continue;
    const v = (a + b) / 2 * taux;
    return /pour (deux|2)\b/i.test(t) ? v / 2 : v;
  }
  return null;
}
const prixNote = notes => { const m = String(notes || '').match(/Prix\s*:\s*([^|]+)/i); return m ? prixEuroTexte(m[1]) : null; };
const prixDeLieu = it => { const p = parseFloat(it?.prix); return p > 0 ? p : prixNote(it?.notes); };
const prixDeReel = c => { const p = parseFloat(c?.prix_estime); return p > 0 ? p : prixEuroTexte(c?.prix_texte); };
function nbBillets(euro, type) {
  if (!(euro > 0)) return 0;
  const [bas, haut] = type === 'restaurant' ? [8, 25] : [10, 35];
  return euro < bas ? 1 : euro < haut ? 2 : 3;
}
function prixBadge(euro, type) {
  const n = nbBillets(euro, type); if (!n) return '';
  const e = euro < 10 ? String(Math.round(euro * 2) / 2).replace('.', ',') : String(Math.round(euro));
  return `<span class="pl-prix t${n}" title="${['', 'pas cher', 'prix moyen', 'cher'][n]} : environ ${e} €">${'🎫'.repeat(n)}<em>~${e} €</em></span>`;
}

/* ═══════════ 1. VITAL ═══════════ */
function vitalRows(day) {
  const plan = buildDayPlan(day), rows = [];
  transportsForDay(day).forEach(t => {
    const arrJ1 = t.adresse !== day.date_voyage;
    const dep = String(t.notes || '').match(/DEP_ADDR:([^|]+)/)?.[1]?.trim();
    rows.push({ t: arrJ1 ? (toMin(t.description) ?? 6 * 60) : (toMin(t.quartier) ?? 0), ic: transportIcon(t), item: t,
      title: t.nom, sub: arrJ1 ? `Arrivée à ${t.description || '?'} (départ la veille)` : `${t.quartier || '?'} → ${t.description || '?'}`,
      extra: dep ? 'Départ : ' + dep : '', tag: t.fait ? ['Réservé', 'ok'] : ['À réserver', 'warn'], big: true,
      cn: t.adresse_cn });
  });
  D.items.filter(h => h.type === 'hotel' && h.adresse === day.date_voyage).forEach(h => {
    rows.push({ t: 15 * 60, ic: '🏨', item: h, title: 'Check-in · ' + h.nom, sub: `${h.ville || ''}${h.quartier ? ' · ' + h.quartier : ''} · ${parseInt(h.prix_type) || 1} nuit(s)`,
      tag: h.fait ? ['Réservé', 'ok'] : ['À réserver', 'warn'], big: true, cn: h.adresse_cn, pos: itemPos(h) });
  });
  plan.entries.filter(e => e.kind === 'stop' && (e.fixed || isReserved(e.item))).forEach(e => {
    rows.push({ t: e.min, ic: TYPE_IC[e.item.type] || '🎯', item: e.item, title: e.label,
      sub: [e.item.quartier, e.item.ville, e.item.duree && '⏱ ' + e.item.duree].filter(Boolean).join(' · '),
      prix: prixBadge(prixDeLieu(e.item), e.item.type),
      tag: isReserved(e.item) ? ['Réservé', 'ok'] : ['Heure fixée', 'fix'], warn: e.warn, cn: e.item.adresse_cn, pos: itemPos(e.item) });
  });
  rows.sort((a, b) => a.t - b.t);
  return { rows, plan };
}

function viewVital() {
  const days = progDaysSelected();
  let nT = 0, nR = 0, h = '';
  const blocks = days.map(day => {
    const { rows, plan } = vitalRows(day);
    nT += rows.filter(r => r.item.type === 'transport').length;
    nR += rows.filter(r => r.item.type !== 'transport' && r.item.type !== 'hotel').length;
    const nuit = nuitHtml(day, plan.hotel);
    return `<div class="prog-day">${dayHead(day)}
      ${rows.length ? rows.map(vitalRow).join('') : `<div class="pv-empty">Rien de vital ce jour-là : pas de train, pas d'heure fixée.</div>`}
      ${nuit}</div>`;
  }).join('');
  h += `<div class="prog-hint">${nT} trajet(s) · ${nR} activité(s) à heure fixe ou réservée sur ${days.length} jour(s).</div>` + blocks;
  return h;
}
function vitalRow(r) {
  return `<div class="pv-row ${r.big ? 'big' : ''}">
    <div class="pv-h">${fmtMin(r.t)}</div>
    <div class="pv-main" data-act="open" data-id="${esc(r.item.id)}">
      <div class="pv-t">${esc(r.ic)} ${esc(r.title)} <span class="pv-tag ${r.tag[1]}">${r.tag[0]}</span>${r.prix || ''}</div>
      ${r.sub ? `<div class="pv-s">${esc(r.sub)}</div>` : ''}${r.extra ? `<div class="pv-s">${esc(r.extra)}</div>` : ''}
      ${r.warn ? `<div class="prog-tl-w">${esc(r.warn)}</div>` : ''}
      ${(r.pos || r.cn) ? `<div class="pv-a">${navBtns(r.title, r.pos, r.cn, 'sm')}</div>` : ''}
    </div></div>`;
}

/* ═══════════ 2. LÉGER ═══════════
   Les repères de la journée, et dans chaque trou libre des idées proches de l'endroit où on sera.
   Ordre des sources : 1) la liste de l'app  2) le cerveau  3) internet (via Claude, au bouton). */
const DAY_START = 9 * 60, DAY_END = 22 * 60 + 30, GAP_MIN = 75;

function transportEnd(e) { return e.end != null && e.end >= e.min ? e.end : e.min + 30; } // arrivée le lendemain : on ne bloque que le départ
function busyOf(entries) {
  return entries.filter(e => e.kind !== 'hotel').map(e => e.kind === 'transport'
    ? { s: e.min - 60, en: transportEnd(e) + 30, e }
    : { s: e.min - (e.travel || 10), en: (e.end ?? e.min + 60) + 5, e }).sort((a, b) => a.s - b.s);
}
function posAfter(e, hotel) {
  if (!e) return posOf(hotel);
  if (e.kind === 'transport') return transportPos(e.item, 'ARR') || posOf(hotel);
  return itemPos(e.item) || posOf(hotel);
}
function rawGaps(plan) {
  const busy = busyOf(plan.entries), raw = [];
  let cursor = DAY_START, prev = null;
  busy.forEach(b => {
    if (b.s - cursor >= GAP_MIN) raw.push({ s: cursor, en: b.s, prev, next: b.e });
    if (b.en > cursor) { cursor = b.en; prev = b.e; }
  });
  if (DAY_END - cursor >= GAP_MIN) raw.push({ s: cursor, en: DAY_END, prev, next: null });
  return raw;
}
// Un trou de plus de 4 h est coupé à 12h30 et 18h : on ne propose pas la même chose pour l'aprem et pour le soir.
function splitGap(g) {
  if (g.en - g.s <= 240) return [g];
  const coupes = [12 * 60 + 30, 18 * 60].filter(c => c - g.s >= GAP_MIN && g.en - c >= GAP_MIN);
  const bornes = [g.s, ...coupes, g.en];
  return bornes.slice(0, -1).map((b, i) => ({ s: b, en: bornes[i + 1], prev: g.prev, next: g.next }));
}
// Les trous ne gardent que la partie passée en Chine. Le reste (avant l'arrivée, après le départ) devient une escale
// (« Escale à Helsinki ») ou rien du tout quand on est en vol.
function gapsDuJour(day, plan) {
  const { cs, ce } = chinaWindow(day), gaps = [], escales = [], vus = new Set();
  rawGaps(plan).forEach(g => {
    const s = Math.max(g.s, cs), en = Math.min(g.en, ce);
    if (en - s >= GAP_MIN) gaps.push(...splitGap({ ...g, s, en }));
    [[g.s, Math.min(g.en, cs)], [Math.max(g.s, ce), g.en]].forEach(([a, b]) => {
      if (b - a < GAP_MIN) return;
      const h = horsChine(day, a);
      const cle = `${h.nom}|${h.de}`;
      if (h.enVol || vus.has(cle)) return;
      vus.add(cle); escales.push({ ...h, t: h.de != null ? Math.max(h.de, 0) : a });
    });
  });
  return { gaps, escales };
}

const enCours = it => D.slots.some(s => s.item_id === it.id);
const PRIO_PEN = { coeur: 0, sympa: 0.8, '': 1.6, optionnel: 3.2 };

function suggestions(ref, ville, gap, kinds, n, used) {
  const longueur = gap.en - gap.s;
  const FENETRE = { 'Matin': [DAY_START, 12 * 60 + 30], 'Après-midi': [12 * 60 + 30, 18 * 60], 'Soir': [18 * 60, DAY_END] };
  const momentOk = m => !FENETRE[m] || Math.min(gap.en, FENETRE[m][1]) - Math.max(gap.s, FENETRE[m][0]) >= 45;
  const notTooFar = (pos, vl) => pos && ref ? kmBetween(ref, pos) <= 8 : (!ville || !vl || vl === ville);
  const L = D.items.filter(x => kinds.includes(x.type) && !used.has('i' + x.id) && getItemStatut(x) === 'idee' && !enCours(x) && momentOk(x.prix_type)
      && (kinds.includes('restaurant') || (DUREE_MIN[x.duree || ''] || 60) <= longueur - 20)
      && notTooFar(itemPos(x), x.ville))
    .map(x => { const pos = itemPos(x), km = pos && ref ? kmBetween(ref, pos) : null;
      return { src: 'liste', id: x.id, nom: x.nom, ville: x.ville, quartier: x.quartier, duree: x.duree, prio: x.priorite, pos, km, cn: x.adresse_cn,
        score: (km ?? 5) + (PRIO_PEN[x.priorite || ''] ?? 1.6), resume: x.description, prix: prixBadge(prixDeLieu(x), x.type) }; })
    .sort((a, b) => a.score - b.score);
  const cats = kinds.includes('restaurant') ? ['restaurant'] : ['activite', 'cafe'];
  const C = (D.cerveau || []).filter(c => !c.item_id && !used.has('c' + c.cle) && cats.includes(c.categorie) && momentOk(c.meilleur_moment)
      && notTooFar(c.lat && c.lng ? [parseFloat(c.lat), parseFloat(c.lng)] : null, c.ville))
    .map(c => { const pos = c.lat && c.lng ? [parseFloat(c.lat), parseFloat(c.lng)] : null, km = pos && ref ? kmBetween(ref, pos) : null;
      return { src: 'cerveau', cle: c.cle, nom: c.titre || c.lieu_nom, ville: c.ville, quartier: c.lieu_nom && c.lieu_nom !== c.titre ? c.lieu_nom : '', pos, km, cn: c.adresse_cn, url: c.url,
        score: (km ?? 5) + (c.confiance === 'haute' ? 0 : c.confiance === 'moyenne' ? 0.6 : 1.4) + (pos ? 0 : 2), resume: c.resume, prix: prixBadge(prixDeReel(c), c.categorie) }; })
    .sort((a, b) => a.score - b.score);
  const pris = [...L, ...C].slice(0, n);
  pris.forEach(x => used.add(x.src === 'liste' ? 'i' + x.id : 'c' + x.cle));
  return pris;
}

function suggCard(s, gap, dayId) {
  const leg = legInfo(s.km), start = round5(gap.s + (s.km != null ? leg.min : 0));
  const pre = { dayId, periode: periodeDe(start), heure: fmtMin(start) };
  const lien = s.url && /^https?:\/\//i.test(s.url) ? `<a class="pl-src" href="${esc(s.url)}" target="_blank" rel="noopener">voir le reel</a>` : '';
  return `<div class="pl-s">
    <div class="pl-s-main"><div class="pl-s-t">${s.prio === 'coeur' ? '⭐ ' : ''}${esc(s.nom)} <span class="pl-badge ${s.src}">${s.src === 'liste' ? 'Votre liste' : 'Cerveau'}</span></div>
      <div class="pl-s-s">${esc([s.quartier || s.ville, s.duree && '⏱ ' + s.duree, s.km != null ? legTxt(leg) : 'distance inconnue'].filter(Boolean).join(' · '))}${s.prix ? ' ' + s.prix : ''}</div>
      ${s.resume ? `<div class="pl-s-s clip">${esc(s.resume)}</div>` : ''}${lien}</div>
    <div class="pl-s-a">
      <button class="prog-btn" data-act="caser" ${s.src === 'liste' ? `data-id="${esc(s.id)}"` : `data-cle="${esc(s.cle)}"`} data-pre="${esc(JSON.stringify(pre))}">＋ Caser</button>
      ${s.pos ? `<button class="prog-btn light" data-act="nav" data-nav="${navData(s.nom, s.pos, s.cn)}">🧭</button>` : ''}
    </div></div>`;
}

async function progCaser(d) {
  const pre = JSON.parse(d.pre || '{}');
  if (!requireEditorSoft()) return;
  let id = d.id;
  if (!id && d.cle) id = await cerveauToItem(d.cle);
  if (id) quickPlan(id, pre);
}

function gapBlock(day, plan, g, used) {
  const base = g.prev ? plan.hotel : (departHotel(day) || plan.hotel);
  const ref = posAfter(g.prev, base);
  const refNom = g.prev ? (g.prev.kind === 'transport' ? 'la gare' : g.prev.label) : (base ? base.nom : 'le point de départ');
  const ville = g.prev?.item?.ville || base?.ville || '';
  const restos = suggestions(ref, ville, g, ['restaurant'], 3, used);
  const activites = suggestions(ref, ville, g, ['activite', 'cafe'], 4, used);
  const q = `Le ${day.date_voyage} on est libres de ${fmtMin(g.s)} à ${fmtMin(g.en)}${ville ? ' à ' + ville : ''}, près de ${refNom}. Propose-nous 3 restos et 4 activités, d'abord dans ma liste, puis le cerveau, puis internet.`;
  return `<div class="pl-gap">
    <div class="pl-gap-h"><b>Libres de ${hm(g.s)} à ${hm(g.en)}</b><span>près de ${esc(refNom)}${ville ? ' · ' + esc(ville) : ''}</span></div>
    <div class="pl-gap-k">Manger ou boire un verre</div>
    ${restos.length ? restos.map(s => suggCard(s, g, day.id)).join('') : '<div class="pl-none">Rien de proche dans la liste ni le cerveau.</div>'}
    <div class="pl-gap-k">À faire</div>
    ${activites.length ? activites.map(s => suggCard(s, g, day.id)).join('') : '<div class="pl-none">Rien de proche dans la liste ni le cerveau.</div>'}
    <button class="prog-wide" data-act="ask" data-q="${esc(q)}">🧠 Plus d'idées avec Roomy (cerveau, puis internet)</button>
  </div>`;
}

function legerAnchor(e) {
  const it = e.item, fort = e.kind === 'transport' || e.fixed || isReserved(it);
  const ic = e.kind === 'transport' ? transportIcon(it) : (TYPE_IC[it.type] || '📍');
  const sub = e.kind === 'transport' ? e.sub : [it.quartier, it.duree && '⏱ ' + it.duree].filter(Boolean).join(' · ');
  const prix = e.kind === 'transport' ? '' : prixBadge(prixDeLieu(it), it.type);
  return `<div class="pl-a ${fort ? 'fort' : ''}"><div class="pl-a-h">${fmtMin(e.min)}</div><div class="pl-a-c"><div class="pl-a-t">${esc(ic)} ${esc(e.label)}</div>${sub || prix ? `<div class="pl-a-s">${esc(sub)}${prix ? ' ' + prix : ''}</div>` : ''}${e.warn ? `<div class="prog-tl-w">${esc(e.warn)}</div>` : ''}</div></div>`;
}

function nextStepCard() {
  const ns = nextStep(); if (!ns) return '';
  const now = chinaNow(), e = ns.e, it = e.item;
  const delta = ns.day.date_voyage === now.date ? e.min - now.min : null;
  const when = delta == null ? `${fmtDate(ns.day.date_voyage)} · ${fmtMin(e.min)}` : delta <= 0 ? 'Maintenant' : `Dans ${delta >= 60 ? Math.floor(delta / 60) + 'h' + String(delta % 60).padStart(2, '0') : delta + ' min'} · ${fmtMin(e.min)}`;
  return `<div class="prog-next"><div class="prog-next-k">Prochaine étape</div><div class="prog-next-name">${esc(e.label)}</div>
    <div class="prog-next-when">${when}${it?.ville ? ' · ' + esc(it.ville) : ''}</div>
    <div class="prog-next-actions">${navBtns(e.label, e.kind === 'stop' ? itemPos(it) : null, it?.adresse_cn)}</div></div>`;
}

function viewLeger() {
  const days = progDaysSelected(), today = chinaNow().date;
  let h = days.some(d => d.date_voyage === today) ? nextStepCard() : '';
  h += `<div class="prog-hint">Les grandes heures, et des idées pour les moments libres. Elles viennent d'abord de votre liste, puis du cerveau.</div>`;
  days.forEach(day => {
    const plan = buildDayPlan(day), { gaps, escales } = gapsDuJour(day, plan), used = new Set();
    const anchors = plan.entries.filter(e => e.kind !== 'hotel');
    const items = [...anchors.map(e => ({ t: e.min, html: legerAnchor(e) })), ...gaps.map(g => ({ t: g.s - 0.5, html: gapBlock(day, plan, g, used) })),
      ...escales.map(e => ({ t: e.t - 0.5, html: escaleBlock(e) }))].sort((a, b) => a.t - b.t);
    h += `<div class="prog-day">${dayHead(day)}${items.map(i => i.html).join('')}
      ${nuitHtml(day, plan.hotel)}</div>`;
  });
  return h;
}

/* ═══════════ 3. DÉTAILLÉ ═══════════ */
const AVANCE_GARE = it => /✈|vol|avion|flight/i.test(`${it.prix_type || ''} ${it.nom || ''}`) ? 120 : /🚄|🚅|🚆|train|TGV|G\d{2,4}|D\d{2,4}/i.test(`${it.prix_type || ''} ${it.nom || ''}`) ? 60 : 30;

function detailRows(day) {
  const plan = buildDayPlan(day), hotel = plan.hotel, rows = [];
  const depart = departHotel(day) || hotel;
  let loc = { pos: posOf(depart), nom: depart ? depart.nom : 'votre point de départ' }, free = null; // free = heure à laquelle on est dispo
  const entries = plan.entries.filter(e => e.kind !== 'hotel').sort((a, b) => a.min - b.min);
  const push = r => rows.push(r);
  entries.forEach((e, i) => {
    if (e.kind === 'transport') {
      const it = e.item, arrJ1 = it.adresse !== day.date_voyage;
      const L = transportLegs().find(l => l.t.id === it.id);
      const avion = /✈|vol|avion|flight/i.test(`${it.prix_type || ''} ${it.nom || ''}`);
      const lieuArr = `${avion ? 'l\'aéroport' : 'la gare'}${L?.arrNom ? ' de ' + L.arrNom : ''}`;
      if (arrJ1) {
        push({ t: e.min, k: 'step', title: `Arrivée : ${e.label}`, sub: e.sub });
        loc = { pos: transportPos(it, 'ARR') || loc.pos, nom: lieuArr }; free = e.min;
        return;
      }
      const avance = AVANCE_GARE(it), depPos = transportPos(it, 'DEP');
      const leg = legInfo(depPos && loc.pos ? kmBetween(loc.pos, depPos) : null);
      const quitter = e.min - avance - leg.min;
      if (L && !L.depCN) {
        // On part d'une escale (pas de trajet en ville à calculer) : on montre l'attente, c'est tout.
        if (free != null && e.min - avance - free >= 60) push({ t: free, k: 'free', title: `Escale à ${loc.nom.replace(/^l'aéroport de /, '')}`, sub: `${dureeTxt(e.min - free)} avant le vol de ${fmtMin(e.min)} · hors de Chine` });
      } else push({ t: quitter, k: 'go', title: `Quitter ${loc.nom}`, sub: `${legTxt(leg)} jusqu'à la gare ou l'aéroport` });
      push({ t: e.min - avance, k: 'step', title: avance >= 120 ? "Être à l'aéroport" : avance >= 60 ? 'Être à la gare' : "Être au point d'embarquement", sub: `${avance} min avant le départ · ${avance >= 120 ? 'enregistrement et sécurité' : avance >= 60 ? 'contrôle des billets et sécurité' : 'embarquement'}` });
      push({ t: e.min, k: 'key', ic: transportIcon(it), title: e.label, sub: e.sub, cn: it.adresse_cn, pos: depPos });
      const memeJour = e.end != null && e.end > e.min;
      if (memeJour) push({ t: e.end, k: 'step', title: `Arrivée${L?.arrNom ? ' à ' + L.arrNom : ''}`, sub: '' });
      else if (e.end != null) push({ t: e.min + 1, hl: 'J+1', k: 'step', title: `Arrivée demain à ${fmtMin(e.end)}${L?.arrNom ? ' · ' + L.arrNom : ''}`, sub: 'Nuit en vol' });
      loc = { pos: transportPos(it, 'ARR') || null, nom: lieuArr }; free = memeJour ? e.end : null;
      return;
    }
    // activité / repas
    const it = e.item, pos = itemPos(it);
    const leg = legInfo(pos && loc.pos ? kmBetween(loc.pos, pos) : null);
    const quitter = e.min - leg.min;
    if (free != null && quitter - free >= 10) push({ t: free, k: 'free', title: quitter - free >= 90 ? `Temps libre de ${dureeTxt(quitter - free)}` : `Marge de ${dureeTxt(quitter - free)}`, sub: quitter - free >= 90 ? 'Repas, pause ou idées dans la vue Léger' : 'Pause ou imprévus' });
    push({ t: quitter, k: 'go', title: `Quitter ${loc.nom}`, sub: legTxt(leg) + (pos ? '' : ' (position de l\'étape inconnue : temps estimé)') });
    const dur = (e.end ?? e.min + 60) - e.min;
    push({ t: e.min, k: 'key', ic: TYPE_IC[it.type] || '📍', title: e.label, sub: `Sur place ${dureeTxt(dur)} · jusqu'à ${fmtMin(e.min + dur)}${e.fixed ? ' · heure fixée' : ''}`,
      prix: prixBadge(prixDeLieu(it), it.type), cn: it.adresse_cn, pos, warn: e.warn, id: it.id, adr: [it.quartier, it.adresse].filter(Boolean).join(' · ') });
    loc = { pos: pos || loc.pos, nom: e.label }; free = e.min + dur;
  });
  if (hotel && entries.length && entries[entries.length - 1].kind !== 'transport') {
    const hp = posOf(hotel), leg = legInfo(hp && loc.pos ? kmBetween(loc.pos, hp) : null);
    const finProg = free ?? 21 * 60, retour = Math.max(finProg, 21 * 60);
    if (retour - finProg >= 60) push({ t: finProg, k: 'free', title: 'Soirée libre', sub: 'Rien de prévu : idées dans la vue Léger' });
    push({ t: retour, k: 'go', title: retour > finProg ? `Retour à l'hôtel (heure indicative)` : `Retour à l'hôtel`, sub: legTxt(leg) });
    push({ t: retour + leg.min, k: 'step', title: `Nuit : ${hotel.nom}`, sub: hotel.ville || '' });
  }
  return rows.sort((a, b) => a.t - b.t);
}

function viewDetail() {
  const days = progDaysSelected();
  let h = `<div class="prog-hint">Minute par minute : à pied sous ~600 m, sinon métro ou DiDi. Les durées sur place viennent de la fiche du lieu (1 h par défaut, 1 h 15 pour un repas).</div>`;
  days.forEach(day => {
    const rows = detailRows(day);
    h += `<div class="prog-day">${dayHead(day)}`;
    h += rows.length ? `<div class="pd-tl">${rows.map(r => {
      if (r.k === 'key') return `<div class="pd-r key"><div class="pd-h">${fmtMin(r.t)}</div><div class="pd-dot"></div><div class="pd-c">
          <div class="pd-t" ${r.id ? `data-act="open" data-id="${esc(r.id)}"` : ''}>${esc(r.ic)} ${esc(r.title)}${r.prix ? ' ' + r.prix : ''}</div>${r.sub ? `<div class="pd-s">${esc(r.sub)}</div>` : ''}
          ${r.adr ? `<div class="pd-s">${esc(r.adr)}</div>` : ''}${r.warn ? `<div class="prog-tl-w">${esc(r.warn)}</div>` : ''}
          ${(r.pos || r.cn) ? `<div class="pv-a">${navBtns(r.title, r.pos, r.cn, 'sm')}</div>` : ''}</div></div>`;
      return `<div class="pd-r ${r.k}"><div class="pd-h">${r.hl || fmtMin(r.t)}</div><div class="pd-dot"></div><div class="pd-c"><div class="pd-t">${esc(r.title)}</div>${r.sub ? `<div class="pd-s">${esc(r.sub)}</div>` : ''}</div></div>`;
    }).join('')}</div>`
      : `<div class="pv-empty">Journée libre : rien de prévu. Demande à Roomy ou ouvre la vue Léger pour des idées.</div>
         <button class="prog-wide" data-act="ask" data-q="${esc(`Le ${day.date_voyage} on n'a rien de prévu. Propose-nous une journée complète, d'abord depuis ma liste, puis le cerveau, et planifie-la.`)}">Faire proposer une journée par Roomy</button>`;
    h += `</div>`;
  });
  return h;
}

/* ═══════════ 4. CLAUDE (programme uniquement) ═══════════ */
let progChat = (() => { try { return JSON.parse(localStorage.getItem('prog_chat') || '[]'); } catch (e) { return []; } })();
let progBusy = false, progLoc = null;
const saveChat = () => { try { localStorage.setItem('prog_chat', JSON.stringify(progChat.slice(-40))); } catch (e) { /* quota : on garde en mémoire */ } };

function pcFmt(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">lien</a>')
    .replace(/^\s*[-•]\s+(.+)$/gm, '<span class="pc-li">$1</span>').replace(/<\/span>\n/g, '</span>').replace(/\n/g, '<br>');
}
function pcMessages() {
  if (!progChat.length) return `<div class="pc-hello"><img class="mimi-hello" src="mascotte/explique.webp" alt="Roomy"><b>Roomy, pour le programme seulement.</b> Elle peut décaler, retirer ou ajouter des créneaux, noter ce que vous avez fait, et chercher des idées près de vous. Ses sources : votre liste, puis le cerveau, puis internet. Elle ne touche ni au budget, ni aux hôtels, ni aux transports.<div style="clear:both"></div></div>`;
  return progChat.map(m => `<div class="pc-m ${m.role}">${pcFmt(m.text)}${m.changes?.length ? `<div class="pc-ch">${m.changes.map(c => `<span>${esc(String(c).replace(/^[^\p{L}\p{N}]+/u, ''))}</span>`).join('')}</div>` : ''}</div>`).join('')
    + (progBusy ? '<div class="pc-m assistant"><div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>' : '');
}
function locTxt() {
  if (progLoc) return `Position connue (± ${Math.round(progLoc.acc || 0)} m)`;
  return 'Position inconnue';
}
function renderClaudeView() {
  const body = document.getElementById('progBody'); if (!body) return;
  if (currentUser === 'visiteur' || !currentUser) { body.innerHTML = emptyBox('🔒', 'La conversation avec Roomy est réservée à Matis et Lise.'); return; }
  let wrap = document.getElementById('pcWrap');
  if (!wrap) {
    body.innerHTML = `<div id="pcWrap" class="pc-wrap">
      <div class="pc-top"><span id="pcLoc"></span><button class="prog-btn light sm" data-act="locate">📍 Me localiser</button><button class="prog-btn light sm" data-act="reset">Effacer</button></div>
      <div id="pcMsgs" class="pc-msgs"></div>
      <div class="prog-chips flush pc-chips">
        <button data-act="ask" data-q="Qu'est-ce qu'on peut faire près de nous, maintenant ? Liste d'abord, puis cerveau, puis internet.">Près de nous</button>
        <button data-act="ask" data-q="On a fini plus tôt que prévu, que fait-on ensuite ?">On a fini plus tôt</button>
        <button data-act="fill" data-q="On n'a pas pu faire ">On n'a pas pu faire…</button>
        <button data-act="fill" data-q="Décale le reste de la journée de ">Décaler la journée</button>
        <button data-act="ask" data-q="Où manger près de nous ?">Où manger</button>
      </div>
      <div class="pc-in"><textarea id="pcInp" rows="1" placeholder="Dis à Roomy comment adapter le programme…"></textarea><button class="prog-btn" data-act="send">Envoyer</button></div>
    </div>`;
  }
  document.getElementById('pcLoc').textContent = locTxt();
  const box = document.getElementById('pcMsgs'); box.innerHTML = pcMessages(); box.scrollTop = box.scrollHeight;
}

function progLocate(toast) {
  return new Promise(res => {
    const secours = () => typeof myPos !== 'undefined' && myPos ? (progLoc = { lat: myPos.lat, lng: myPos.lng, acc: myPos.acc, ts: Date.now() }) : null;
    if (!navigator.geolocation) { if (toast) showToast('GPS non disponible'); return res(secours()); }
    navigator.geolocation.getCurrentPosition(p => {
      progLoc = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: Date.now() };
      if (typeof myPos !== 'undefined') myPos = { lat: progLoc.lat, lng: progLoc.lng, acc: progLoc.acc };
      const l = document.getElementById('pcLoc'); if (l) l.textContent = locTxt();
      if (toast) showToast('Position trouvée');
      res(progLoc);
    }, () => {
      if (toast) showToast('Position introuvable : autorise la localisation');
      res(secours());
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 });
  });
}

function askProg(q) {
  if (!currentUser || currentUser === 'visiteur') { showToast('Connecte-toi d\'abord'); return; }
  progView = 'claude'; try { localStorage.setItem('prog_view', 'claude'); } catch (e) { /* ignoré */ }
  const el = document.getElementById('nb-programme');
  if (!document.getElementById('tab-programme')?.classList.contains('on')) goTab('programme', el); else renderProgramme();
  if (q) { const i = document.getElementById('pcInp'); if (i) i.value = q; sendProg(); }
}

async function sendProg() {
  const inp = document.getElementById('pcInp'); if (!inp || progBusy) return;
  const question = inp.value.trim(); if (!question) return;
  if (!requireEditorSoft()) return;
  inp.value = '';
  const historique = progChat.slice(-8).map(m => ({ role: m.role, text: m.text }));
  progChat.push({ role: 'user', text: question }); progBusy = true; saveChat(); renderClaudeView();
  try {
    const position = await progLocate(false);
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': iaSecret() },
      body: JSON.stringify({ mode: 'programme', question, user: USERS[currentUser]?.name || currentUser, jours: progDaysSelected().map(d => d.date_voyage),
        position: position ? { lat: position.lat, lng: position.lng, acc: position.acc } : null, historique }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.removeItem('ia_secret'); progChat.push({ role: 'assistant', text: 'Code assistant invalide. Renvoie ton message pour le ressaisir.' }); }
    else if (!r.ok) progChat.push({ role: 'assistant', text: 'Roomy est indisponible : ' + (j.error || r.status) });
    else {
      progChat.push({ role: 'assistant', text: String(j.reply || 'C\'est fait.').replace(/^🧠\s*/, ''), changes: j.changes || [] });
      if (j.changes?.length) { try { await loadAll(); renderAll(); } catch (e) { /* le temps réel rattrapera */ } }
    }
  } catch (e) {
    progChat.push({ role: 'assistant', text: 'Roomy est injoignable (réseau ou fonction non déployée).' });
  } finally { progBusy = false; saveChat(); if (progView === 'claude') renderClaudeView(); }
}

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
#progDays{padding:0 16px 8px}
.pd-bar{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px}
.pd{flex:none;min-width:44px;border:1px solid var(--border);background:var(--surface);color:var(--txt2);border-radius:14px;padding:6px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;line-height:1.15;font-family:var(--font)}
.pd i{font-style:normal;font-size:.6rem;text-transform:uppercase;letter-spacing:.04em}.pd b{font-size:.95rem}
.pd.today{border-color:var(--or,#b8893a)}
.pd.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.pd-opt{justify-content:center;font:600 .72rem var(--font);padding:6px 11px;border-radius:999px}
.pd-opt.on{background:var(--txt);border-color:var(--txt);color:var(--bg)}
.pd-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.pd-head b{font-size:.95rem}.pd-head span{font-size:.72rem;color:var(--txt2)}
.prog-btn.sm{padding:5px 9px;font-size:.66rem}
.pv-row{display:grid;grid-template-columns:48px 1fr;gap:8px;padding:9px 0;border-top:1px solid var(--border)}
.pv-row:first-of-type{border-top:none}
.pv-h{font:700 .85rem var(--font);text-align:right;padding-top:1px}
.pv-row.big .pv-h{color:var(--accent);font-size:.95rem}
.pv-main{min-width:0;cursor:pointer}
.pv-t{font-weight:700;font-size:.86rem}.pv-s{font-size:.72rem;color:var(--txt2);margin-top:2px;overflow-wrap:anywhere}
.pv-a{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.pv-tag{font-size:.58rem;font-weight:700;border-radius:999px;padding:2px 7px;margin-left:4px;vertical-align:1px;background:var(--sand);color:var(--txt2)}
.pv-tag.ok{background:#e4f2ea;color:#2f6b4a}.pv-tag.warn{background:#fdecd2;color:#92400e}.pv-tag.fix{background:var(--rose,#f7e3e0);color:var(--accent)}
.pv-night{font-size:.76rem;color:var(--txt2);padding:9px 0 6px;border-top:1px solid var(--border);margin-top:4px}.pv-night em{color:#92400e;font-style:normal;font-weight:600}
.pv-empty{font-size:.76rem;color:var(--txt2);padding:6px 0 10px}
.pl-a{display:grid;grid-template-columns:48px 1fr;gap:8px;padding:7px 0}
.pl-a-h{font:700 .82rem var(--font);text-align:right;color:var(--txt2)}.pl-a.fort .pl-a-h{color:var(--accent);font-size:.95rem}
.pl-a-t{font-size:.85rem;font-weight:600}.pl-a.fort .pl-a-t{font-weight:800}.pl-a-s{font-size:.7rem;color:var(--txt2);margin-top:1px}
.pl-gap{background:var(--bg);border:1px dashed var(--border2);border-radius:var(--radius-sm);padding:10px;margin:6px 0 10px}
.pl-gap-h{display:flex;flex-direction:column;margin-bottom:6px}.pl-gap-h b{font-size:.82rem}.pl-gap-h span{font-size:.7rem;color:var(--txt2)}
.pl-gap-k{font:700 .64rem var(--font);text-transform:uppercase;letter-spacing:.06em;color:var(--or,#b8893a);margin:10px 0 4px}
.pl-s{display:flex;gap:8px;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:9px;margin-bottom:6px}
.pl-s-main{flex:1;min-width:0}.pl-s-t{font-weight:600;font-size:.83rem}.pl-s-s{font-size:.69rem;color:var(--txt2);margin-top:2px;overflow-wrap:anywhere}
.pl-s-s.clip{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pl-s-a{display:flex;flex-direction:column;gap:5px}
.pl-badge{font-size:.56rem;font-weight:700;border-radius:999px;padding:2px 6px;margin-left:3px;vertical-align:1px}
.pl-badge.liste{background:#e4f2ea;color:#2f6b4a}.pl-badge.cerveau{background:var(--rose,#f7e3e0);color:var(--accent)}
.pl-src{font-size:.66rem;color:var(--accent);text-decoration:underline}
.pl-none{font-size:.72rem;color:var(--txt3);padding:2px 0 4px}
.pd-tl{padding:2px 0 6px}
.pd-r{display:grid;grid-template-columns:50px 12px 1fr;gap:8px;padding:5px 0}
.pd-h{font:700 .78rem var(--font);text-align:right;padding-top:1px;color:var(--txt2)}
.pd-dot{width:8px;height:8px;border-radius:50%;background:var(--border2);margin-top:5px}
.pd-t{font-size:.82rem;font-weight:600}.pd-s{font-size:.7rem;color:var(--txt2);margin-top:1px;overflow-wrap:anywhere}
.pd-r.key .pd-h{color:var(--accent);font-size:.9rem}.pd-r.key .pd-dot{background:var(--accent);box-shadow:0 0 0 3px var(--rose,#f7e3e0)}.pd-r.key .pd-t{font-weight:800;font-size:.9rem;cursor:pointer}
.pd-r.go .pd-t,.pd-r.free .pd-t{font-weight:500;color:var(--txt2)}.pd-r.free .pd-dot{background:transparent;border:1px dashed var(--border2)}
.pl-prix{display:inline-flex;align-items:center;gap:1px;vertical-align:middle;margin-left:4px;color:var(--or,#b8893a);white-space:nowrap}
.pl-prix .gi,.pl-prix svg{width:1.05em;height:1.05em}
.pl-prix em{font-style:normal;font-weight:700;font-size:.9em;margin-left:3px;color:var(--txt2)}
.pl-esc{display:flex;flex-direction:column;gap:2px;background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--or,#b8893a);border-radius:var(--radius-sm);padding:10px 12px;margin:6px 0 10px}
.pl-esc-t{font-weight:700;font-size:.84rem}.pl-esc-s{font-size:.72rem;color:var(--txt2);line-height:1.45}
.pc-wrap{display:flex;flex-direction:column;gap:8px}
.pc-top{display:flex;align-items:center;gap:6px;font-size:.7rem;color:var(--txt2)}.pc-top span{flex:1}
.pc-msgs{min-height:240px;max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:2px}
.pc-hello{font-size:.78rem;color:var(--txt2);line-height:1.55;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px}.pc-hello b{color:var(--txt)}
.pc-m{max-width:88%;padding:9px 12px;border-radius:16px;font-size:.82rem;line-height:1.5;overflow-wrap:anywhere}
.pc-m.user{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:5px}
.pc-m.assistant{align-self:flex-start;background:var(--surface);border:1px solid var(--border);border-bottom-left-radius:5px}
.pc-m a{color:inherit;text-decoration:underline}.pc-li{display:block;padding-left:12px;text-indent:-12px}.pc-li::before{content:'• '}
.pc-ch{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.pc-ch span{font-size:.62rem;background:var(--sand);border-radius:6px;padding:2px 6px;color:var(--txt2)}
.pc-in{display:flex;gap:8px;align-items:flex-end}
.prog-switch{gap:5px}.prog-switch button{flex:1 1 auto;padding:8px 6px;font-size:.72rem;white-space:nowrap}
.pc-in textarea{flex:1;min-height:44px;box-sizing:border-box;resize:none;border:1px solid var(--border2);background:var(--surface);color:var(--txt);border-radius:14px;padding:10px 12px;font:500 .84rem var(--font);max-height:120px}
</style>`);

