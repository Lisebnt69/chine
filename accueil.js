/* ═══════════════════════════════════════════════════════════════
   accueil.js — Page d'accueil (premier onglet de la barre du bas)

   De haut en bas :
     1. les 3 prochaines activités du planning (heure de Chine) ;
     2. les 2 prochaines étapes importantes (train, avion, check-in d'hôtel) ;
     3. un bouton qui ouvre la conversation avec Roomy (onglet Programme > Roomy) ;
     4. le convertisseur euros / yuans (même taux que celui du Budget) ;
     5. un bouton qui demande à Roomy 4 activités autour de la position ;
     6. où en sont les dépenses ;
     7. en bas, les numéros d'urgence : police 110, ambulance 120, hôpital du jour.

   Aucune donnée n'est recalculée ici : tout vient de ia.js (buildDayPlan), prog.js
   (vitalRows, askProg), index.html (budget, taux, SOS_VILLES). Chargé en DERNIER.
   Réservé à Matis et Lise : Roomy et les dépenses (le visiteur ne voit aucun prix).
   ═══════════════════════════════════════════════════════════════ */

const ND_GROUPES = [[10, 'Sur place'], [20, 'Idées'], [30, 'Organiser'], [40, 'Souvenirs']];
const ND_ORDRE = { restaurants: 11, nourriture: 12, hotels: 13, transport: 14, pratique: 15, phrases: 16,
  roomy: 21, activites: 22, cerveau: 23,
  budget: 31, areserver: 32, checklist: 33, notes: 34, stats: 35, questions: 36,
  souhaits: 41, galerie: 42 };

const acEl = id => document.getElementById(id);
const acEd = () => typeof isEditorMode === 'function' && isEditorMode();
const acJours = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const acTaux = () => String((typeof convRate === 'number' && convRate > 0 ? convRate : 7.78).toFixed(2)).replace('.', ',');

/* ───────────── Libellés de temps ───────────── */
// « Dans 40 min », « Dans 2 h 05 », « Aujourd'hui », « Demain », « ven. 13 nov. »
function acQuand(date, min, now) {
  if (date === now.date) {
    const d = min - now.min;
    if (d <= 0) return 'En ce moment';
    if (d < 60) return `Dans ${d} min`;
    if (d < 360) return `Dans ${Math.floor(d / 60)} h ${String(d % 60).padStart(2, '0')}`;
    return "Aujourd'hui";
  }
  return acJours(now.date, date) === 1 ? 'Demain' : fmtDate(date);
}

function acSousTitre() {
  const days = sortedDays(); if (!days.length) return '';
  const now = chinaNow(), first = days[0].date_voyage, last = days[days.length - 1].date_voyage;
  if (now.date < first) { const n = acJours(now.date, first); return n === 1 ? 'Départ demain' : `Départ dans ${n} jours`; }
  if (now.date > last) return 'Voyage terminé';
  const i = days.findIndex(d => d.date_voyage >= now.date);
  return `Jour ${i + 1} sur ${days.length} · heure de Chine ${fmtMin(now.min)}`;
}

/* ───────────── 1. Prochaines activités ───────────── */
function acProchainesActivites(n) {
  const now = chinaNow(), out = [];
  for (const day of sortedDays()) {
    if (day.date_voyage < now.date) continue;
    for (const e of buildDayPlan(day).entries) {
      if (e.kind !== 'stop' || !e.item || e.item.type === 'hotel') continue;
      if (typeof getItemStatut === 'function' && getItemStatut(e.item) === 'fait') continue;
      if (day.date_voyage === now.date && (e.end ?? e.min + 30) <= now.min) continue;
      out.push({ day, e });
      if (out.length >= n) return out;
    }
  }
  return out;
}

function acLigneActivite({ day, e }, now) {
  const it = e.item, pos = itemPos(it);
  const lieu = [it.quartier && it.quartier !== 'À définir' ? it.quartier : '', it.ville].filter(Boolean).join(' · ');
  const duree = e.end > e.min && e.end - e.min < 360 ? ' · ' + dureeTxt(e.end - e.min) : '';
  return `<div class="ac-row" data-act="open" data-id="${esc(it.id)}">
    <div class="ac-when"><b>${fmtMin(e.min)}</b><i>${esc(acQuand(day.date_voyage, e.min, now))}</i></div>
    <div class="ac-main"><div class="ac-t">${esc(TYPE_IC[it.type] || '')} ${esc(e.label)}</div>
      <div class="ac-s">${esc(lieu)}${esc(duree)}</div></div>
    ${pos ? `<button type="button" class="ac-go" data-act="nav" data-nav="${navData(e.label, pos, it.adresse_cn)}" aria-label="Y aller">${ic('compass')}</button>` : '<span></span>'}
  </div>`;
}

