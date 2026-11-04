/* ═══════════════════════════════════════════════════════════════
   ia.js — Cerveau + Assistant IA + Programme (vital / activités / planning optimisé)
   Chargé APRÈS le script principal de index.html : réutilise ses globales
   (sb, D, esc, fmtE, goTab, isEditorMode, showToast, navigateToItem, mapInst…).
   ═══════════════════════════════════════════════════════════════ */

const IA_URL = SB_URL + '/functions/v1/assistant';
const IA_TRIGGER = /^(@ia|@claude|\/ia)\b/i;
const PERIODE_START = { 'Matin': '09:30', 'Après-midi': '14:00', 'Soir': '19:00', 'Journée': '09:30', '': '10:00' };
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
function travelMin(km) { return km == null ? 20 : Math.max(10, Math.round(km / 18 * 60 + 8)); } // métro/DiDi en ville ≈ 18 km/h + attente
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
  const arrivals = out.filter(o => o.kind === 'transport' && o.end != null).map(o => o.end);
  const firstFree = arrivals.length ? Math.max(...arrivals) + 60 : null;

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
      let t = Math.max(cursor + (out.some(o => o.kind === 'stop') ? tr : 0), x.fixedMin ?? 0);
      if (x.fixedMin != null) t = x.fixedMin;
      const dur = DUREE_MIN[x.item.duree || ''] || (x.item.type === 'restaurant' ? 75 : 60);
      out.push({ kind: 'stop', min: t, end: t + dur, item: x.item, slot: x.slot, periode: p, fixed: x.fixedMin != null,
        km, travel: tr, pos: itemPos(x.item), label: x.item.nom });
      cursor = t + dur; prevPos = itemPos(x.item) || prevPos;
    });
  });
  if (hotel) out.push({ kind: 'hotel', min: Math.max(cursor || 0, 21 * 60), item: hotel, label: hotel.nom, sub: 'Nuit · ' + (hotel.ville || '') });
  out.sort((a, b) => a.min - b.min);
  // conflits : chevauchements avec un transport
  out.forEach(o => {
    if (o.kind !== 'stop') return;
    const clash = out.find(t => t.kind === 'transport' && t.end != null && o.min < t.end + 30 && o.end > t.min - 90 && t.min > 0);
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
let progView = localStorage.getItem('prog_view') || 'jour';
let progVille = '';
let progMoment = '';

function ensureProgrammeTab() {
  if (document.getElementById('tab-programme')) return;
  const main = document.getElementById('mainContent');
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-programme';
  tab.innerHTML = `
    <div class="ph" style="padding-bottom:8px;"><h1>Programme</h1><p id="progSub"></p></div>
    <div class="prog-switch">
      <button data-v="jour">🧭 Aujourd'hui</button>
      <button data-v="vital">🏨 Vital</button>
      <button data-v="activites">🎯 Activités</button>
      <button data-v="optimise">⚡ Planning</button>
    </div>
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
    nbAct.querySelector('.nlb').textContent = 'Prog.';
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
    qa.insertAdjacentHTML('afterbegin', `<button class="qa-chip accent" onclick="goTabByName('programme')">🧭 Programme</button><button class="qa-chip" onclick="askIA()">🧠 Demander à l'IA</button>`);
  }
  // Puces de l'assistant dans le chat
  const chips = document.getElementById('chatBotChips');
  if (chips) chips.insertAdjacentHTML('afterbegin', `
    <button class="bot-chip ia" onclick="askIA('Qu\\'est-ce qu\\'on fait cet aprem ? Propose 3 options depuis le cerveau.')">🧠 Cet aprem ?</button>
    <button class="bot-chip ia" onclick="askIA('Optimise le planning de demain (ordre et heures) et applique-le.')">⚡ Optimiser demain</button>
    <button class="bot-chip ia" onclick="askIA('Quels reels du cerveau ne sont pas encore dans le planning ? Classe-les par ville.')">🧠 Pas encore casés</button>`);
  const inp = document.getElementById('chatInp');
  if (inp) inp.placeholder = 'Message… (@ia pour l\'assistant IA)';
}

function renderProgramme() {
  ensureProgrammeTab();
  const body = document.getElementById('progBody'); if (!body) return;
  document.querySelectorAll('#tab-programme .prog-switch button').forEach(b => b.classList.toggle('on', b.dataset.v === progView));
  const days = sortedDays();
  const now = chinaNow();
  const first = days[0]?.date_voyage;
  const sub = document.getElementById('progSub');
  if (sub) sub.textContent = first && now.date < first ? `Départ dans ${Math.ceil((new Date(first) - new Date(now.date)) / 86400000)} jours` : (days.length ? `${days.length} jours · heure de Chine ${fmtMin(now.min)}` : '');
  body.innerHTML = ({ jour: viewJour, vital: viewVital, activites: viewActivites, optimise: viewOptimise })[progView]?.() || '';
}

/* ── Vue "Aujourd'hui" : feuille de route du jour + prochaine activité ── */
function viewJour() {
  const days = sortedDays();
  if (!days.length) return emptyBox('📅', 'Pas encore de jours dans le planning.');
  const now = chinaNow();
  const day = days.find(d => d.date_voyage === now.date) || days.find(d => d.date_voyage > now.date) || days[days.length - 1];
  const isToday = day.date_voyage === now.date;
  const ns = nextStep();
  let h = '';
  if (ns) {
    const e = ns.e, it = e.item;
    const delta = ns.day.date_voyage === now.date ? e.min - now.min : null;
    const when = delta == null ? `${fmtDate(ns.day.date_voyage)} · ${fmtMin(e.min)}` : delta <= 0 ? 'Maintenant' : `Dans ${delta >= 60 ? Math.floor(delta / 60) + 'h' + String(delta % 60).padStart(2, '0') : delta + ' min'} · ${fmtMin(e.min)}`;
    const pos = itemPos(it);
    h += `<div class="prog-next">
      <div class="prog-next-k">⏭ Prochaine étape</div>
      <div class="prog-next-name">${esc(e.label)}</div>
      <div class="prog-next-when">${when}${it?.ville ? ' · ' + esc(it.ville) : ''}</div>
      <div class="prog-next-actions">
        ${pos ? `<button class="prog-btn light" onclick='navigateToItem(${JSON.stringify({ nom: it.nom, lat: pos[0], lng: pos[1], adresse_cn: it.adresse_cn || '' }).replace(/'/g, '&#39;')})'>🧭 Y aller</button>` : ''}
        ${it?.adresse_cn ? `<button class="prog-btn light" onclick="copyPhrase('${esc(it.adresse_cn).replace(/'/g, "\\'")}')">📋 Adresse chinoise</button>` : ''}
      </div></div>`;
  }
  h += `<div class="prog-section-t">${isToday ? 'Feuille de route du jour' : 'Prochaine journée'} — ${fmtDate(day.date_voyage)}</div>`;
  h += dayTimeline(buildDayPlan(day), isToday ? now.min : null);
  h += `<button class="prog-wide" onclick="askIA('Fais-moi la feuille de route détaillée du ${day.date_voyage} : horaires, trajets, où manger, astuces. Utilise le cerveau.')">🧠 Feuille de route détaillée par l'IA</button>`;
  return h;
}

