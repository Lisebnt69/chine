/* ═══════════════════════════════════════════════════════════════
   resa.js — Onglet « À réserver » (menu Plus)

   Tout ce qu'il reste à réserver, vérifier ou acheter sur place, avec :
     - où le faire, le lien (ou le téléphone), une note, le jour et l'heure ;
     - une case à cocher : cochée, la ligne passe dans « Faits » et la fiche liée
       (activité, hôtel, resto) reçoit une ligne « ✔ Réservé le … par … » dans ses notes ;
     - des pastilles « À réserver » / « À vérifier » / « Sur place » sur les fiches d'activités,
       dans les 3 vues du Programme et sur les jours de l'onglet Planning.

   Table : public.a_reserver (supabase/migrations/20261105050000_a_reserver.sql), FERMÉE à la clé publique :
   lue et écrite par la fonction `assistant` (mode « a_reserver »), avec le code de l'assistant.
   Réservé à Matis et Lise : le visiteur ne lit jamais la table et ne voit aucune pastille.
   Chargé APRÈS prog.js et souhaits.js (il enveloppe des fonctions de index.html et de prog.js).
   ═══════════════════════════════════════════════════════════════ */

const RS = { rows: [], charge: false, erreur: '', filtre: 'afaire', enCours: false, edition: null };

const rsQui = () => currentUser === 'lise' ? 'Lise' : currentUser === 'matis' ? 'Matis' : '';
const rsLienOk = u => /^(https?:\/\/|tel:\+?[0-9]+$)/i.test(String(u || '').trim());
const rsMarque = /\n?✔ (?:Réservé|Billet acheté|Billet confirmé)[^\n]*/g;
const rsCourt = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '') : '';
const rsMoisJour = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '') : '';

/* ───────────── Pastilles ───────────── */
const RS_LIB = { resa: 'À réserver', surplace: 'Sur place', verifier: 'À vérifier' };
const RS_LIB_OK = { resa: 'Réservé', surplace: 'Acheté', verifier: 'Vérifié' };
const rsPill = (mode, ok) => `<span class="rs-pill ${ok ? 'ok' : mode}">${ok ? ic('check') : ''}${ok ? RS_LIB_OK[mode] || 'Réservé' : RS_LIB[mode] || 'À réserver'}</span>`;
const rsActif = () => isEditorMode() && RS.charge && !RS.erreur;

// État d'une fiche : null (aucune ligne), { ok:false, mode } s'il reste quelque chose, { ok:true, mode } si tout est fait.
function rsEtatFiche(itemId) {
  if (!rsActif() || !itemId) return null;
  const rows = RS.rows.filter(r => r.item_id === itemId);
  if (!rows.length) return null;
  const ouvert = rows.filter(r => !r.fait);
  return ouvert.length ? { ok: false, mode: ouvert[0].mode } : { ok: true, mode: rows[0].mode };
}
const rsOuvertsDuJour = date => RS.rows.filter(r => !r.fait && (r.jour === date || r.avant === date));

/* ───────────── Données ───────────── */
// La table est FERMÉE à la clé publique (elle contient des numéros de commande) : tout passe par la fonction
// `assistant` (mode « a_reserver »), avec le code de l'assistant. `silencieux` : jamais de fenêtre de saisie du code
// (chargement de fond). Retourne { data } ou { error: { code, message } }, code ∈ code | reseau | table | ''.
async function rsAppel(action, extra, silencieux) {
  const code = silencieux ? (() => { try { return localStorage.getItem('ia_secret') || ''; } catch (e) { return ''; } })() : iaSecret();
  if (!code) return { error: { code: 'code', message: 'code' } };
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': code },
      body: JSON.stringify({ mode: 'a_reserver', action, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem('ia_secret'); } catch (e) { /* tant pis */ } return { error: { code: 'code', message: 'code' } }; }
    if (!r.ok) return { error: { code: j.code || '', message: j.error || 'erreur ' + r.status } };
    return { data: j };
  } catch (e) { return { error: { code: 'reseau', message: 'réseau' } }; }
}
async function rsCharger(silencieux = true) {
  if (!isEditorMode() || RS.enCours) return;
  RS.enCours = true;
  const { data, error } = await rsAppel('lister', {}, silencieux);
  if (error) RS.erreur = error.code === 'code' || error.code === 'reseau' || error.code === 'table' ? error.code : (error.message || 'erreur');
  else { RS.rows = data.rows || []; RS.erreur = ''; }
  RS.charge = true; RS.enCours = false;
  rsRafraichir();
}
// Pas de temps réel (il exigerait le droit de lecture de la clé publique) : on relit toutes les 20 s quand l'écran est visible.
function rsAbonner() {
  if (rsAbonner.fait) return;
  rsAbonner.fait = true;
  setInterval(() => { if (!document.hidden && isEditorMode() && RS.charge && !RS.erreur) rsCharger(true); }, 20000);
}