/* ───────────── 2. Prochaines étapes importantes ───────────── */
// Étapes « grosses » de la vue Vital : trajets (train, avion…) et check-in d'hôtel.
function acProchainesEtapes(n) {
  const now = chinaNow(), out = [], vus = new Set();
  for (const day of sortedDays()) {
    if (day.date_voyage < now.date) continue;
    for (const r of vitalRows(day).rows) {
      if (!r.big) continue;
      if (r.item.type === 'transport' && r.item.adresse !== day.date_voyage) continue; // arrivée du lendemain : même trajet, déjà compté au départ
      if (day.date_voyage === now.date && r.t <= now.min) continue;
      const cle = r.item.id + '@' + day.date_voyage;
      if (vus.has(cle)) continue; vus.add(cle);
      out.push({ day, r });
      if (out.length >= n) return out;
    }
  }
  return out;
}

function acLigneEtape({ day, r }, now) {
  const pos = r.pos || null;
  return `<div class="ac-row" data-act="open" data-id="${esc(r.item.id)}">
    <div class="ac-when"><b>${fmtMin(r.t)}</b><i>${esc(acQuand(day.date_voyage, r.t, now))}</i></div>
    <div class="ac-main"><div class="ac-t">${esc(r.ic)} ${esc(r.title)} <span class="pv-tag ${esc(r.tag[1])}">${esc(r.tag[0])}</span></div>
      <div class="ac-s">${esc(r.sub || '')}</div>${r.extra ? `<div class="ac-s">${esc(r.extra)}</div>` : ''}</div>
    ${pos ? `<button type="button" class="ac-go" data-act="nav" data-nav="${navData(r.title, pos, r.cn)}" aria-label="Y aller">${ic('compass')}</button>` : '<span></span>'}
  </div>`;
}

/* ───────────── 3 et 5. Roomy ───────────── */
function acRoomy() {
  if (!acEd()) { showToast('Roomy est réservée à Matis et Lise'); return; }
  askProg();
  setTimeout(() => acEl('pcInp')?.focus(), 200);
}
function acAutour() {
  if (!acEd()) { showToast('Roomy est réservée à Matis et Lise'); return; }
  askProg('Cherche exactement 4 activités à faire autour de moi, maintenant, à pied ou en trajet court. Ma liste d\'abord, puis le cerveau, puis internet. Pour chacune : le nom, la distance et le temps pour y aller, le temps à prévoir sur place, et en une phrase pourquoi.');
}

/* ───────────── 4. Convertisseur ───────────── */
function acConv(depuis) {
  const e = acEl('ac-eur'), c = acEl('ac-cny'); if (!e || !c) return;
  const lire = i => parseFloat(String(i.value).replace(',', '.')) || 0;
  const t = typeof convRate === 'number' && convRate > 0 ? convRate : 7.78;
  if (depuis === 'eur') { const v = lire(e); c.value = v ? Math.round(v * t * 100) / 100 : ''; }
  else { const v = lire(c); e.value = v ? Math.round(v / t * 100) / 100 : ''; }
}
function acMajTaux() {
  const l = acEl('ac-taux'); if (l) l.textContent = `1 € = ${acTaux()} ¥`;
  const c = acEl('ac-cny'), e = acEl('ac-eur');
  if (c && c.value) acConv('cny'); else if (e && e.value) acConv('eur');
}