/* ── Vue "Vital" : hôtels + transports, dans l'ordre ── */
function viewVital() {
  const hotels = D.items.filter(x => x.type === 'hotel').sort((a, b) => String(a.adresse || '9').localeCompare(String(b.adresse || '9')));
  const trans = D.items.filter(x => x.type === 'transport').sort((a, b) => (String(a.adresse || '9') + (a.quartier || '')).localeCompare(String(b.adresse || '9') + (b.quartier || '')));
  const rows = [
    ...hotels.map(h => ({ date: h.adresse || '', t: toMin('15:00'), html: vitalCard('🏨', h.nom, `${esc(h.ville || '')}${h.quartier ? ' · ' + esc(h.quartier) : ''}`, `Check-in ${h.adresse ? fmtDate(h.adresse) : '?'} · ${parseInt(h.prix_type) || 1} nuit(s)`, h) })),
    ...trans.map(t => ({ date: t.adresse || '', t: toMin(t.quartier) ?? 0, html: vitalCard((t.prix_type || '🚄').split(' ')[0], t.nom, `${esc(t.quartier || '?')} → ${esc(t.description || '?')}`, `${t.adresse ? fmtDate(t.adresse) : 'Date ?'}${(String(t.notes || '').match(/DEP_ADDR:([^|]+)/) || [])[1] ? ' · ' + esc(String(t.notes).match(/DEP_ADDR:([^|]+)/)[1].trim()) : ''}`, t) })),
  ].sort((a, b) => (a.date + String(a.t).padStart(4, '0')).localeCompare(b.date + String(b.t).padStart(4, '0')));
  const total = [...hotels, ...trans].reduce((s, x) => s + (parseFloat(x.prix) || 0), 0);
  const nights = hotels.reduce((s, h) => s + (parseInt(h.prix_type) || 1), 0);
  const missing = sortedDays().filter(d => !hotelForDay(d)).map(d => fmtDate(d.date_voyage));
  let h = `<div class="prog-kpis"><div><b>${hotels.length}</b><span>hôtels</span></div><div><b>${nights}</b><span>nuits</span></div><div><b>${trans.length}</b><span>trajets</span></div><div><b>${fmtE(total)}</b><span>vital</span></div></div>`;
  if (missing.length) h += `<div class="prog-warn">⚠️ Pas d'hôtel pour : ${missing.join(', ')}</div>`;
  h += rows.length ? rows.map(r => r.html).join('') : emptyBox('🏨', 'Aucun hôtel ni transport.');
  return h;
}
function vitalCard(ic, nom, line1, line2, it) {
  const pos = itemPos(it);
  return `<div class="prog-card" onclick="openItemSheet('${it.type}', D.items.find(x=>x.id=='${it.id}'))">
    <div class="prog-card-ic">${ic}</div>
    <div class="prog-card-main"><div class="prog-card-t">${esc(nom)}</div><div class="prog-card-s">${line1}</div><div class="prog-card-s">${line2}</div></div>
    <div class="prog-card-r">${parseFloat(it.prix) > 0 ? fmtE(parseFloat(it.prix)) : ''}${pos ? '<div class="prog-pin">📍</div>' : '<div class="prog-pin off" title="Pas encore sur la carte">📍?</div>'}</div>
  </div>`;
}

