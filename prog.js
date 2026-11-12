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
  // Centre le jour choisi dans la barre SANS toucher au scroll vertical de la page
  const on = box.querySelector('.pd.on:not(.pd-opt)'), bar = box.querySelector('.pd-bar');
  if (on && bar) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
}

/* Une phrase sous le sélecteur : ce que montre la vue active. */
const PROG_AIDE = {
  vital: 'Trains, vols, hôtels et activités réservées : ce qu’il ne faut pas rater.',
  leger: 'Les grandes heures du jour, et des idées proches dans les temps libres.',
  detail: 'La journée minute par minute, trajets compris.',
  claude: 'Demande à Roomy de changer le programme. Rien d’autre n’est modifié.'
};

/* ───────────── Rendu principal ───────────── */
function renderProgrammeVues() {
  // Le contenu est recréé : on fige la hauteur et on restaure le scroll, sinon la page remonte en haut à chaque rafraîchissement.
  const y = window.scrollY, body0 = document.getElementById('progBody');
  if (body0) body0.style.minHeight = body0.offsetHeight + 'px';
  try { renderProgrammeVuesCore(); }
  finally {
    if (body0) body0.style.minHeight = '';
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: 'instant' });
  }
}
function renderProgrammeVuesCore() {
  ensureProgrammeTab();
  const body = document.getElementById('progBody'); if (!body) return;
  if (!['vital', 'leger', 'detail', 'claude'].includes(progView)) progView = 'leger'; // anciennes valeurs mémorisées
  if (progView === 'claude' && !isEditorMode()) progView = 'leger'; // Roomy : Matis et Lise seulement
  document.querySelectorAll('#tab-programme .prog-switch button').forEach(b => b.classList.toggle('on', b.dataset.v === progView));
  const hint = document.getElementById('progHint');
  if (hint) hint.textContent = PROG_AIDE[progView] || '';
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
    case 'vue': progView = d.v; try { localStorage.setItem('prog_view', progView); } catch (err) { /* ignoré */ } renderProgramme(); break;
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
function legInfo(km, o) { return { min: travelMin(km), mode: travelMode(km), km, o }; }
const nbFr = n => String(n).replace('.', ',');
const MODES = { marche: ['walk', 'À pied'], metro: ['metro', 'Métro'], didi: ['car', 'DiDi'], taxi: ['car', 'Taxi'], navette: ['bus', 'Navette'], bus: ['bus', 'Bus'],
  train: ['train', 'Train'], avion: ['plane', 'Avion'], telepherique: ['cable', 'Téléphérique'], ascenseur: ['cable', 'Ascenseur'], bateau: ['ship', 'Bateau'] };
const ETAPE_IC = { repas: 'utensils', boutique: 'bag', activite: 'star', logistique: 'clipboard' };
const pourVisiteur = t => isEditorMode() ? t : sansPrix(t);
function modeDe(l) {
  if (l.km == null) return 'didi';
  if (l.km <= MARCHE_KM) return 'marche';
  const m = optionsTrajet(l.km, l.o).options[0].mode;
  return m === 'Métro' ? 'metro' : m === 'DiDi' ? 'didi' : 'navette';
}
// Le trajet saisi dans l'étape n'est valable que si on vient bien de l'étape prévue : sinon on le recalcule,
// pour que les trajets suivent les activités ajoutées, déplacées ou retirées.
function etapeLeg(et, loc) {
  const y = et?.y_aller;
  if (!y || !MODES[y.mode] || !y.depuis || y.depuis !== loc.id) return null;
  const sub = [y.detail, isEditorMode() && y.prix_yuan ? prixTrajet(y.prix_yuan) : ''].filter(Boolean).join(' · ');
  return { min: y.duree_min || 0, mode: y.mode, titre: `${MODES[y.mode][1]} · ${dureeTxt(y.duree_min || 0)}`, sub: pourVisiteur(sub) };
}
const TROP_LOIN_KM = 120;  // Tianmen est à ~34 km de Banpoli ; au-delà de 120 km, c'est une étape mal placée, pas un DiDi
function prixTrajet(yuan) {
  const y = yuan >= 20 ? Math.round(yuan / 5) * 5 : Math.round(yuan), e = y * TAUX_EUR.yuan;
  return `~${y} ¥ (${e < 1 ? nbFr(e.toFixed(1)) : Math.round(e)} €)`;
}
// Une ligne par trajet : métro ou DiDi, durée, et prix pour Matis et Lise (le visiteur ne voit aucun prix).
function legTxt(l) {
  const dist = l.km != null ? ' · ' + nbFr(Math.round(l.km * 10) / 10) + ' km' : '';
  if (l.km == null || l.km <= MARCHE_KM) return `${l.min} min ${l.mode}${dist}`;
  if (l.km > TROP_LOIN_KM) return `${Math.round(l.km)} km : pas un trajet en DiDi, ces deux étapes ne sont pas dans la même ville. Vérifie ce jour`;
  const { options, ferme } = optionsTrajet(l.km, l.o);
  const prix = x => isEditorMode() ? (x.yuan ? prixTrajet(x.yuan) : 'gratuite') : '';
  const txt = options.map(x => [`${x.mode} ${dureeTxt(x.min)}`, [prix(x), x.note].filter(Boolean).join(', ')].filter(Boolean).join(' · ')).join(', ou ');
  return `${txt}${dist}${ferme ? ' · métro fermé' : ''}`;
}
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
/* ── Longue escale à Helsinki (aller, dimanche 8 novembre : 10h45 → 16h40) ──
   Paris → Helsinki est dans l'espace Schengen, donc aucun contrôle à l'arrivée : on peut sortir. Le contrôle de passeport
   n'a lieu qu'au retour, avant le vol pour Shanghai. Tout est calculé à partir des heures des deux vols (heures d'Helsinki).
   Les durées de train (27 min en I, 32 min en P) et le billet ABC viennent de hsl.fi. Le plan ne s'applique qu'aux escales de plus
   de 5 h 30 : celle du retour (3 h 10) garde le simple bloc d'attente. */
const ESCALE_LONGUE_MIN = 330;
function escalePlan(nom, de, a) {
  if (!/helsinki/i.test(nom || '') || de == null || a == null || a - de < ESCALE_LONGUE_MIN) return null;
  const ville = de + 75, retour = a - 210, rows = [];
  const ajoute = r => rows.push({ ...r, sub: pourVisiteur(r.sub || '') });
  ajoute({ t: de, k: 'step', title: "Décider à l'atterrissage : ville ou aéroport", sub: `On va en ville seulement si l'avion a atterri avant ${hmJour(de + 30)}, s'il n'y a ni neige ni verglas dehors, et si vous tenez debout après la nuit courte. Sinon, on reste à l'aéroport : mieux vaut manquer la cathédrale que le vol.` });
  ajoute({ t: de + 1, k: 'step', title: "Descente de l'avion et sortie", sub: "Compter 20 à 30 min entre l'atterrissage et la gare : descente de l'avion, marche dans le terminal. Suivre les panneaux « Arrivals / Saapuvat » jusqu'à la sortie, puis « Train / Juna ». Les valises en soute sont prises en charge jusqu'à Shanghai : rien à récupérer, vous sortez avec vos sacs à main. Pas de contrôle de passeport (Paris → Helsinki reste dans l'espace Schengen)." });
  ajoute({ t: de + 35, k: 'go', mode: 'train', title: 'Train I ou P vers la gare centrale', sub: "La gare est sous l'aéroport, dans le couloir entre les deux terminaux (panneaux « Train / Juna », environ 5 min de marche depuis la sortie des arrivées). Billet ABC à 4,80 € par personne : appli HSL, distributeur ou carte sans contact. 27 min en I, 32 min en P, plus l'attente du train. Sans le train : Finnair City Bus (environ 30 min, 6 à 7 €) ou taxi (35 à 50 €)." });
  ajoute({ t: ville, k: 'key', icone: 'city', title: 'Helsinki, gare centrale', sub: `Vous avez ${dureeTxt(retour - ville)} en ville. Dehors : 0 à 5 °C environ, la nuit tombe vers 15h45. Manteau, gants et bonnet.` });
  ajoute({ t: ville, k: 'go', mode: 'marche', title: 'À pied vers le Karl Fazer Café', sub: "Kaivokatu vers le sud-est, puis à gauche dans Aleksanterinkatu, puis Kluuvikatu : le café est au numéro 3. Environ 8 min, sur le chemin de la place du Sénat." });
  ajoute({ t: ville + 8, k: 'key', icone: 'utensils', title: 'Karl Fazer Café : repas à emporter', sub: "Kluuvikatu 3, ouvert le dimanche (vers 10h-18h). Prendre à emporter : sandwich ou plat froid facile à manger debout, café ou chocolat chaud dans un gobelet, korvapuusti (brioche à la cannelle). Environ 10 min, file comprise. Le service à emporter est à confirmer sur place ; sinon, repli sur l'aéroport. Pas de soupe garantie le dimanche." });
  ajoute({ t: ville + 18, k: 'go', mode: 'marche', title: 'À pied vers la place du Sénat, repas en main', sub: "Aleksanterinkatu vers l'est, environ 7 min. Le grand magasin Stockmann est derrière vous, la place du Sénat devant." });
  ajoute({ t: ville + 26, k: 'key', icone: 'star', title: "Manger en visitant : cathédrale et place du Sénat", sub: "Mangez dehors, sur les marches ou sur la place, avant d'entrer : on ne mange pas dans la cathédrale. Il fait 0 à 5 °C, mangez vite pour que ça reste chaud, et gardez les gants. Photos de la place, puis la cathédrale, la grande église blanche au sommet des marches : intérieur fermé pendant les offices, ouverture en principe vers midi le dimanche (12h à 17h en été, hiver à vérifier sur helsingintuomiokirkko.fi). Environ 30 min en tout." });
  ajoute({ t: ville + 56, k: 'go', mode: 'marche', title: 'Retour à pied vers la gare centrale', sub: "Aleksanterinkatu en sens inverse, puis Kaivokatu jusqu'à la gare : 12 à 15 min. Ne pas s'arrêter en route : la gare est à 13h10." });
  ajoute({ t: retour, k: 'step', title: 'Être à la gare centrale', sub: `Dernier moment pour partir : train vers ${hmJour(retour + 10)}. Entre ce moment et le vol, ${dureeTxt(a - retour)} : train, marche, passeport, sécurité, porte d'embarquement. Avec des files de 30 min au passeport et à la sécurité, il reste encore 35 min avant l'embarquement.` });
  ajoute({ t: retour + 10, k: 'go', mode: 'train', title: "Train pour l'aéroport", sub: 'Nouveau billet ABC, 27 à 32 min.' });
  ajoute({ t: a - 160, k: 'step', title: "Arrivée à l'aéroport", sub: "Marche de la gare jusqu'aux départs hors Schengen : 5 à 10 min. Carte d'embarquement du vol pour Shanghai en main (appli ou papier)." });
  ajoute({ t: a - 155, k: 'step', title: 'Contrôle de passeport', sub: "Obligatoire pour quitter la zone Schengen. Suivre « Non-Schengen / Flights outside Schengen » (l'ordre passeport et sécurité suit le fléchage sur place). File d'attente : 15 à 30 min selon l'affluence. Finnair compte 40 à 45 min au minimum entre les deux côtés, et on part de l'extérieur." });
  ajoute({ t: a - 125, k: 'step', title: 'Sécurité', sub: "Portique : 15 à 30 min. Liquides en sachet, ordinateur et batteries externes sortis du sac, ceinture et manteau à enlever." });
  ajoute({ t: a - 95, k: 'step', title: "Marche jusqu'à la porte, repas et attente", sub: "Le numéro de porte est sur la carte d'embarquement et sur les écrans (les sources donnent des portes non-Schengen vers 38 à 55, à vérifier) ; elles peuvent être à 10 à 15 min de marche. Déjeuner à l'aéroport, une fois la porte repérée. Carte d'arrivée en Chine à remplir en ligne si ce n'est pas fait (gratuit). Wi-Fi gratuit de l'aéroport : télécharger les cartes hors ligne, charger les téléphones." });
  ajoute({ t: a - 45, k: 'step', title: 'Embarquement', sub: "La porte ferme 15 min avant le vol. Être à la porte quand l'embarquement commence." });
  return rows;
}
function escaleBlock(e) {
  const plan = escalePlan(e.nom, e.de, e.a);
  if (plan) {
    const retour = plan.find(r => r.title === 'Être à la gare centrale').t;
    const cles = plan.filter(r => r.k === 'key' && (r.icone === 'star' || r.icone === 'utensils'));
    return `<div class="pl-esc"><div class="pl-esc-t">Escale à Helsinki de ${hmJour(e.de)} à ${hmJour(e.a)}</div>
      <div class="pl-esc-s">${dureeTxt(e.a - e.de)} devant vous, dont environ ${dureeTxt(plan.find(r => r.title === 'Être à la gare centrale').t - plan.find(r => r.icone === 'city').t)} en ville. Vous n'êtes pas en Chine : rien de Chine n'est proposé. Le détail est dans la vue Détaillé.</div>
      <div class="pl-esc-s"><b>Règle :</b> en ville seulement si l'avion atterrit avant ${hmJour(e.de + 30)}, sans neige ni verglas, et si vous tenez debout. Sinon on reste à l'aéroport.</div>
      <div class="pl-esc-s"><b>Marge du vol :</b> à la gare centrale à ${hmJour(retour)}, train de ${hmJour(retour + 10)}, à l'aéroport vers ${hmJour(e.a - 160)}. Même avec 10 min d'attente de train, 30 min de passeport, 30 min de sécurité et 15 min de marche, vous êtes à la porte à ${hmJour(e.a - 80)}, ${dureeTxt(35)} avant l'embarquement. Dernier délai absolu à la gare : ${hmJour(retour + 30)}. Au-delà, le vol est en danger.</div>
      <ul class="pd-li">${cles.map(r => `<li><b>${hmJour(r.t)}</b> ${esc(r.title)}</li>`).join('')}<li><b>${hmJour(plan.find(r => r.title === 'Être à la gare centrale').t)}</b> à la gare, au plus tard</li></ul></div>`;
  }
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
    let dep = String(t.notes || '').match(/DEP_ADDR:([^|]+)/)?.[1]?.trim();
    if (dep && dep.length < 3) dep = ''; // une saisie d'une lettre n'est pas une adresse
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
      ${rows.length ? rows.map(vitalRow).join('') : `<div class="pv-empty">Rien d’important ce jour-là : ni train, ni vol, ni heure fixée. <button type="button" class="prog-btn" data-act="vue" data-v="leger">Voir les idées</button></div>`}
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
  const C = (D.cerveau || []).filter(c => !c.item_id && !cerEstLien(c) && !used.has('c' + c.cle) && cats.includes(c.categorie) && momentOk(c.meilleur_moment)
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
  const leg = legInfo(s.km, { de: s.pos, vers: s.pos, t: gap.s }), start = round5(gap.s + (s.km != null ? leg.min : 0));
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
// Vol intérieur chinois (D: et A: en Chine dans les notes) : 1 h 30 avant ; vol international : 2 h.
const volIntChine = it => /D:[^|]*(🇨🇳|\bCN\b)[^|]*\|\s*A:[^|]*(🇨🇳|\bCN\b)/.test(String(it.notes || ''));
const AVANCE_GARE = it => /✈|vol|avion|flight/i.test(`${it.prix_type || ''} ${it.nom || ''}`) ? (volIntChine(it) ? 90 : 120) : /🚄|🚅|🚆|train|TGV|G\d{2,4}|D\d{2,4}/i.test(`${it.prix_type || ''} ${it.nom || ''}`) ? 60 : 30;

function detailRows(day) {
  const plan = buildDayPlan(day), hotel = plan.hotel, rows = [];
  const depart = departHotel(day) || hotel;
  let loc = { pos: posOf(depart), nom: depart ? depart.nom : 'votre point de départ', id: depart?.id }, free = null; // free = heure à laquelle on est dispo
  const entries = plan.entries.filter(e => e.kind !== 'hotel').sort((a, b) => a.min - b.min);
  const push = r => rows.push(r);
  let avecPlanEscale = false;  // le plan d'escale gère déjà le retour à l'aéroport
  if (depart?.type === 'hotel' && entries[0] && entries[0].min >= 10 * 60) free = DAY_START;
  const reveil = toMin(day.route?.reveil);
  if (reveil != null) push({ t: reveil, k: 'step', title: 'Réveil', sub: day.route.pourquoi_horaire || '' });
  // Moment libre : jamais vide, on y met ce qu'il y a de mieux autour de nous.
  const used = new Set();
  const idees = (s, en) => {
    if (en - s < GAP_MIN) return '';
    const g = { s, en }, ville = depart?.ville || '';
    const liste = [...suggestions(loc.pos, ville, g, ['restaurant'], 2, used), ...suggestions(loc.pos, ville, g, ['activite', 'cafe'], 3, used)];
    return liste.map(x => suggCard(x, g, day.id)).join('');
  };
  entries.forEach((e, i) => {
    if (e.kind === 'transport') {
      const it = e.item, arrJ1 = it.adresse !== day.date_voyage;
      const L = transportLegs().find(l => l.t.id === it.id);
      const avion = /✈|vol|avion|flight/i.test(`${it.prix_type || ''} ${it.nom || ''}`);
      const lieuArr = `${avion ? 'l\'aéroport' : 'la gare'}${L?.arrNom ? ' de ' + L.arrNom : ''}`;
      if (arrJ1) {
        push({ t: e.min, k: 'step', title: `Arrivée : ${e.label}`, sub: e.sub });
        loc = { pos: transportPos(it, 'ARR') || loc.pos, nom: lieuArr, id: it.id }; free = e.min;
        const hp = posOf(hotel);
        if (hp && e.min < 6 * 60) {
          const versHotel = legInfo(loc.pos ? kmBetween(loc.pos, hp) : null, { de: loc.pos, vers: hp, t: e.min, bagages: true });
          push({ t: e.min + 1, k: 'go', mode: modeDe(versHotel), title: `Rejoindre ${hotel.nom}`, sub: legTxt(versHotel) });
          loc = { pos: hp, nom: hotel.nom, id: hotel.id }; free = Math.max(e.min + versHotel.min, DAY_START);  // on dort, la journée repart à 9h
        }
        return;
      }
      const avance = AVANCE_GARE(it), depPos = transportPos(it, 'DEP');
      const leg = legInfo(depPos && loc.pos ? kmBetween(loc.pos, depPos) : null, { de: loc.pos, vers: depPos, t: e.min - avance, bagages: true });
      const quitter = e.min - avance - leg.min;
      // La feuille de route nous met déjà à la gare : ni trajet ni « être à la gare » en double.
      const dejaLa = loc.fin != null && e.min - loc.fin <= 10;
      if (dejaLa) { /* rien à ajouter */ }
      else if (L && !L.depCN) {
        // On part d'une escale (pas de trajet en ville à calculer) : on montre l'attente, ou le plan quand l'escale est longue.
        const planEscale = free != null ? escalePlan(loc.nom, free, e.min) : null;
        if (planEscale) { planEscale.forEach(push); avecPlanEscale = true; }
        else if (free != null && e.min - avance - free >= 60) push({ t: free, k: 'free', title: `Escale à ${loc.nom.replace(/^l'aéroport de /, '')}`, sub: `${dureeTxt(e.min - free)} avant le vol de ${fmtMin(e.min)} · hors de Chine` });
      } else if (leg.km == null || leg.km >= 0.1) push({ t: quitter, k: 'go', mode: modeDe(leg), title: `Quitter ${loc.nom}`, sub: `${legTxt(leg)} jusqu'à la gare ou l'aéroport` });
      if (!dejaLa && !avecPlanEscale) push({ t: e.min - avance, k: 'step', title: avance >= 120 ? "Être à l'aéroport" : avance >= 60 ? 'Être à la gare' : "Être au point d'embarquement", sub: `${avance} min avant le départ · ${avance >= 120 ? 'enregistrement et sécurité' : avance >= 60 ? 'contrôle des billets et sécurité' : 'embarquement'}` });
      push({ t: e.min, k: 'key', icone: avion ? 'plane' : 'train', ic: transportIcon(it), title: e.label, sub: e.sub, cn: it.adresse_cn, pos: depPos });
      const memeJour = e.end != null && e.end > e.min;
      if (memeJour) push({ t: e.end, k: 'step', title: `Arrivée${L?.arrNom ? ' à ' + L.arrNom : ''}`, sub: '' });
      else if (e.end != null) push({ t: e.min + 1, hl: 'J+1', k: 'step', title: `Arrivée demain à ${fmtMin(e.end)}${L?.arrNom ? ' · ' + L.arrNom : ''}`, sub: 'Nuit en vol' });
      loc = { pos: transportPos(it, 'ARR') || null, nom: lieuArr, id: it.id }; free = memeJour ? e.end : null;
      return;
    }
    // activité / repas
    const it = e.item, pos = itemPos(it);
    const et = e.slot?.etape, prevu = etapeLeg(et, loc);
    const leg = legInfo(pos && loc.pos ? kmBetween(loc.pos, pos) : null, { de: loc.pos, vers: pos, t: e.min });
    const quitter = e.min - (prevu ? prevu.min : leg.min);
    if (free != null && quitter - free >= 10) push({ t: free, k: 'free', title: quitter - free >= 90 ? `Temps libre de ${dureeTxt(quitter - free)}` : loc.fin == null ? 'Sortie et bagages' : `Marge de ${dureeTxt(quitter - free)}`, sub: quitter - free >= 90 ? 'À faire près de vous :' : loc.fin == null ? '' : 'Pause ou imprévus', html: idees(free, quitter) });
    if (prevu) { if (prevu.min) push({ t: quitter, k: 'go', mode: prevu.mode, title: prevu.titre, sub: prevu.sub }); }
    else if (leg.km == null || leg.km >= 0.05) push({ t: quitter, k: 'go', mode: modeDe(leg), title: `Quitter ${loc.nom}`, sub: legTxt(leg) + (pos ? '' : ' (position de l\'étape inconnue : temps estimé)') });
    const dur = (e.end ?? e.min + 60) - e.min;
    push({ t: e.min, k: 'key', icone: et ? ETAPE_IC[et.type] : null, ic: TYPE_IC[it.type] || '📍', title: e.label, sub: dur ? `Sur place ${dureeTxt(dur)} · jusqu'à ${fmtMin(e.min + dur)}${e.fixed && !et ? ' · heure fixée' : ''}` : '',
      prix: et?.prix_yuan && isEditorMode() ? `<span class="pl-prix"><em>${prixTrajet(et.prix_yuan)}</em></span>` : prixBadge(prixDeLieu(it), it.type), cn: it.adresse_cn, pos, warn: e.warn, id: it.type === 'etape' ? null : it.id, et,
      adr: et ? [it.nom !== e.label ? it.nom : '', it.quartier].filter(Boolean).join(' · ') : [it.quartier, it.adresse].filter(Boolean).join(' · ') });
    loc = { pos: pos || loc.pos, nom: e.label, id: it.id, fin: e.min + dur }; free = e.min + dur;
  });
  const finiALHotel = hotel && entries[entries.length - 1]?.item?.id === hotel.id;  // la feuille de route a déjà son retour
  if (finiALHotel) push({ t: free ?? 22 * 60, k: 'step', title: `Nuit : ${hotel.nom}`, sub: hotel.ville || '' });
  else if (hotel && entries.length && entries[entries.length - 1].kind !== 'transport') {
    const hp = posOf(hotel), leg = legInfo(hp && loc.pos ? kmBetween(loc.pos, hp) : null, { de: loc.pos, vers: hp, t: Math.max(free ?? 21 * 60, 21 * 60) });
    const finProg = free ?? 21 * 60, retour = Math.max(finProg, 21 * 60);
    if (retour - finProg >= 60) push({ t: finProg, k: 'free', title: 'Soirée libre', sub: 'À faire près de vous :', html: idees(finProg, retour) });
    push({ t: retour, k: 'go', mode: modeDe(leg), title: retour > finProg ? `Retour à l'hôtel (heure indicative)` : `Retour à l'hôtel`, sub: legTxt(leg) });
    push({ t: retour + leg.min, k: 'step', title: `Nuit : ${hotel.nom}`, sub: hotel.ville || '' });
  }
  return rows.sort((a, b) => a.t - b.t);
}

// Ce qu'on fait à l'étape, le 2e restaurant, le conseil et la source. Tout vient de la base : on échappe tout.
const lienOk = u => /^https?:\/\//i.test(String(u || ''));
function etapeHtml(et) {
  if (!et) return '';
  const b = et.plan_b, src = (et.sources || []).find(lienOk);
  const pos = b && b.lat && b.lng ? [parseFloat(b.lat), parseFloat(b.lng)] : null;
  return `${et.a_faire?.length ? `<ul class="pd-li">${et.a_faire.map(x => `<li>${esc(pourVisiteur(x))}</li>`).join('')}</ul>` : ''}
    ${b?.nom ? `<div class="pd-b"><b>Plan B :</b> ${esc(b.nom)}${b.nom_cn ? ' · ' + esc(b.nom_cn) : ''}${b.pourquoi ? `<div class="pd-s">${esc(pourVisiteur(b.pourquoi))}</div>` : ''}
      ${(pos || b.adresse_cn) ? `<div class="pv-a">${navBtns(b.nom, pos, b.adresse_cn, 'sm')}</div>` : ''}</div>` : ''}
    ${et.conseil ? `<div class="pd-n">${esc(pourVisiteur(et.conseil))}</div>` : ''}
    ${src ? `<a class="pl-src" href="${esc(src)}" target="_blank" rel="noopener">source</a>` : ''}`;
}
function viewDetail() {
  const days = progDaysSelected();
  let h = `<div class="prog-hint">Minute par minute : à pied sous ~600 m, sinon métro ou DiDi, le conseillé en premier. ${isEditorMode() ? 'Durées et prix estimés : DiDi donne le prix exact. ' : ''}Sortie de l'hôtel à 9h, sauf obligation.</div>`;
  days.forEach(day => {
    const rows = detailRows(day);
    h += `<div class="prog-day">${dayHead(day)}${day.route?.resume ? `<div class="pd-resume">${esc(pourVisiteur(day.route.resume))}</div>` : ''}`;
    h += rows.length ? `<div class="pd-tl">${rows.map(r => {
      if (r.k === 'key') return `<div class="pd-r key"><div class="pd-h">${fmtMin(r.t)}</div><div class="pd-dot"></div><div class="pd-c">
          <div class="pd-t" ${r.id ? `data-act="open" data-id="${esc(r.id)}"` : ''}>${r.icone ? ic(r.icone) : esc(r.ic)} ${esc(r.title)}${r.prix ? ' ' + r.prix : ''}</div>${r.sub ? `<div class="pd-s">${esc(r.sub)}</div>` : ''}
          ${r.adr ? `<div class="pd-s">${esc(r.adr)}</div>` : ''}${r.warn ? `<div class="prog-tl-w">${esc(r.warn)}</div>` : ''}
          ${etapeHtml(r.et)}${(r.pos || r.cn) ? `<div class="pv-a">${navBtns(r.title, r.pos, r.cn, 'sm')}</div>` : ''}</div></div>`;
      return `<div class="pd-r ${r.k}"><div class="pd-h">${r.hl || fmtMin(r.t)}</div><div class="pd-dot"></div><div class="pd-c"><div class="pd-t">${r.mode ? ic(MODES[r.mode]?.[0]) + ' ' : ''}${esc(r.title)}</div>${r.sub ? `<div class="pd-s">${esc(r.sub)}</div>` : ''}${r.html || ''}</div></div>`;
    }).join('')}</div>`
      : `<div class="pv-empty">Journée libre : rien de prévu. <button type="button" class="prog-btn" data-act="vue" data-v="leger">Voir les idées</button>${isEditorMode() ? ' <button type="button" class="prog-btn" data-act="vue" data-v="claude">Demander à Roomy</button>' : ''}</div>
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
    // La fonction répond en flux (200 tout de suite, JSON à la fin) : une erreur arrive dans `j.error`, et une
    // connexion coupée en route donne un corps vide ou tronqué, pas une réponse à prendre pour « C'est fait. ».
    const j = await r.json().catch(() => null);
    if (r.status === 401) { localStorage.removeItem('ia_secret'); progChat.push({ role: 'assistant', text: 'Code assistant invalide. Renvoie ton message pour le ressaisir.' }); }
    else if (!j) progChat.push({ role: 'assistant', text: 'Roomy n\'a pas fini de répondre : la connexion a été coupée. Vérifie le planning, puis réessaie plus court.' });
    else if (!r.ok || j.error) {
      progChat.push({ role: 'assistant', text: 'Roomy est indisponible : ' + (j.error || r.status) });
      if (j.changes?.length) { try { await loadAll(); renderAll(); } catch (e) { /* le temps réel rattrapera */ } }
    }
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
.pd-resume{font-size:.78rem;color:var(--txt2);margin:-2px 0 10px}
.pd-t .gi{width:16px;height:16px;vertical-align:-3px;color:var(--accent)}
.pd-li{margin:5px 0 4px;padding-left:16px;font-size:.78rem;line-height:1.4}
.pd-b{margin:6px 0;padding:6px 9px;border-left:2px solid var(--or,#b8912f);background:rgba(184,145,47,.08);border-radius:0 8px 8px 0;font-size:.78rem}
.pd-n{margin:5px 0;font-size:.74rem;font-style:italic;color:var(--txt2)}
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