/* ───────────── 6. Dépenses ───────────── */
function acBudgetHtml() {
  if (!acEd()) return '';
  const tot = budgetPP * 2;
  let m = 0, l = 0;
  D.budget.forEach(r => {
    const t = parseFloat(r.total || 0), qui = r.personne || 'les deux';
    if (qui === 'matis') m += t; else if (qui === 'lise') l += t; else { m += t / 2; l += t / 2; }
  });
  const dep = m + l, reste = tot - dep, pct = tot > 0 ? dep / tot * 100 : 0;
  const t = typeof convRate === 'number' && convRate > 0 ? convRate : 7.78;
  const jours = sortedDays(), now = chinaNow();
  let rythme = '';
  if (jours.length && now.date >= jours[0].date_voyage && now.date <= jours[jours.length - 1].date_voyage && reste > 0) {
    const n = acJours(now.date, jours[jours.length - 1].date_voyage) + 1;
    rythme = `<div class="ac-s">Soit environ ${fmtE(reste / n)} par jour pour les ${n} jours qui restent.</div>`;
  }
  const bar = (nom, v) => {
    const p = budgetPP > 0 ? Math.min(100, v / budgetPP * 100) : 0;
    return `<div class="ac-pers"><span>${nom}</span><div class="ac-bar"><i style="width:${p.toFixed(1)}%"></i></div><b>${fmtE(v)}</b></div>`;
  };
  return `<div class="ac-bud-top">
      <div><div class="ac-bud-k">Dépensé</div><div class="ac-bud-v">${fmtE(dep)}</div><div class="ac-s">sur ${fmtE(tot)} · ${Math.round(pct)} %</div></div>
      <div class="ac-bud-r"><div class="ac-bud-k">${reste >= 0 ? 'Il reste' : 'Dépassé de'}</div><div class="ac-bud-v ${reste >= 0 ? 'ok' : 'warn'}">${fmtE(Math.abs(reste))}</div>
        <div class="ac-s">≈ ${Math.round(Math.abs(reste) * t).toLocaleString('fr-FR')} ¥</div></div>
    </div>
    <div class="ac-bar big ${pct > 100 ? 'over' : ''}"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></div>
    ${rythme}
    <div class="ac-bud-pers">${bar('Matis', m)}${bar('Lise', l)}</div>
    <div class="ac-bud-act"><button type="button" class="ac-mini" data-act="depense">${ic('plus')}<span>Ajouter une dépense</span></button>
      <span class="ac-bud-go">Détail ${ic('arrow-right')}</span></div>`;
}

/* ───────────── 7. Urgences ───────────── */
// Ville de référence : la position GPS si elle est dans une ville connue (< 60 km), sinon la ville du planning.
function acVilleSOS() {
  const L = typeof SOS_VILLES !== 'undefined' ? SOS_VILLES : []; if (!L.length) return null;
  if (typeof myPos !== 'undefined' && myPos && typeof VILLE_COORDS !== 'undefined') {
    let best = null, bd = 60;
    L.forEach(v => { const c = VILLE_COORDS[v.ville]; if (!c) return; const d = getDistKm(myPos.lat, myPos.lng, c[0], c[1]); if (d < bd) { bd = d; best = v; } });
    if (best) return { v: best, via: 'gps' };
  }
  const now = chinaNow(), day = sortedDays().find(d => d.date_voyage >= now.date); if (!day) return null;
  const m = day.matin_lieu, a = day.aprem_lieu, s = day.soir_lieu;
  const ordre = day.date_voyage !== now.date || now.min < 750 ? [m, a, s] : now.min < 1080 ? [a, s, m] : [s, a, m];
  for (const txt of ordre) {
    const t = String(txt || '').toLowerCase(); if (!t || t === '—') continue;
    const v = L.find(x => { const n = x.ville.toLowerCase(); return t.includes(n) || t.includes(n.split(' ').pop()) || t.includes(x.zh); });
    if (v) return { v, via: 'planning' };
  }
  return null;
}
function acAmap(kw, v) {
  if (v && typeof sosAmapUrl === 'function') return sosAmapUrl(v, kw);
  let url = 'https://uri.amap.com/search?keyword=' + encodeURIComponent(kw) + '&src=chine2026';
  if (typeof myPos !== 'undefined' && myPos && typeof wgs84ToGcj02 === 'function') { const [la, ln] = wgs84ToGcj02(myPos.lat, myPos.lng); url += '&center=' + ln.toFixed(6) + ',' + la.toFixed(6); }
  return url;
}
const acTel = n => 'tel:' + (n.length > 6 ? '+86' + n.replace(/^0/, '').replace(/-/g, '') : n);