/* ── Vue "Activités possibles" : idées non planifiées + cerveau, filtrables ville / moment ── */
function viewActivites() {
  const idees = D.items.filter(x => ['activite', 'restaurant', 'cafe'].includes(x.type) && getItemStatut(x) === 'idee');
  const reels = (D.cerveau || []).filter(c => !c.item_id && ['activite', 'restaurant', 'cafe', '', null, undefined].includes(c.categorie));
  const villes = [...new Set([...idees.map(x => x.ville), ...reels.map(c => c.ville)].filter(Boolean))];
  const f = x => (!progVille || x.ville === progVille) && (!progMoment || (x.prix_type || x.meilleur_moment || '') === progMoment || (progMoment === 'Après-midi' && !(x.prix_type || x.meilleur_moment)));
  const prio = { coeur: 0, sympa: 1, '': 2, optionnel: 3 };
  const list = idees.filter(f).sort((a, b) => (prio[a.priorite || ''] ?? 2) - (prio[b.priorite || ''] ?? 2));
  const rl = reels.filter(f);
  let h = `<div class="prog-chips">${['', ...villes].map(v => `<button class="${progVille === v ? 'on' : ''}" onclick="progVille='${esc(v)}';renderProgramme()">${v ? (VILLE_IC[v] || '') + ' ' + esc(v) : 'Toutes'}</button>`).join('')}</div>
    <div class="prog-chips">${['', 'Matin', 'Après-midi', 'Soir'].map(m => `<button class="${progMoment === m ? 'on' : ''}" onclick="progMoment='${m}';renderProgramme()">${m || 'Tout moment'}</button>`).join('')}</div>`;
  h += `<button class="prog-wide" onclick="askIA('Qu\\'est-ce qu\\'on peut faire${progMoment ? ' le ' + progMoment.toLowerCase() : ''}${progVille ? ' à ' + progVille : ''} ? Pioche dans le cerveau puis vérifie sur le web.')">🧠 Idées de l'IA pour ce filtre</button>`;
  h += `<div class="prog-section-t">💡 Idées dans l'app (${list.length})</div>`;
  h += list.length ? list.map(it => `<div class="prog-card">
      <div class="prog-card-ic">${TYPE_IC[it.type] || '🎯'}</div>
      <div class="prog-card-main" onclick="openItemSheet('${it.type}', D.items.find(x=>x.id=='${it.id}'))">
        <div class="prog-card-t">${it.priorite === 'coeur' ? '⭐ ' : ''}${esc(it.nom)}</div>
        <div class="prog-card-s">${esc(it.ville || '')}${it.quartier ? ' · ' + esc(it.quartier) : ''}${it.duree ? ' · ⏱ ' + esc(it.duree) : ''}${it.prix_type ? ' · ' + esc(it.prix_type) : ''}</div>
        ${it.description ? `<div class="prog-card-s">${esc(it.description)}</div>` : ''}
      </div>
      <div class="prog-card-r"><button class="prog-btn" onclick="event.stopPropagation();quickPlan('${it.id}')">＋ Caser</button></div>
    </div>`).join('') : emptyBox('💡', 'Aucune idée pour ce filtre.');
  h += `<div class="prog-section-t">🧠 Dans le cerveau, pas encore dans l'app (${rl.length})</div>`;
  h += rl.length ? rl.map(cerveauCard).join('') : emptyBox('🧠', D.cerveau.length ? 'Tout le cerveau est déjà dans l\'app 👌' : 'Cerveau vide — importe tes reels (onglet 🧠 Cerveau).');
  return h;
}