let rsRenderAllOrigine = null; // renderAll d'origine : sert à repeindre fiches et programme sans reboucler
function rsRafraichir() {
  renderResa();
  rsBadge();
  try { rsRenderAllOrigine && rsRenderAllOrigine(); } catch (e) { /* l'écran se repeindra au prochain événement */ }
}
function rsBadge() {
  const n = rsActif() ? RS.rows.filter(r => !r.fait).length : 0;
  const b = document.getElementById('rsCount');
  if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
}

/* ───────────── Onglet ───────────── */
function ensureResaTab() {
  if (document.getElementById('tab-areserver')) return;
  const main = document.getElementById('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-areserver';
  tab.innerHTML = `
    <div class="ph"><h1>À réserver</h1><p id="rsSub">Ce qu'il reste à réserver</p></div>
    <div id="rsBilan"></div>
    <button class="sh-add" data-act="ajouter" type="button">${ic('plus')}<span>Ajouter une ligne</span></button>
    <div id="rsFiltres"></div>
    <div id="rsListe"></div>`;
  main.appendChild(tab);
  tab.addEventListener('click', rsClic);

  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !document.getElementById('nd-areserver')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-areserver'; b.type = 'button'; b.setAttribute('data-editor-only', '');
    b.style.position = 'relative';
    b.onclick = () => { goTab('areserver', document.getElementById('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic">${ic('ticket')}</span><span class="nav-drawer-lbl">À réserver</span><span class="rs-count" id="rsCount" style="display:none">0</span>`;
    grid.appendChild(b);
    if (typeof isEditorMode === 'function' && !isEditorMode()) b.style.display = 'none';
  }

  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'rs-overlay';
  ov.onclick = e => { if (e.target === ov) closeOverlay('rs-overlay'); };
  ov.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title" id="rsTitreFeuille">Nouvelle ligne</div>
      <div class="form-group"><label class="form-label" for="rsF-titre">Quoi ?</label>
        <input class="form-input" id="rsF-titre" maxlength="160" autocomplete="off" placeholder="Billet du spectacle, navette, table…"></div>
      <div class="form-group"><label class="form-label" for="rsF-mode">Type</label>
        <select class="form-input" id="rsF-mode">
          <option value="resa">À réserver à l'avance</option>
          <option value="surplace">À acheter sur place</option>
          <option value="verifier">À vérifier</option>
        </select></div>
      <div class="rs-2col">
        <div class="form-group"><label class="form-label" for="rsF-jour">Le jour</label><input class="form-input" type="date" id="rsF-jour"></div>
        <div class="form-group"><label class="form-label" for="rsF-heure">Heure</label><input class="form-input" id="rsF-heure" maxlength="12" placeholder="20h"></div>
      </div>
      <div class="form-group"><label class="form-label" for="rsF-avant">À faire avant le</label><input class="form-input" type="date" id="rsF-avant"></div>
      <div class="form-group"><label class="form-label" for="rsF-ou">Où réserver</label>
        <input class="form-input" id="rsF-ou" maxlength="200" autocomplete="off" placeholder="Trip.com, téléphone, sur place…"></div>
      <div class="form-group"><label class="form-label" for="rsF-lien">Lien ou téléphone</label>
        <input class="form-input" id="rsF-lien" maxlength="300" autocomplete="off" inputmode="url" placeholder="https://… ou tel:+86…"></div>
      <div class="form-group"><label class="form-label" for="rsF-item">Fiche liée</label>
        <select class="form-input" id="rsF-item"></select></div>
      <div class="form-group"><label class="form-label" for="rsF-note">Note</label>
        <textarea class="form-input" id="rsF-note" rows="3" maxlength="600"></textarea></div>
      <button class="btn-primary" type="button" data-act="enregistrer">Enregistrer</button>
      <button class="btn-cancel" type="button" data-act="fermer">Annuler</button>
      <button class="rs-suppr" id="rsSuppr" type="button" data-act="supprimer" hidden>${ic('trash')}<span>Supprimer cette ligne</span></button>
      <div style="height:4px;"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', rsClic);
}

function rsClic(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case 'ajouter': rsOuvrirFeuille(); break;
    case 'modifier': rsOuvrirFeuille(id); break;
    case 'fermer': closeOverlay('rs-overlay'); break;
    case 'enregistrer': rsEnregistrer(); break;
    case 'supprimer': rsSupprimer(); break;
    case 'cocher': rsCocher(id); break;
    case 'filtre': RS.filtre = el.dataset.v; renderResa(); break;
    case 'fiche': { const it = D.items.find(x => x.id === id); if (it) openItemSheet(it.type, it); break; }
    case 'recharger': RS.enCours = false; rsCharger(false); break;
  }
}

function rsOuvrir(id) { // depuis une pastille du programme
  goTab('areserver', document.getElementById('nb-more'));
  setTimeout(() => {
    const c = document.querySelector(`.rs-card[data-id="${CSS.escape(id)}"]`);
    if (c) { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); }
  }, 80);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-rs-open]'); if (b) rsOuvrir(b.dataset.rsOpen); });

/* ───────────── Rendu ───────────── */
const RS_SECTIONS = [
  ['resa', 'À réserver', r => !r.fait && r.mode === 'resa' && (r.jour || r.avant)],
  ['verifier', 'À vérifier', r => !r.fait && r.mode === 'verifier'],
  ['surplace', 'À acheter sur place', r => !r.fait && r.mode === 'surplace'],
  ['libre', 'Pas encore au programme', r => !r.fait && r.mode === 'resa' && !r.jour && !r.avant],
];
const rsDate = r => r.avant || r.jour || '9999-12-31';
const rsTri = (a, b) => rsDate(a).localeCompare(rsDate(b)) || (a.ordre || 0) - (b.ordre || 0);

function rsCarte(r) {
  const it = r.item_id ? D.items.find(x => x.id === r.item_id) : null;
  const quand = [r.jour ? fmtDate(r.jour) : '', r.heure || ''].filter(Boolean).join(' · ');
  const avant = r.avant && !r.fait ? `<div class="rs-avant">${ic('clock')}<span>À faire avant le ${esc(rsCourt(r.avant))}</span></div>` : '';
  const lien = rsLienOk(r.lien)
    ? (/^tel:/i.test(r.lien)
      ? `<a class="rs-btn" href="${esc(r.lien)}">${ic('phone-call')}<span>Appeler</span></a>`
      : `<a class="rs-btn" href="${esc(r.lien)}" target="_blank" rel="noopener noreferrer">${ic('globe')}<span>Ouvrir le lien</span></a>`) : '';
  const meta = r.fait ? `<span class="rs-meta">${r.fait_par ? 'Fait par ' + esc(r.fait_par) : 'Fait'}${r.fait_le ? ' le ' + esc(rsMoisJour(r.fait_le)) : ''}</span>` : '';
  return `<article class="rs-card ${r.fait ? 'ok' : r.mode}" data-id="${esc(r.id)}">
    <button type="button" class="rs-box" data-act="cocher" data-id="${esc(r.id)}" role="checkbox" aria-checked="${r.fait ? 'true' : 'false'}" aria-label="${r.fait ? 'Décocher' : 'Cocher'} : ${esc(r.titre)}">${ic('check')}</button>
    <div class="rs-body">
      <div class="rs-top">${rsPill(r.mode, r.fait)}${quand ? `<span class="rs-when">${esc(quand)}</span>` : ''}</div>
      <div class="rs-titre">${esc(r.titre)}</div>
      ${avant}
      ${r.ou ? `<div class="rs-ou"><b>Où :</b> ${esc(r.ou)}</div>` : ''}
      ${r.note ? `<div class="rs-note">${esc(r.note)}</div>` : ''}
      <div class="rs-foot">
        ${lien}
        ${it ? `<button type="button" class="rs-btn alt" data-act="fiche" data-id="${esc(it.id)}">${ic('target')}<span>Voir la fiche</span></button>` : ''}
        <button type="button" class="rs-btn alt ico" data-act="modifier" data-id="${esc(r.id)}" aria-label="Modifier cette ligne">${ic('pencil')}</button>
        ${meta}
      </div>
    </div></article>`;
}

function renderResa() {
  const tab = document.getElementById('tab-areserver'); if (!tab) return;
  const liste = document.getElementById('rsListe'), fil = document.getElementById('rsFiltres'), bilan = document.getElementById('rsBilan');
  const sub = document.getElementById('rsSub'), add = tab.querySelector('.sh-add');
  if (!isEditorMode()) {
    if (add) add.style.display = 'none';
    bilan.innerHTML = ''; fil.innerHTML = ''; if (sub) sub.textContent = 'Réservé à Matis et Lise';
    liste.innerHTML = `<div class="sh-vide"><p>Cette liste est réservée à Matis et Lise.</p></div>`;
    return;
  }
  if (add) add.style.display = '';
  if (RS.erreur) {
    bilan.innerHTML = ''; fil.innerHTML = '';
    const msg = RS.erreur === 'table' ? "La liste n'est pas encore branchée. Lancer <b>supabase/migrations/20261105050000_a_reserver.sql</b> dans Supabase."
      : RS.erreur === 'code' ? "Il faut le code de l'assistant (le même que pour Roomy) pour lire cette liste."
      : RS.erreur === 'reseau' ? "Je n'arrive pas à joindre la liste. Vérifie ta connexion." : 'Je n\'arrive pas à lire la liste pour le moment.';
    liste.innerHTML = `<div class="sh-vide"><p>${msg}</p><button class="sh-lien" type="button" data-act="recharger">Réessayer</button></div>`;
    return;
  }
  if (!RS.charge) { bilan.innerHTML = ''; fil.innerHTML = ''; liste.innerHTML = '<div class="sh-vide"><p>Je cherche la liste…</p></div>'; return; }

  const rows = RS.rows, faits = rows.filter(r => r.fait).length, reste = rows.length - faits;
  if (sub) sub.textContent = reste ? `${reste} à faire · ${faits} fait${faits > 1 ? 's' : ''}` : 'Tout est fait';
  const pct = rows.length ? Math.round(faits * 100 / rows.length) : 0;
  const prochain = rows.filter(r => !r.fait && (r.avant || r.jour)).sort(rsTri)[0];
  bilan.innerHTML = `<div class="rs-bilan"><div class="rs-bilan-top"><b>${faits} sur ${rows.length}</b><span>${prochain ? 'Prochain : ' + esc(prochain.titre) + ' (' + esc(rsCourt(prochain.avant || prochain.jour)) + ')' : 'Rien d\'urgent'}</span></div>
    <div class="rs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div></div>`;

  const chip = (v, label) => `<button class="sh-chip${RS.filtre === v ? ' on' : ''}" type="button" data-act="filtre" data-v="${v}">${label}</button>`;
  fil.innerHTML = `<div class="sh-chips">${chip('afaire', `À faire · ${reste}`)}${chip('faits', `Faits · ${faits}`)}${chip('tous', `Tous · ${rows.length}`)}</div>`;

  let h = '';
  if (RS.filtre !== 'faits') {
    RS_SECTIONS.forEach(([cle, titre, test]) => {
      const l = rows.filter(test).sort(rsTri);
      if (l.length) h += `<div class="rs-sec ${cle}"><span>${titre}</span><em>${l.length}</em></div>` + l.map(rsCarte).join('');
    });
  }
  if (RS.filtre !== 'afaire') {
    const l = rows.filter(r => r.fait).sort(rsTri);
    if (l.length) h += `<div class="rs-sec ok"><span>Déjà fait</span><em>${l.length}</em></div>` + l.map(rsCarte).join('');
  }
  liste.innerHTML = h || `<div class="sh-vide"><p>${RS.filtre === 'faits' ? 'Rien de coché pour le moment.' : 'Tout est réservé. Bon voyage !'}</p></div>`;
}

/* ───────────── Cocher ───────────── */
async function rsCocher(id) {
  if (!requireEditor()) return;
  const r = RS.rows.find(x => x.id === id); if (!r) return;
  const avant = { fait: r.fait, fait_par: r.fait_par, fait_le: r.fait_le };
  const fait = !r.fait;
  const maj = { fait, fait_par: fait ? rsQui() : null, fait_le: fait ? new Date().toISOString() : null };
  Object.assign(r, maj); rsRafraichir();
  const { error } = await rsAppel('modifier', { id, champs: maj });
  if (error) { Object.assign(r, avant); rsRafraichir(); showToast(error.code === 'code' ? "Il faut le code de l'assistant" : "Pas enregistré : " + error.message); return; }
  showToast(fait ? 'Coché : ' + r.titre : 'Décoché');
  await rsNoteFiche(r.item_id);
}

// Dit « réservé » dans la fiche liée : une ligne ✔ en fin de notes quand TOUT ce qui la concerne est fait.
// Les transports sont exclus : leurs notes contiennent des champs lus par le code (DEP_ADDR:…, ARR_LAT:…).
async function rsNoteFiche(itemId) {
  const it = itemId && D.items.find(x => x.id === itemId);
  if (!it || it.type === 'transport') return;
  const rows = RS.rows.filter(r => r.item_id === itemId);
  const base = String(it.notes || '').replace(rsMarque, '').trimEnd();
  let notes = base;
  if (rows.length && rows.every(r => r.fait)) {
    const der = rows.slice().sort((a, b) => String(b.fait_le || '').localeCompare(String(a.fait_le || '')))[0];
    const mot = der.mode === 'surplace' ? 'Billet acheté' : der.mode === 'verifier' ? 'Billet confirmé' : 'Réservé';
    notes = (base ? base + '\n' : '') + `✔ ${mot}${der.fait_le ? ' le ' + rsMoisJour(der.fait_le) : ''}${der.fait_par ? ' par ' + der.fait_par : ''}`;
  }
  if (notes === String(it.notes || '')) return;
  const { error } = await sb.from('items').update({ notes }).eq('id', itemId);
  if (error) { showToast("La fiche n'a pas été mise à jour : " + error.message); return; }
  it.notes = notes;
  rsRafraichir();
}

/* ───────────── Ajouter / modifier / supprimer ───────────── */
function rsOuvrirFeuille(id) {
  const r = id ? RS.rows.find(x => x.id === id) : null;
  RS.edition = r ? r.id : null;
  document.getElementById('rsTitreFeuille').textContent = r ? 'Modifier la ligne' : 'Nouvelle ligne';
  const v = (k, x) => { document.getElementById('rsF-' + k).value = x == null ? '' : x; };
  v('titre', r?.titre); v('mode', r?.mode || 'resa'); v('jour', r?.jour); v('heure', r?.heure); v('avant', r?.avant);
  v('ou', r?.ou); v('lien', r?.lien); v('note', r?.note);
  const types = { activite: 'Activité', restaurant: 'Resto', cafe: 'Café', hotel: 'Hôtel', transport: 'Transport' };
  const opts = D.items.filter(x => types[x.type]).sort((a, b) => (a.ville || '').localeCompare(b.ville || '', 'fr') || (a.nom || '').localeCompare(b.nom || '', 'fr'));
  document.getElementById('rsF-item').innerHTML = '<option value="">Aucune</option>' + opts.map(x => `<option value="${esc(x.id)}">${esc(types[x.type])} · ${esc(x.ville || '')} · ${esc(String(x.nom || '').trim())}</option>`).join('');
  document.getElementById('rsF-item').value = r?.item_id || '';
  document.getElementById('rsSuppr').hidden = !r;
  openOverlay('rs-overlay');
}

async function rsEnregistrer() {
  if (!requireEditor()) return;
  const g = k => document.getElementById('rsF-' + k).value.trim();
  const titre = g('titre');
  if (!titre) { showToast('Dis ce qu\'il faut réserver'); document.getElementById('rsF-titre').focus(); return; }
  const lien = g('lien');
  if (lien && !rsLienOk(lien)) { showToast('Le lien doit commencer par https:// ou tel:+'); return; }
  const champs = { titre, mode: g('mode') || 'resa', jour: g('jour') || null, heure: g('heure') || null, avant: g('avant') || null,
    ou: g('ou') || null, lien: lien || null, note: g('note') || null, item_id: g('item') || null };
  const ancien = RS.edition ? RS.rows.find(x => x.id === RS.edition) : null;
  const { error } = await (ancien ? rsAppel('modifier', { id: ancien.id, champs }) : rsAppel('ajouter', { champs }));
  if (error) { showToast(error.code === 'code' ? "Il faut le code de l'assistant" : "Pas enregistré : " + error.message); return; }
  closeOverlay('rs-overlay');
  RS.enCours = false;
  await rsCharger();
  if (ancien && ancien.item_id !== champs.item_id) { await rsNoteFiche(ancien.item_id); }
  await rsNoteFiche(champs.item_id);
}

async function rsSupprimer() {
  const r = RS.rows.find(x => x.id === RS.edition); if (!r) return;
  if (!confirm('Supprimer « ' + r.titre + ' » ?')) return;
  const { error } = await rsAppel('supprimer', { id: r.id });
  if (error) { showToast(error.code === 'code' ? "Il faut le code de l'assistant" : "Pas supprimé : " + error.message); return; }
  closeOverlay('rs-overlay');
  RS.rows = RS.rows.filter(x => x.id !== r.id); rsRafraichir();
  await rsNoteFiche(r.item_id);
}

/* ───────────── Branchements sur le reste de l'app ───────────── */
ensureResaTab();

{ // renderAll : après chaque rendu on lance (une fois) le chargement de la liste
  rsRenderAllOrigine = renderAll;
  renderAll = function () {
    rsRenderAllOrigine();
    if (isEditorMode()) {
      if (!RS.charge) rsCharger();
      rsAbonner();
      if (RS.charge) rsBadge();
    }
  };
}
{ // navigation
  const _goTab = goTab;
  goTab = function (n, el) {
    _goTab(n, el);
    if (n !== 'areserver') return;
    document.getElementById('nb-more')?.classList.add('on');
    document.getElementById('nd-areserver')?.classList.add('active');
    renderResa(); RS.enCours = false; rsCharger();
  };
}
{ // fiches d'activités : pastille à côté du statut
  const marquer = (d, item, sel) => {
    const st = rsEtatFiche(item && item.id); if (!st) return d;
    const cible = d.querySelector(sel) || d.querySelector('.gc-name') || d.firstElementChild;
    if (cible) cible.insertAdjacentHTML(sel === '.gc-name' ? 'afterend' : 'afterend', ' ' + rsPill(st.mode, st.ok));
    return d;
  };
  const _mc = makeCard, _mg = makeGalleryCard;
  makeCard = item => marquer(_mc(item), item, '.statut-pill');
  makeGalleryCard = item => marquer(_mg(item), item, '.gc-name');
}
{ // Programme : bandeau du jour + pastille sur les lignes
  const _dh = dayHead, _vr = vitalRow, _la = legerAnchor;
  dayHead = function (day) {
    const h = _dh(day);
    if (!rsActif()) return h;
    const l = rsOuvertsDuJour(day.date_voyage); if (!l.length) return h;
    return h + `<div class="rs-day" role="note"><div class="rs-day-t">${ic('ticket')}<b>${l.length} à faire pour ce jour</b></div>${l.map(r =>
      `<button type="button" class="rs-day-l" data-rs-open="${esc(r.id)}">${rsPill(r.mode, false)}<span>${esc(r.titre)}${r.avant === day.date_voyage && r.jour !== day.date_voyage ? ' <i>(à faire aujourd\'hui)</i>' : ''}${r.heure && r.jour === day.date_voyage ? ' · ' + esc(r.heure) : ''}</span></button>`).join('')}</div>`;
  };
  // Une fiche (le billet du parc, par exemple) sert à plusieurs étapes d'une même journée : la pastille
  // n'apparaît que sur la première ligne de la fiche, sinon on aurait six « À réserver » d'affilée.
  let vus = new Set();
  const premiere = id => { if (vus.has(id)) return false; vus.add(id); return true; };
  const _dh2 = dayHead;
  dayHead = function (day) { vus = new Set(); return _dh2(day); };
  vitalRow = function (r) {
    const h = _vr(r), id = r.item && r.item.id, st = rsEtatFiche(id);
    return st && premiere(id) ? h.replace(/<span class="pv-tag [^"]*">[^<]*<\/span>/, rsPill(st.mode, st.ok)) : h;
  };
  legerAnchor = function (e) {
    const h = _la(e), id = e.item && e.item.id, st = rsEtatFiche(id);
    return st && !st.ok && premiere(id) ? h.replace(/(<div class="pl-a-t">[\s\S]*?)(<\/div>)/, `$1 ${rsPill(st.mode, false)}$2`) : h;
  };
}
{ // Planning : pastille sur la carte du jour
  const _rp = renderPlanning;
  renderPlanning = function () {
    _rp();
    if (!rsActif()) return;
    document.querySelectorAll('.tl-day-card').forEach(c => {
      const day = D.planning.find(d => d.id === c.dataset.id); if (!day) return;
      const n = rsOuvertsDuJour(day.date_voyage).length; if (!n) return;
      c.querySelector('.tl-chips')?.insertAdjacentHTML('beforeend', `<span class="tl-chip rs-chip">${n} à réserver</span>`);
    });
  };
}

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
#tab-areserver .ph h1::after{content:'订'}#tab-areserver .ph::before{content:'票'}
.rs-count{position:absolute;top:4px;right:10px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--accent);color:#fff;font:700 .62rem/17px var(--font);text-align:center}
.rs-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font:700 .62rem/1.5 var(--font);letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;vertical-align:middle}
.rs-pill .gi{width:11px;height:11px}
.rs-pill.resa{background:#fbe4e6;color:#a31d28}
.rs-pill.verifier{background:#fbf0d6;color:#7a5612}
.rs-pill.surplace{background:#ece6da;color:#5c4a43}
.rs-pill.ok{background:#dff3ea;color:#146a4d}
.rs-chip{background:#fbe4e6!important;color:#a31d28!important;font-weight:700}
.rs-bilan{margin:0 16px 12px;padding:12px 14px;border-radius:18px;background:#fffdf8;border:1px solid rgba(184,137,58,.5);box-shadow:var(--shadow-sm)}
.rs-bilan-top{display:flex;flex-direction:column;gap:2px;margin-bottom:9px}
.rs-bilan-top b{font:700 1.1rem var(--font-title);color:var(--accent-ink,var(--accent))}
.rs-bilan-top span{font-size:.74rem;color:var(--txt2);line-height:1.4}
.rs-bar{height:8px;border-radius:99px;background:var(--sand);overflow:hidden}
.rs-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold,#c9a84c),var(--green));transition:width .3s}
.rs-sec{display:flex;align-items:center;gap:8px;margin:16px 16px 8px;font:700 .72rem var(--font);letter-spacing:.1em;text-transform:uppercase;color:var(--txt2)}
.rs-sec::before{content:'';width:4px;height:14px;border-radius:2px;background:var(--accent)}
.rs-sec.verifier::before{background:#b8893a}.rs-sec.surplace::before,.rs-sec.libre::before{background:var(--txt3)}.rs-sec.ok::before{background:var(--green)}
.rs-sec em{font-style:normal;margin-left:auto;font-size:.68rem;color:var(--txt3)}
.rs-card{display:grid;grid-template-columns:auto 1fr;gap:12px;margin:0 16px 10px;padding:12px 14px 10px 12px;background:#fffdf8;border:1px solid rgba(184,137,58,.45);border-radius:16px;box-shadow:var(--shadow-sm)}
.rs-card.flash{animation:rsFlash 1.4s ease}
@keyframes rsFlash{0%,60%{box-shadow:0 0 0 3px rgba(139,29,44,.45)}100%{box-shadow:var(--shadow-sm)}}
.rs-box{width:30px;height:30px;margin-top:2px;border-radius:50%;border:2px solid var(--border2,#cdbfb0);background:#fff;color:transparent;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}
.rs-box .gi{width:17px;height:17px}
.rs-box:active{transform:scale(.92)}
.rs-card.ok .rs-box{background:var(--green);border-color:var(--green);color:#fff}
.rs-card.ok .rs-titre{text-decoration:line-through;text-decoration-color:rgba(31,20,17,.35)}
.rs-card.ok .rs-body{opacity:.78}
.rs-body{min-width:0}
.rs-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:5px}
.rs-when{font-size:.72rem;font-weight:600;color:var(--txt2)}
.rs-titre{font:700 .95rem/1.3 var(--font-title);color:var(--txt);overflow-wrap:anywhere}
.rs-avant{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:.74rem;font-weight:700;color:var(--laque,#b3202a)}
.rs-avant .gi{width:14px;height:14px}
.rs-ou{margin-top:6px;font-size:.8rem;line-height:1.45;color:var(--txt);overflow-wrap:anywhere}
.rs-note{margin-top:5px;font-size:.78rem;line-height:1.5;color:var(--txt2);overflow-wrap:anywhere}
.rs-foot{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px}
.rs-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border-radius:999px;border:none;background:var(--accent);color:#fff;font:700 .76rem var(--font);text-decoration:none;cursor:pointer}
.rs-btn .gi{width:15px;height:15px}
.rs-btn.alt{background:#fff;color:var(--txt2);border:1px solid var(--border)}
.rs-btn.ico{padding:0 10px}
.rs-btn:active{transform:scale(.96)}
.rs-meta{margin-left:auto;font-size:.66rem;color:var(--txt3)}
.rs-2col{display:grid;grid-template-columns:1fr 110px;gap:10px}
.rs-suppr{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:6px;padding:10px;border:none;background:none;color:var(--laque,#b3202a);font:700 .8rem var(--font);cursor:pointer}
.rs-suppr[hidden]{display:none}.rs-suppr .gi{width:16px;height:16px}
.rs-day{margin:0 0 10px;padding:9px 11px;border-radius:14px;background:#fff5f5;border:1px solid rgba(179,32,42,.28)}
.rs-day-t{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:.76rem;color:#a31d28}
.rs-day-t .gi{width:15px;height:15px}
.rs-day-l{display:flex;align-items:flex-start;gap:8px;width:100%;padding:5px 0;border:none;background:none;text-align:left;font:600 .78rem/1.4 var(--font);color:var(--txt);cursor:pointer}
.rs-day-l i{font-style:normal;color:var(--txt3);font-weight:500}
.rs-day-l .rs-pill{flex:none;margin-top:1px}
@media (prefers-reduced-motion:reduce){.rs-card.flash{animation:none}}
</style>`);