function acSosHtml() {
  const r = acVilleSOS(), v = r?.v || null;
  const hops = v ? v.lieux.filter(l => l.t === 'hop').slice(0, 2) : [];
  const lignes = hops.map(l => `<div class="ac-hop">
      <div class="ac-hop-ic">${ic('cross')}</div>
      <div class="ac-main"><div class="ac-t">${esc(l.nom)}</div><div class="ac-s" lang="zh">${esc(l.zh)}${l.adr ? ' · ' + esc(l.adr) : ''}</div></div>
      <div class="ac-hop-act">${l.tel ? `<a class="ac-mini" href="${esc(acTel(l.tel))}" aria-label="Appeler ${esc(l.nom)}">${ic('phone-call')}<span>Appeler</span></a>` : ''}
        <a class="ac-mini" target="_blank" rel="noopener" href="${esc(acAmap(v.zh + ' ' + l.zh, v))}">${ic('search')}<span>Amap</span></a></div>
    </div>`).join('');
  const via = r ? (r.via === 'gps' ? 'Près de ta position' : 'Ville du planning') + ' : ' + esc(r.v.ville) + ' <span lang="zh">' + esc(r.v.zh) + '</span>' : 'Ville inconnue pour l\'instant';
  return `<div class="ac-sos-call">
      <a class="ac-call pol" href="tel:110">${ic('siren')}<b>110</b><span>Police</span></a>
      <a class="ac-call med" href="tel:120">${ic('cross')}<b>120</b><span>Ambulance, urgence médicale</span></a>
    </div>
    <div class="ac-card ac-sos-card">
      <div class="ac-sos-ville">${via}</div>
      ${lignes}
      <div class="ac-sos-chips">
        <a class="ac-mini" target="_blank" rel="noopener" href="${esc(acAmap('医院', v))}">${ic('cross')}<span>Hôpitaux autour de moi</span></a>
        <a class="ac-mini" target="_blank" rel="noopener" href="${esc(acAmap('派出所', v))}">${ic('siren')}<span>Police autour de moi</span></a>
      </div>
      <div class="ac-say">
        <div class="ac-say-row"><span lang="zh">请叫救护车</span><em>Appelez une ambulance</em><button type="button" class="ac-go sm" data-act="say" data-zh="请叫救护车" aria-label="Faire lire à voix haute">${ic('speaker')}</button></div>
        <div class="ac-say-row"><span lang="zh">请报警</span><em>Appelez la police</em><button type="button" class="ac-go sm" data-act="say" data-zh="请报警" aria-label="Faire lire à voix haute">${ic('speaker')}</button></div>
      </div>
    </div>`;
}

/* ───────────── Rendu ───────────── */
// Le convertisseur n'est jamais redessiné (il perdrait ce qui est tapé) : on ne touche qu'aux blocs de données.
function acRender() {
  if (!acEl('tab-accueil')) return;
  const now = chinaNow(), vide = t => `<div class="ac-vide">${t}</div>`;
  acEl('acSub').textContent = acSousTitre();

  const acts = acProchainesActivites(3);
  acEl('acAct').innerHTML = acts.length ? acts.map(a => acLigneActivite(a, now)).join('') : vide('Rien de prévu pour l\'instant dans le planning.');

  const etapes = acProchainesEtapes(2);
  acEl('acEtapes').innerHTML = etapes.length ? etapes.map(a => acLigneEtape(a, now)).join('') : vide('Plus de train, de vol ni de check-in à venir.');

  const mt = acEl('acMeteo'); if (mt) mt.innerHTML = typeof mtAccueil === 'function' ? mtAccueil() : '';
  acEl('acBudget').innerHTML = acBudgetHtml();
  acEl('acSos').innerHTML = acSosHtml();
  acMajTaux();
  acTuto();
}
/* Première ouverture : Roomy dit en trois phrases où est quoi. Une seule fois par téléphone. */
function acTuto() {
  const box = acEl('acTuto'); if (!box || box.firstChild) return;
  let vu = false; try { vu = localStorage.getItem('accueil_tuto') === '1'; } catch (e) { /* stockage indisponible */ }
  if (vu) return;
  box.innerHTML = `<section class="sh-tuto" aria-live="polite">
    <div class="sh-tuto-tag"><span class="sh-step">Bienvenue</span></div>
    <div class="mimi-row">
      ${typeof shPoseImg === 'function' ? shPoseImg('explique') : ''}
      <div class="mimi-bubble"><b>Accueil</b> : ce qui arrive maintenant.<br><b>Programme</b> : chaque jour en détail.<br><b>Plus</b> : le reste (restos, hôtels, transports…).</div>
    </div>
    <div class="sh-tuto-bar" style="margin-top:8px"><button class="sh-next" type="button" data-act="tutoOk">J’ai compris</button></div></section>`;
}