/* ── Vue "Planning optimisé" ── */
function viewOptimise() {
  const days = sortedDays();
  if (!days.length) return emptyBox('📅', 'Pas encore de jours dans le planning.');
  let h = `<div class="prog-hint">Ordre recalculé au plus court depuis l'hôtel, heures estimées avec les trajets (métro/DiDi ≈ 18 km/h). Les heures que vous avez fixées sont respectées.</div>`;
  days.forEach(day => {
    const plan = buildDayPlan(day);
    const stops = plan.entries.filter(e => e.kind === 'stop');
    const km = stops.reduce((s, e) => s + (e.km || 0), 0);
    h += `<div class="prog-day">
      <div class="prog-day-h"><div><b>${fmtDate(day.date_voyage)}</b> <span>${esc([day.matin_lieu, day.aprem_lieu, day.soir_lieu].filter(x => x && x !== '—').filter((v, i, a) => a.indexOf(v) === i).join(' → '))}</span></div>
        <div class="prog-day-a">
          ${stops.length ? `<button class="prog-btn light" onclick="showDayOnMap('${day.id}')">🗺️</button>` : ''}
          ${stops.length && isEditorMode() ? `<button class="prog-btn" onclick="applyOptimised('${day.id}')">💾 Fixer les heures</button>` : ''}
        </div></div>
      ${dayTimeline(plan, null)}
      ${stops.length ? `<div class="prog-hint">${stops.length} étape(s) · ~${Math.round(km * 10) / 10} km de trajets</div>` : ''}
    </div>`;
  });
  return h;
}