function acSafeRender() { try { acRender(); } catch (e) { console.warn('Accueil :', e); } }

function acClic(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset;
  switch (d.act) {
    case 'open': { const it = D.items.find(x => x.id == d.id); if (it) openItemSheet(it.type, it); break; }
    case 'nav': navigateToItem(JSON.parse(d.nav)); break;
    case 'meteo': if (typeof mtOuvrir === 'function') mtOuvrir(); break;
    case 'tutoOk': try { localStorage.setItem('accueil_tuto', '1'); } catch (err) { /* tant pis */ } acEl('acTuto').innerHTML = ''; break;
    case 'roomy': acRoomy(); break;
    case 'autour': acAutour(); break;
    case 'budget': goTab('budget', acEl('nb-more')); break;
    case 'depense': e.stopPropagation(); openBudgetSheet(); break;
    case 'cny': { const c = acEl('ac-cny'); if (c) { c.value = d.v; acConv('cny'); } break; }
    case 'say': if (typeof speakChinese === 'function') speakChinese(d.zh); break;
  }
}

/* ───────────── Onglet + navigation ───────────── */
function acEnsureTab() {
  if (acEl('tab-accueil')) return;
  const main = acEl('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-accueil';
  tab.innerHTML = `
    <div class="ph"><h1>Accueil</h1><p id="acSub"></p></div>
    <div id="acTuto"></div>

    <section class="ac-sec ac-meteo-sec" id="acMeteo"></section>
    <section class="ac-sec"><div class="sl">Prochaines activités<span class="sl-s">heure de Chine</span></div><div class="ac-card" id="acAct"></div></section>
    <section class="ac-sec"><div class="sl">Prochaines étapes importantes<span class="sl-s">trains, vols, hôtels</span></div><div class="ac-card" id="acEtapes"></div></section>

    <section class="ac-sec ac-ed">
      <button type="button" class="ac-roomy" data-act="roomy">
        <img src="mascotte/tete.webp" alt="" draggable="false">
        <span class="ac-main"><b>Parler à Roomy</b><em>Programme, idées, changement de plan : elle répond tout de suite.</em></span>
        ${ic('arrow-right')}
      </button>
    </section>

    <section class="ac-sec"><div class="sl">Convertisseur</div>
      <div class="ac-card ac-conv">
        <div class="ac-conv-grid">
          <label>Euros €<input class="conv-input" id="ac-eur" type="number" inputmode="decimal" step="any" placeholder="0" oninput="acConv('eur')"></label>
          <div class="ac-conv-sw">${ic('swap')}</div>
          <label>Yuans ¥<input class="conv-input" id="ac-cny" type="number" inputmode="decimal" step="any" placeholder="0" oninput="acConv('cny')"></label>
        </div>
        <div class="ac-conv-chips">${[10, 50, 100, 500].map(n => `<button type="button" class="ac-chip" data-act="cny" data-v="${n}">${n} ¥</button>`).join('')}<span class="ac-taux" id="ac-taux"></span></div>
      </div>
    </section>

    <section class="ac-sec ac-ed">
      <button type="button" class="ac-autour" data-act="autour">
        <span class="ac-autour-ic">${ic('compass')}</span>
        <span class="ac-main"><b>4 activités autour de moi</b><em>Roomy cherche avec ta position : ta liste, puis le cerveau, puis internet.</em></span>
        ${ic('arrow-right')}
      </button>
    </section>

    <section class="ac-sec ac-ed"><div class="sl">Dépenses</div><div class="ac-card ac-budget" id="acBudget" data-act="budget" role="button" tabindex="0"></div></section>

    <section class="ac-sec ac-sosec"><div class="sl">Urgences<span class="sl-s">touche pour appeler</span></div><div id="acSos"></div></section>
    <div style="height:18px"></div>`;
  main.appendChild(tab);
  tab.addEventListener('click', acClic);
  tab.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'acBudget') goTab('budget', acEl('nb-more')); });

  // Barre du bas : « Accueil » prend la place de « Budget », qui passe dans le menu Plus.
  const nb = acEl('nb-budget');
  if (nb) {
    nb.id = 'nb-accueil';
    nb.setAttribute('onclick', "goTab('accueil',this);closeNavDrawer()");
    nb.querySelector('.nic').innerHTML = ic('home');
    nb.querySelector('.nlb').textContent = 'Accueil';
  }
  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !acEl('nd-budget')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-budget'; b.type = 'button';
    b.onclick = () => { goTab('budget', acEl('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic">${ic('coins')}</span><span class="nav-drawer-lbl">Budget</span>`;
    grid.insertBefore(b, grid.firstChild);
  }

  // Menu Plus : quatre groupes avec un titre. L'ordre vient du CSS (id -> order), donc il tient aussi
  // pour les boutons que d'autres scripts ajoutent plus tard. Un titre sans bouton visible est masqué.
  if (grid && !grid.querySelector('.nd-grp')) {
    ND_GROUPES.forEach(([ordre, titre]) => {
      const h = document.createElement('div');
      h.className = 'nd-grp'; h.dataset.g = ordre; h.style.order = ordre; h.textContent = titre;
      grid.appendChild(h);
    });
    const _toggle = toggleNavDrawer;
    toggleNavDrawer = function (force) {
      _toggle.apply(this, arguments);
      if (!document.getElementById('navDrawer')?.classList.contains('open')) return;
      grid.querySelectorAll('.nd-grp').forEach(h => {
        const g = Number(h.dataset.g);
        h.style.display = [...grid.querySelectorAll('.nav-drawer-btn')]
          .some(b => { const o = ND_ORDRE[b.id.replace('nd-', '')]; return o > g && o < g + 10 && getComputedStyle(b).display !== 'none'; })
          ? '' : 'none';
      });
    };
  }

  // L'accueil est l'onglet d'ouverture.
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(t => t.classList.remove('on'));
  tab.classList.add('on'); acEl('nb-accueil')?.classList.add('on');
}

/* ───────────── Branchements ───────────── */
{
  const _goTab = goTab;
  goTab = function (n, el) {
    _goTab(n, el);
    if (n === 'budget') acEl('nd-budget')?.classList.add('active');
    if (n === 'accueil') acSafeRender();
  };
  const _goTabByName = goTabByName;
  goTabByName = function (name) {
    if (name === 'accueil') return goTab('accueil', acEl('nb-accueil'));
    if (name === 'budget') return goTab('budget', acEl('nb-more'));
    return _goTabByName(name);
  };
  const _map = getDrawerMainNavMap;
  getDrawerMainNavMap = function () { return { ..._map(), accueil: 'nb-accueil', budget: 'nb-more' }; };
  const _renderAll = renderAll;
  renderAll = function () { _renderAll.apply(this, arguments); acSafeRender(); };
  // Le taux change (mise à jour automatique ou saisie dans le Budget) : le convertisseur de l'accueil suit.
  const _appliquer = appliquerTaux; appliquerTaux = function (t) { _appliquer(t); acMajTaux(); };
  const _update = updateRate; updateRate = function (v) { _update(v); acMajTaux(); };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && acEl('tab-accueil')?.classList.contains('on')) acSafeRender(); });