function dayTimeline(plan, nowMin) {
  if (!plan.entries.length) return emptyBox('🌤', 'Journée libre — rien de prévu. Demande des idées à l\'IA 👇');
  return `<div class="prog-tl">${plan.entries.map((e, i) => {
    const past = nowMin != null && (e.end ?? e.min) < nowMin;
    const travel = e.kind === 'stop' && i > 0 && e.km != null ? `<div class="prog-leg">🚕 ~${e.travel} min · ${Math.round(e.km * 10) / 10} km</div>` : '';
    const ic = e.kind === 'transport' ? (e.item.prix_type || '🚄').split(' ')[0] : e.kind === 'hotel' ? '🏨' : (TYPE_IC[e.item.type] || '📍');
    const sub = e.sub || [e.item.quartier, e.item.duree && '⏱ ' + e.item.duree, parseFloat(e.item.prix) > 0 && fmtE(parseFloat(e.item.prix))].filter(Boolean).map(esc).join(' · ');
    return `${travel}<div class="prog-tl-row ${past ? 'past' : ''} k-${e.kind}">
      <div class="prog-tl-h">${e.kind === 'hotel' ? '🌙' : fmtMin(e.min)}${e.fixed ? '<i>📌</i>' : ''}</div>
      <div class="prog-tl-dot"></div>
      <div class="prog-tl-c"><div class="prog-tl-t">${ic} ${esc(e.label)}</div>${sub ? `<div class="prog-tl-s">${sub}</div>` : ''}${e.warn ? `<div class="prog-tl-w">${e.warn}</div>` : ''}${e.kind === 'stop' && !itemPos(e.item) ? '<div class="prog-tl-w">📍 adresse pas encore placée sur la carte</div>' : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

async function applyOptimised(dayId) {
  if (!requireEditorSoft()) return;
  const day = D.planning.find(d => d.id == dayId); if (!day) return;
  const stops = buildDayPlan(day).entries.filter(e => e.kind === 'stop' && !e.fixed);
  await Promise.all(stops.map(e => sb.from('planning_slots').update({ heure: fmtMin(e.min) }).eq('id', e.slot.id)));
  stops.forEach(e => { e.slot.heure = fmtMin(e.min); });
  showToast(`✅ ${stops.length} heure(s) fixée(s)`); renderProgramme();
}

function quickPlan(itemId) {
  if (!requireEditorSoft()) return;
  const it = D.items.find(x => x.id == itemId);
  const days = sortedDays().filter(d => !it?.ville || [d.matin_lieu, d.aprem_lieu, d.soir_lieu].some(l => String(l || '').includes(it.ville)));
  const pool = days.length ? days : sortedDays();
  const sh = document.createElement('div');
  sh.className = 'overlay on'; sh.id = 'qp-sheet';
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Caser « ${esc(it?.nom || '')} »</div>
    <div class="form-group"><div class="form-label">Jour</div><select class="form-input" id="qp-day">${pool.map(d => `<option value="${d.id}">${fmtDate(d.date_voyage)} — ${esc(d.aprem_lieu || d.matin_lieu || '')}</option>`).join('')}</select></div>
    <div class="row-2"><div class="form-group"><div class="form-label">Moment</div><select class="form-input" id="qp-per">${['Matin', 'Après-midi', 'Soir', 'Journée'].map(p => `<option ${p === (it?.prix_type || 'Après-midi') ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div class="form-group"><div class="form-label">Heure (optionnel)</div><input class="form-input" id="qp-h" type="time"></div></div>
    <button class="btn-primary" style="width:100%;" onclick="confirmQuickPlan('${itemId}')">📅 Ajouter au planning</button></div>`;
  document.body.appendChild(sh);
}
async function confirmQuickPlan(itemId) {
  const planning_id = document.getElementById('qp-day').value, periode = document.getElementById('qp-per').value, heure = document.getElementById('qp-h').value || null;
  const row = { planning_id, item_id: itemId, periode, ordre: 0 }; if (heure) row.heure = heure;
  const { error } = await sb.from('planning_slots').insert(row);
  if (error) { showToast('❌ ' + error.message); return; }
  await sb.from('items').update({ statut: 'planifie' }).eq('id', itemId);
  document.getElementById('qp-sheet')?.remove(); showToast('📅 Ajouté au planning');
}

/* ═══════════ 3. CERVEAU ═══════════ */
function cerveauCard(c) {
  return `<div class="prog-card cer">
    <div class="prog-card-ic">${c.source === 'tiktok' ? '🎵' : c.source === 'instagram' ? '📸' : '🧠'}</div>
    <div class="prog-card-main">
      <div class="prog-card-t">${esc(c.titre || c.lieu_nom || 'Reel')}</div>
      <div class="prog-card-s">${esc([c.ville, c.lieu_nom && c.lieu_nom !== c.titre ? c.lieu_nom : '', c.auteur].filter(Boolean).join(' · '))}</div>
      ${c.resume ? `<div class="prog-card-s">${esc(c.resume)}</div>` : ''}
      ${(c.tags || []).length ? `<div class="prog-tags">${c.tags.slice(0, 5).map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="prog-card-r" style="gap:6px;">
      ${c.url ? `<a class="prog-btn light" href="${esc(c.url)}" target="_blank" rel="noopener">▶︎</a>` : ''}
      ${c.item_id ? '<span class="prog-ok">✓ dans l\'app</span>' : `<button class="prog-btn" onclick="cerveauToItem('${c.id}')">＋ Idée</button>`}
    </div></div>`;
}

function renderCerveau() {
  ensureProgrammeTab();
  const body = document.getElementById('cerBody'); if (!body) return;
  if (D._cerveauMissing) { body.innerHTML = emptyBox('🛠️', 'La table « cerveau » n\'existe pas encore dans Supabase. Lance le script supabase/migrations/20261104000000_cerveau_assistant.sql (voir README).'); return; }
  const q = (document.getElementById('cerQ')?.value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = D.cerveau.filter(c => !q || norm([c.titre, c.lieu_nom, c.ville, c.resume, c.transcription, (c.tags || []).join(' ')].join(' ')).includes(q));
  const byVille = {};
  list.forEach(c => (byVille[c.ville || 'Sans ville'] = byVille[c.ville || 'Sans ville'] || []).push(c));
  body.innerHTML = `<div class="prog-kpis"><div><b>${D.cerveau.length}</b><span>reels</span></div><div><b>${D.cerveau.filter(c => c.item_id).length}</b><span>dans l'app</span></div><div><b>${D.cerveau.filter(c => c.lat && c.lng).length}</b><span>sur la carte</span></div></div>`
    + (list.length ? Object.entries(byVille).map(([v, cs]) => `<div class="prog-section-t">${VILLE_IC[v] || '📍'} ${esc(v)} (${cs.length})</div>${cs.map(cerveauCard).join('')}`).join('') : emptyBox('🧠', D.cerveau.length ? 'Rien ne correspond.' : 'Cerveau vide. Clique « Importer » pour coller l\'export de tes reels.'));
}

async function cerveauToItem(id) {
  if (!requireEditorSoft()) return;
  const c = D.cerveau.find(x => x.id == id); if (!c) return;
  const type = ['activite', 'restaurant', 'cafe'].includes(c.categorie) ? c.categorie : 'activite';
  const row = { type, nom: c.lieu_nom || c.titre || 'Reel', ville: c.ville || '', quartier: '', description: c.resume || '', adresse: c.adresse || '', adresse_cn: c.adresse_cn || '',
    prix: c.prix_estime || 0, prix_type: c.meilleur_moment || '', duree: c.duree || '', statut: 'idee', priorite: 'coeur', notes: c.url || '', fait: false, matis: 0, lise: 0,
    lat: c.lat || null, lng: c.lng || null, cerveau_id: c.id };
  if (!row.lat) { const g = await geocodeQuery(row); if (g) { row.lat = g.lat; row.lng = g.lng; } }
  const { data, error } = await sb.from('items').insert(row).select('id').single();
  if (error) { showToast('❌ ' + error.message); return; }
  await sb.from('cerveau').update({ item_id: data.id, lat: row.lat, lng: row.lng }).eq('id', id);
  c.item_id = data.id; showToast('💡 Ajouté aux idées' + (row.lat ? ' + carte' : ''));
  renderCerveau(); renderProgramme();
}

/* Import : accepte JSON (tableau d'objets) ou CSV avec en-têtes.
   Champs reconnus : url, source, auteur, titre, transcription, resume, categorie, ville, lieu_nom, adresse, adresse_cn, lat, lng, prix_estime, duree, meilleur_moment, tags */
function openCerveauImport() {
  if (!requireEditorSoft()) return;
  const sh = document.createElement('div');
  sh.className = 'overlay on'; sh.id = 'cer-import';
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Importer le cerveau</div>
    <div class="prog-hint">Colle un JSON (liste de reels) ou un CSV avec en-têtes. Champs : url, source, auteur, titre, transcription, resume, categorie, ville, lieu_nom, adresse, adresse_cn, prix_estime, duree, meilleur_moment, tags. Les doublons (même url) sont mis à jour.</div>
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

const CER_FIELDS = ['url', 'source', 'auteur', 'titre', 'transcription', 'resume', 'categorie', 'ville', 'lieu_nom', 'adresse', 'adresse_cn', 'lat', 'lng', 'prix_estime', 'duree', 'meilleur_moment', 'tags'];
function normaliseReel(o) {
  const alias = { link: 'url', lien: 'url', title: 'titre', transcript: 'transcription', summary: 'resume', city: 'ville', place: 'lieu_nom', lieu: 'lieu_nom', nom: 'lieu_nom', address: 'adresse', category: 'categorie', author: 'auteur' };
  const r = {};
  Object.entries(o || {}).forEach(([k, v]) => { const kk = alias[k.toLowerCase()] || k.toLowerCase(); if (CER_FIELDS.includes(kk) && v !== '' && v != null) r[kk] = v; });
  if (typeof r.tags === 'string') r.tags = r.tags.split(/[,#;|]/).map(s => s.trim()).filter(Boolean);
  ['lat', 'lng', 'prix_estime'].forEach(k => { if (r[k] != null) { r[k] = parseFloat(String(r[k]).replace(',', '.')); if (isNaN(r[k])) delete r[k]; } });
  if (!r.source && r.url) r.source = /tiktok/i.test(r.url) ? 'tiktok' : /instagram/i.test(r.url) ? 'instagram' : 'autre';
  if (r.ville) { const v = VILLES.find(x => x.toLowerCase() === String(r.ville).toLowerCase()); if (v) r.ville = v; }
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
  const withUrl = rows.filter(r => r.url), noUrl = rows.filter(r => !r.url);
  const res = [];
  if (withUrl.length) res.push(await sb.from('cerveau').upsert(withUrl, { onConflict: 'url' }));
  if (noUrl.length) res.push(await sb.from('cerveau').insert(noUrl));
  const err = res.find(r => r.error)?.error;
  if (err) { st.textContent = '❌ ' + err.message; return; }
  await loadCerveau(); st.textContent = `✅ ${rows.length} reel(s) importé(s)`;
  setTimeout(() => document.getElementById('cer-import')?.remove(), 1200);
}

async function loadCerveau() {
  try {
    const { data, error } = await sb.from('cerveau').select('*').order('created_at', { ascending: false });
    if (error) { D._cerveauMissing = /does not exist|schema cache|not find/i.test(error.message); return; }
    D._cerveauMissing = false; D.cerveau = data || [];
  } catch (e) { /* hors-ligne : on garde le cache */ }
  renderCerveau(); if (progView === 'activites') renderProgramme();
}

/* ═══════════ 4. CARTE : placer toutes les adresses automatiquement ═══════════ */
async function geocodeQuery(x) {
  const qs = [x.adresse_cn, x.adresse && `${x.adresse} ${x.ville || ''}`, x.nom && `${x.nom} ${x.ville || ''}`, x.quartier && `${x.quartier} ${x.ville || ''}`].filter(q => q && q.trim());
  for (const q of qs) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cn&q=${encodeURIComponent(q.trim())}`, { headers: { 'Accept-Language': 'fr,en,zh' } });
      const d = await r.json();
      await new Promise(res => setTimeout(res, 1100)); // 1 requête/s max (règle OSM)
      if (d && d.length) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), label: d[0].display_name };
    } catch (e) { /* requête suivante */ }
  }
  return null;
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
function renderCerveauMarkers() {
  if (!mapInst) return;
  cerveauLayer.forEach(m => m.remove()); cerveauLayer = [];
  if (mapFilter !== 'all' && mapFilter !== 'cerveau') return;
  D.cerveau.filter(c => c.lat && c.lng && !c.item_id).forEach(c => {
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: '<div class="cer-pin">🧠</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) })
      .bindPopup(`<div class="map-popup"><div class="mp-type">🧠 CERVEAU</div><div class="mp-name">${esc(c.titre || c.lieu_nom || 'Reel')}</div><div class="mp-meta">${esc(c.ville || '')}</div>${c.resume ? `<div class="mp-meta">${esc(c.resume)}</div>` : ''}<div class="mp-actions">${c.url ? `<a class="mp-btn" href="${esc(c.url)}" target="_blank">▶︎ Reel</a>` : ''}<button class="mp-btn nav" onclick="cerveauToItem('${c.id}')">＋ Idée</button></div></div>`)
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
    if (pts.length > 1) L.polyline(pts, { color: '#e85d5d', weight: 4, opacity: .8, dashArray: '6 8' }).addTo(routeLayer);
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

// On enrichit sendChat : "@ia …" part vers Claude, le reste ne change pas.
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

const _renderAllOrig = renderAll;
renderAll = function () {
  _renderAllOrig();
  if (document.getElementById('tab-programme')?.classList.contains('on')) renderProgramme();
  if (document.getElementById('tab-cerveau')?.classList.contains('on')) renderCerveau();
};
const _goTabOrig = goTab;
goTab = function (n, el) {
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
.prog-next{background:linear-gradient(135deg,#231815,#4a2c24);color:#fff;border-radius:var(--radius);padding:16px;margin-bottom:6px;box-shadow:var(--shadow)}
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
.bot-chip.ia{background:linear-gradient(135deg,#231815,#4a2c24);color:#fff;border-color:transparent}
.cer-pin{width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid #8b5cf6;display:flex;align-items:center;justify-content:center;font-size:.9rem;box-shadow:0 3px 10px rgba(0,0,0,.2)}
.route-num{width:24px;height:24px;border-radius:50%;background:#e85d5d;color:#fff;font:700 .75rem var(--font);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
</style>`);

/* ── Démarrage ── */
ensureProgrammeTab();
loadCerveau(); subCerveau();