setInterval(() => { if (!document.hidden && acEl('tab-accueil')?.classList.contains('on')) acSafeRender(); }, 60000);


/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
.nav .nb .nlb{font-size:.66rem}
@media (max-width:420px){.nav{padding:4px;gap:2px}.nav .nb{padding:8px 1px}.nav .nb .nlb{font-size:.64rem}}
@media (max-width:350px){.nav .nb .nlb{font-size:.58rem}}
.nav-drawer-panel{max-height:calc(100dvh - var(--nav) - var(--safe) - 96px);overflow-y:auto;overscroll-behavior:contain}
.nav-drawer-lbl{font-size:.7rem}
.nav-drawer-panel{padding-top:12px}.nav-drawer-grid{gap:6px}.nav-drawer-btn{padding:8px 4px;gap:3px}
.nav-drawer-title{margin-bottom:8px}
.nd-grp{grid-column:1/-1;margin:6px 2px 0;padding-bottom:4px;border-bottom:1px solid rgba(184,137,58,.35);font-size:.66rem;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent-ink)}
.nd-grp:first-child{margin-top:0}
#navDrawer #nd-restaurants{order:11}
#navDrawer #nd-nourriture{order:12}
#navDrawer #nd-hotels{order:13}
#navDrawer #nd-transport{order:14}
#navDrawer #nd-pratique{order:15}
#navDrawer #nd-phrases{order:16}
#navDrawer #nd-roomy{order:21}
#navDrawer #nd-activites{order:22}
#navDrawer #nd-cerveau{order:23}
#navDrawer #nd-budget{order:31}
#navDrawer #nd-areserver{order:32}
#navDrawer #nd-checklist{order:33}
#navDrawer #nd-notes{order:34}
#navDrawer #nd-stats{order:35}
#navDrawer #nd-questions{order:36}
#navDrawer #nd-souhaits{order:41}
#navDrawer #nd-galerie{order:42}
#tab-accueil .ph h1::after{content:'家'}#tab-accueil .ph::before{content:'福'}
.reader-mode .ac-ed,.reader-mode #nd-budget{display:none!important}
.ac-sec{margin:0 0 16px}
.ac-sec .sl-s{margin-left:8px;text-transform:none;letter-spacing:0;font-weight:500;opacity:.7}
.ac-card{margin:0 16px;background:#fffdf8;border:1px solid rgba(184,137,58,.45);border-radius:18px;box-shadow:var(--shadow-sm);overflow:hidden}
.ac-vide{padding:16px;font-size:.8rem;color:var(--txt2)}
.ac-row{display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;padding:12px;border-top:1px solid var(--border);cursor:pointer;min-height:60px;-webkit-tap-highlight-color:transparent}
.ac-row:first-child{border-top:none}
.ac-row:active{background:var(--tint-2)}
.ac-when{text-align:right}
.ac-when b{display:block;font:700 1.02rem var(--font-title);color:var(--accent);letter-spacing:-.02em}
.ac-when i{display:block;font-style:normal;font-size:.62rem;color:var(--txt2);line-height:1.25;margin-top:1px}
.ac-main{min-width:0;flex:1}
.ac-t{font-weight:700;font-size:.88rem;overflow-wrap:anywhere}
.ac-s{font-size:.72rem;color:var(--txt2);margin-top:2px;overflow-wrap:anywhere}
.ac-go{width:44px;height:44px;flex:none;border-radius:50%;border:1px solid rgba(184,137,58,.55);background:var(--bg);color:var(--accent);display:inline-grid;place-items:center;cursor:pointer;padding:0}
.ac-go .gi{width:20px;height:20px}
.ac-go.sm{width:38px;height:38px}.ac-go.sm .gi{width:17px;height:17px}
.ac-go:active{background:var(--tint)}

.ac-roomy,.ac-autour{display:flex;align-items:center;gap:14px;width:calc(100% - 32px);margin:0 16px;padding:14px 16px;border:none;border-radius:22px;color:#fff;text-align:left;cursor:pointer;font-family:var(--font);-webkit-tap-highlight-color:transparent}
.ac-roomy{background:linear-gradient(140deg,#2a0a10 0%,#6b1523 55%,#8b1d2c 118%);box-shadow:0 18px 40px rgba(94,15,28,.28),inset 0 0 0 1px rgba(240,217,162,.4)}
.ac-roomy img{width:58px;height:58px;flex:none;border-radius:50%;object-fit:cover;background:#fbf6ec;border:2px solid var(--or-clair,#f0d9a2)}
.ac-autour{background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 14px 30px rgba(139,29,44,.26),inset 0 0 0 1px rgba(240,217,162,.4)}
.ac-autour-ic{width:48px;height:48px;flex:none;border-radius:50%;display:grid;place-items:center;background:rgba(251,246,236,.16);box-shadow:inset 0 0 0 1px rgba(240,217,162,.5)}
.ac-autour-ic .gi{width:26px;height:26px;color:var(--or-clair,#f0d9a2)}
.ac-roomy b,.ac-autour b{display:block;font:700 1.02rem var(--font-title);letter-spacing:-.02em}
.ac-roomy em,.ac-autour em{display:block;font-style:normal;font-size:.74rem;line-height:1.4;color:var(--or-clair,#f0d9a2);opacity:.92;margin-top:3px}
.ac-roomy>.gi,.ac-autour>.gi{width:22px;height:22px;opacity:.9}
.ac-roomy:active,.ac-autour:active{transform:scale(.985)}

.ac-conv{padding:16px}
.ac-conv-grid{display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;align-items:end}
.ac-conv-grid label{display:block;font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2)}
.ac-conv-grid .conv-input{margin-top:5px}
.ac-conv-sw{display:grid;place-items:center;padding-bottom:12px;color:var(--txt2)}
.ac-conv-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px}
.ac-chip{min-height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(184,137,58,.5);background:var(--bg);color:var(--txt);font:600 .76rem var(--font);cursor:pointer}
.ac-chip:active{background:var(--tint)}
.ac-taux{margin-left:auto;font-size:.72rem;color:var(--txt2)}

.ac-budget{padding:16px;cursor:pointer}
.ac-bud-top{display:flex;justify-content:space-between;gap:12px}
.ac-bud-r{text-align:right}
.ac-bud-k{font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2)}
.ac-bud-v{font:700 1.5rem var(--font-title);letter-spacing:-.03em;margin-top:2px}
.ac-bud-v.ok{color:var(--green)}.ac-bud-v.warn{color:var(--accent)}
.ac-bar{height:8px;border-radius:99px;background:rgba(184,137,58,.2);overflow:hidden}
.ac-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--or,#b8893a),var(--accent))}
.ac-bar.big{margin:12px 0 4px;height:10px}
.ac-bar.over i{background:var(--accent)}
.ac-bud-pers{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.ac-pers{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;font-size:.76rem}
.ac-pers span{color:var(--txt2);font-weight:600}.ac-pers b{font-weight:700;min-width:64px;text-align:right}
.ac-bud-act{display:flex;align-items:center;justify-content:space-between;margin-top:14px}
.ac-bud-go{display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:600;color:var(--accent)}
.ac-bud-go .gi{width:16px;height:16px}

.ac-mini{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 13px;border-radius:999px;border:1px solid rgba(184,137,58,.55);background:var(--bg);color:var(--txt);font:600 .74rem var(--font);text-decoration:none;cursor:pointer;white-space:nowrap}
.ac-mini .gi{width:16px;height:16px;color:var(--accent)}
.ac-mini:active{background:var(--tint)}

.ac-sos-call{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 10px}
.ac-call{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:104px;padding:12px 8px;border-radius:20px;color:#fff;text-decoration:none;text-align:center;box-shadow:inset 0 0 0 1px rgba(240,217,162,.4);-webkit-tap-highlight-color:transparent}
.ac-call .gi{width:24px;height:24px;color:var(--or-clair,#f0d9a2)}
.ac-call b{font:800 2.1rem var(--font-title);letter-spacing:-.03em;line-height:1.1}
.ac-call span{font-size:.72rem;line-height:1.3;opacity:.92}
.ac-call.pol{background:linear-gradient(145deg,#1f1411,#4a2c24)}
.ac-call.med{background:linear-gradient(145deg,#8e1620,#b3202a)}
.ac-call:active{transform:scale(.98)}
.ac-sos-card{padding:14px}
.ac-sos-ville{font-size:.72rem;font-weight:600;color:var(--txt2);margin-bottom:8px}
.ac-hop{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border)}
.ac-hop-ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--tint);color:var(--accent)}
.ac-hop-act{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}
.ac-sos-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;padding-top:12px;border-top:1px solid var(--border)}
.ac-say{margin-top:12px;padding-top:6px;border-top:1px solid var(--border)}
.ac-say-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:6px 0}
.ac-say-row span{font:700 1.15rem 'STKaiti','KaiTi','Noto Serif SC','Songti SC','Microsoft YaHei',serif;color:var(--accent-ink)}
.ac-say-row em{font-style:normal;font-size:.72rem;color:var(--txt2)}
</style>`);

/* ───────────── Démarrage ───────────── */
acEnsureTab();
acSafeRender();
