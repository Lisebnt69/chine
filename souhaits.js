/* ═══════════════════════════════════════════════════════════════
   souhaits.js — Onglet « Souhaits » (menu Plus) + la mascotte Roomy

   Souhaits : une liste de tickets « telle personne veut telle chose ».
     - ouvert au mode visiteur : c'est le seul endroit où il peut écrire, MAIS il ne lit pas la liste :
       il envoie un ticket, c'est tout (la liste n'est même pas téléchargée dans son appareil)
     - une personne ET un souhait obligatoires, une photo du souhait facultative
     - Matis et Lise lisent, modifient, cochent « trouvé » (ou demandent à Roomy dans le chat), ajoutent la
       photo du cadeau trouvé et suppriment
   Roomy : la chatte mascotte. Elle explique l'onglet aux visiteurs (mini tuto)
     et elle est l'assistante IA du chat : c'est à elle qu'on parle.

   Table : public.souhaits (supabase/migrations/20261105010000_souhaits.sql, _cadeau, _ferme).
   Fermée à la clé publique sauf l'ajout : Matis et Lise passent par la fonction `assistant` (mode « souhaits »).
   Chargé APRÈS prog.js.
   ═══════════════════════════════════════════════════════════════ */

/* ───────────── Roomy ───────────── */
const MIMI = {
  nom: 'Roomy',

  img: { calme: 'mascotte/calme.webp', explique: 'mascotte/explique.webp', joie: 'mascotte/joie.webp' },
  tete: 'mascotte/tete.webp',
};
window.MIMI = MIMI;

/* ───────────── État ───────────── */
const SH = { rows: [], charge: false, erreur: '', filtre: 'attente', pers: '', occupe: false, image: '', imageCadeau: '', edition: null, etape: 0 };
const SH_TUTO = [
  { pose: 'explique', zh: '欢迎', txt: "Bienvenue ! Moi, c'est <b>Roomy</b>, je voyage avec Matis et Lise. Ils aimeraient te rapporter quelque chose de Chine : ici, tu leur dis quoi. Un souhait = un ticket." },
  { pose: 'explique', num: 1, txt: "<b>Pour qui ?</b> Pour toi, ou pour quelqu'un de la famille : un prénom suffit. Maman, Julien, Mamie…" },
  { pose: 'explique', num: 2, txt: "<b>Qu'est-ce qui te ferait plaisir ?</b> Du thé, un éventail, un t-shirt… Plus tu es précis (taille, couleur), mieux Matis et Lise chercheront." },
  { pose: 'calme', num: 3, txt: "<b>Une photo ?</b> C'est facultatif. Si tu as un modèle en tête, montre-le-moi. Sinon, ce n'est pas grave." },
  { pose: 'joie', zh: '太好了', txt: "Et voilà ! Ton ticket part chez Matis et Lise. Ils sont les seuls à lire la liste, donc la surprise reste entière, et ils feront de leur mieux pour le trouver." },
];

const shLire = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } };
const shEcrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : tant pis */ } };
const shNbEnvoyes = () => Math.max(0, parseInt(shLire('souhaits_nb', '0'), 10) || 0); // tickets envoyés depuis cet appareil
const shImgOk = s => /^data:image\/(jpeg|png|webp);base64,/.test(s || '');
const shQui = k => k === 'matis' ? 'Matis' : k === 'lise' ? 'Lise' : k === 'roomy' ? MIMI.nom : '';
const shColonneAbsente = err => /image_cadeau|trouve_par|trouve_le/.test((err && err.message) || '');
const shPoseImg = (pose, cls) => `<img class="${cls || 'mimi-img'}" src="${MIMI.img[pose] || MIMI.img.calme}" alt="${MIMI.nom}, la chatte mascotte" draggable="false">`;

SH.etape = shLire('souhaits_tuto', '') === '1' ? SH_TUTO.length : 0; // déjà vu sur cet appareil : on n'affiche que le rappel

/* ───────────── Données ───────────── */
// La table est FERMÉE à la clé publique (sauf l'ajout d'un visiteur) : Matis et Lise lisent, modifient, cochent et
// suppriment par la fonction `assistant` (mode « souhaits »), avec le code de l'assistant déjà saisi pour le chat @ia.
// Retourne { data } ou { error: { code, message } }, code ∈ code | reseau | table | ''.
async function shAppel(action, extra) {
  const code = iaSecret();
  if (!code) return { error: { code: 'code', message: 'code' } };
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': code },
      body: JSON.stringify({ mode: 'souhaits', action, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem('ia_secret'); } catch (e) { /* tant pis */ } return { error: { code: 'code', message: 'code' } }; }
    if (!r.ok) return { error: { code: j.code || '', message: j.error || 'erreur ' + r.status } };
    return { data: j };
  } catch (e) { return { error: { code: 'reseau', message: 'réseau' } }; }
}
function shMsgErreur(err) {
  if (err.code === 'code') return "Il faut le bon code de l'assistant (le même que pour @roomy). Réessaie.";
  if (err.code === 'reseau') return "Je n'arrive pas à joindre la liste. Vérifie ta connexion.";
  if (shColonneAbsente(err)) return "La base n'est pas à jour : lancer la migration 20261105030000_souhaits_cadeau.sql.";
  if (err.code === 'table') return "La liste n'est pas encore prête. Réessaie plus tard.";
  return "Aïe, ça n'a pas marché : " + err.message;
}

/* ───────────── Pastille : nombre de tickets pas encore trouvés ───────────── */
// Sur le bouton Souhaits du tiroir et sur le bouton « Plus » (qui le cache). Réservée à Matis et Lise : un visiteur ne la voit jamais.
function shPastille(nb) {
  SH.nb = nb;
  for (const id of ['nd-souhaits', 'nb-more']) {
    const bouton = document.getElementById(id); if (!bouton) continue;
    let p = bouton.querySelector('.sh-badge');
    if (!nb || !isEditorMode()) { p?.remove(); continue; }
    if (!p) { p = document.createElement('span'); p.className = 'sh-badge'; p.setAttribute('aria-hidden', 'true'); bouton.appendChild(p); }
    p.textContent = nb > 99 ? '99+' : String(nb);
    bouton.setAttribute('data-nb-souhaits', nb);
  }
}
// Relit juste le nombre (pas les photos). Silencieux : jamais de fenêtre de saisie du code, un échec laisse la pastille telle quelle.
async function shMajPastille() {
  if (!isEditorMode() || document.hidden) return;
  let code = ''; try { code = localStorage.getItem('ia_secret') || ''; } catch (e) { /* ignoré */ }
  if (!code) return;
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': code },
      body: JSON.stringify({ mode: 'souhaits', action: 'compter' }),
    });
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    if (typeof j.nb === 'number') shPastille(j.nb);
  } catch (e) { /* hors ligne : tant pis */ }
}
window.shMajPastille = shMajPastille;

async function loadSouhaits() {
  if (typeof sb === 'undefined' || !sb || !isEditorMode()) return; // le visiteur ne lit jamais la liste
  const { data, error } = await shAppel('lister');
  if (error) SH.erreur = error.code === 'code' || error.code === 'reseau' ? error.code : error.code === 'table' ? 'table' : (error.message || 'erreur');
  else { SH.rows = data.rows || []; SH.erreur = ''; shPastille(SH.rows.filter(r => !r.trouve).length); }
  SH.charge = true;
  renderSouhaits();
}

/* ───────────── Onglet ───────────── */
function ensureSouhaitsTab() {
  if (document.getElementById('tab-souhaits')) return;
  const main = document.getElementById('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-souhaits';
  tab.innerHTML = `
    <div class="ph"><h1>Souhaits</h1><p id="shSub">Ce qu'on rapporte de Chine</p></div>
    <div id="shTuto"></div>
    <button class="sh-add" data-act="ajouter" type="button">${ic('plus')}<span>Ajouter un ticket</span></button>
    <div id="shFiltres"></div>
    <div id="shListe"></div>`;
  main.appendChild(tab);
  tab.addEventListener('click', shClic);

  // Tiroir « Plus »
  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !document.getElementById('nd-souhaits')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-souhaits'; b.type = 'button';
    b.onclick = () => { goTab('souhaits', document.getElementById('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic">${ic('gift')}</span><span class="nav-drawer-lbl">Souhaits</span>`;
    grid.appendChild(b);
  }

  // Feuille de saisie du ticket
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'sh-overlay';
  ov.onclick = e => { if (e.target === ov) closeOverlay('sh-overlay'); };
  ov.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="mimi-row sh-mimi-top">
        <img class="mimi-img sm" id="shFormRoomy" src="${MIMI.img.explique}" alt="${MIMI.nom}" draggable="false">
        <div class="mimi-bubble" id="shFormBulle">Pour qui ? Et qu'est-ce qu'on lui rapporte ?</div>
      </div>
      <div class="sheet-title" id="shTitre">Nouveau ticket</div>
      <div class="form-group"><label class="form-label" for="shWho">Pour qui ? <span class="sh-req">obligatoire</span></label>
        <input class="form-input" id="shWho" maxlength="40" autocomplete="off" list="shPersonnes" placeholder="Maman, Julien, Mamie…">
        <datalist id="shPersonnes"></datalist></div>
      <div class="form-group"><label class="form-label" for="shEnvie">Qu'est-ce qu'elle veut ? <span class="sh-req">obligatoire</span></label>
        <textarea class="form-input" id="shEnvie" rows="3" maxlength="300" placeholder="Du thé au jasmin, un éventail rouge, un t-shirt taille M…"></textarea></div>
      <div class="form-group"><label class="form-label">Photo de ce qu'elle veut <span class="sh-opt">facultatif</span></label>
        <input type="file" id="shFile" accept="image/*" hidden>
        <button class="sh-photo-btn" id="shPhotoBtn" type="button" data-act="photo" data-slot="envie">${ic('camera')}<span>Ajouter une photo</span></button>
        <div class="sh-photo-prev" id="shPrev" hidden><img id="shPrevImg" alt="Aperçu de la photo"><button type="button" data-act="retirer-photo" data-slot="envie" aria-label="Retirer la photo">${ic('x')}</button></div>
      </div>
      <div id="shEditeur" hidden>
        <div class="form-group"><label class="form-label">Photo du cadeau trouvé <span class="sh-opt">facultatif</span></label>
          <input type="file" id="shFileC" accept="image/*" hidden>
          <button class="sh-photo-btn" id="shPhotoBtnC" type="button" data-act="photo" data-slot="cadeau">${ic('gift')}<span>Ajouter la photo du cadeau</span></button>
          <div class="sh-photo-prev" id="shPrevC" hidden><img id="shPrevImgC" alt="Aperçu du cadeau"><button type="button" data-act="retirer-photo" data-slot="cadeau" aria-label="Retirer la photo du cadeau">${ic('x')}</button></div>
        </div>
        <label class="sh-check"><input type="checkbox" id="shTrouve"><span>Trouvé : le cadeau est dans la valise</span></label>
      </div>
      <button class="btn-primary" id="shSend" type="button" data-act="envoyer">Envoyer le ticket</button>
      <button class="btn-cancel" type="button" data-act="fermer">Annuler</button>
      <div style="height:4px;"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', shClic);
  ov.querySelector('#shFile').addEventListener('change', e => shPhotoChoisie(e, 'envie'));
  ov.querySelector('#shFileC').addEventListener('change', e => shPhotoChoisie(e, 'cadeau'));
  ov.querySelector('#shWho').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('shEnvie').focus(); } });

  // Agrandir une photo
  const z = document.createElement('div');
  z.id = 'shZoom'; z.className = 'sh-zoom'; z.hidden = true;
  z.innerHTML = '<img alt="Photo du ticket">';
  z.onclick = () => { z.hidden = true; };
  document.body.appendChild(z);
}

function shClic(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case 'ajouter': shOuvrirFormulaire(); break;
    case 'fermer': closeOverlay('sh-overlay'); break;
    case 'modifier': shOuvrirFormulaire(id); break;
    case 'recharger': { if (SH.erreur === 'code') iaSecret(true); loadSouhaits(); break; }
    case 'photo': document.getElementById(el.dataset.slot === 'cadeau' ? 'shFileC' : 'shFile').click(); break;
    case 'retirer-photo': shRetirerPhoto(el.dataset.slot); break;
    case 'envoyer': shEnvoyer(); break;
    case 'suivant': SH.etape = Math.min(SH.etape + 1, SH_TUTO.length); if (SH.etape >= SH_TUTO.length) shFinTuto(); else renderTuto(); break;
    case 'passer': shFinTuto(); break;
    case 'revoir': SH.etape = 0; shEcrire('souhaits_tuto', ''); renderTuto(); break;
    case 'filtre': SH.filtre = el.dataset.v; renderSouhaits(); break;
    case 'pers': SH.pers = SH.pers === el.dataset.v ? '' : el.dataset.v; renderSouhaits(); break;
    case 'trouve': shBasculer(id); break;
    case 'suppr': shSupprimer(id); break;
    case 'zoom': { const z = document.getElementById('shZoom'); z.querySelector('img').src = el.getAttribute('src'); z.hidden = false; break; }
  }
}

/* ───────────── Rendu ───────────── */
function renderSouhaits() {
  const tab = document.getElementById('tab-souhaits'); if (!tab) return;
  renderTuto();
  const addBtn = tab.querySelector('.sh-add span');
  if (!isEditorMode()) { // visiteur : il envoie, il ne lit rien
    if (addBtn) addBtn.textContent = 'Envoyer un ticket';
    const sub = document.getElementById('shSub'); if (sub) sub.textContent = "Dis-nous ce que tu veux qu'on te rapporte";
    document.getElementById('shFiltres').innerHTML = '';
    const n = shNbEnvoyes();
    document.getElementById('shListe').innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>La liste est secrète : seuls Matis et Lise la lisent.<br>Toi, tu peux juste leur envoyer un ticket.${n ? `<br><b>${n} ticket${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''}</b> depuis cet appareil.` : ''}</p></div>`;
    return;
  }
  if (addBtn) addBtn.textContent = 'Ajouter un ticket';
  const rows = SH.rows;
  const nbOk = rows.filter(r => r.trouve).length;
  const sub = document.getElementById('shSub');
  if (sub) sub.textContent = rows.length ? `${rows.length} ticket${rows.length > 1 ? 's' : ''} · ${nbOk} trouvé${nbOk > 1 ? 's' : ''}` : "Ce qu'on rapporte de Chine";

  const liste = document.getElementById('shListe'), fil = document.getElementById('shFiltres');
  if (SH.erreur) {
    fil.innerHTML = '';
    const msg = SH.erreur === 'table' ? "La liste n'est pas encore branchée. Lancer <b>supabase/migrations/20261105010000_souhaits.sql</b> dans Supabase (SQL Editor)."
      : SH.erreur === 'code' ? "La liste est protégée : il me faut le code de l'assistant, le même que pour <b>@roomy</b> dans le chat."
      : SH.erreur === 'reseau' ? "Je n'arrive pas à joindre la liste. Vérifie ta connexion."
      : "Je n'arrive pas à lire la liste pour le moment.";
    liste.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>${msg}</p><button class="sh-lien" type="button" data-act="recharger">Réessayer${SH.erreur === 'code' ? ' avec le code' : ''}</button></div>`;
    return;
  }
  if (!SH.charge) { fil.innerHTML = ''; liste.innerHTML = '<div class="sh-vide"><p>Je cherche les tickets…</p></div>'; return; }
  if (!rows.length) {
    fil.innerHTML = '';
    liste.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>Aucun ticket pour l'instant.<br>Écris le premier !</p></div>`;
    return;
  }

  const numero = new Map(rows.slice().reverse().map((r, i) => [r.id, i + 1]));
  const personnes = [...new Set(rows.map(r => r.personne.trim()))].sort((a, b) => a.localeCompare(b, 'fr'));
  const cle = s => s.trim().toLocaleLowerCase('fr');
  const uniq = new Map(); personnes.forEach(p => { if (!uniq.has(cle(p))) uniq.set(cle(p), p); });
  const noms = [...uniq.values()];
  if (SH.pers && !uniq.has(cle(SH.pers))) SH.pers = '';

  const chip = (act, v, label, on) => `<button class="sh-chip${on ? ' on' : ''}" type="button" data-act="${act}" data-v="${esc(v)}">${label}</button>`;
  const nAtt = rows.length - nbOk;
  fil.innerHTML = `<div class="sh-chips">${chip('filtre', 'attente', `À trouver · ${nAtt}`, SH.filtre === 'attente')}${chip('filtre', 'trouve', `Trouvés · ${nbOk}`, SH.filtre === 'trouve')}${chip('filtre', 'tous', `Tous · ${rows.length}`, SH.filtre === 'tous')}</div>`
    + (noms.length > 1 ? `<div class="sh-chips sh-pers">${noms.map(n => chip('pers', n, esc(n), SH.pers && cle(SH.pers) === cle(n))).join('')}</div>` : '');

  const vis = rows.filter(r => (SH.filtre === 'tous' || (SH.filtre === 'trouve') === !!r.trouve) && (!SH.pers || cle(r.personne) === cle(SH.pers)));
  if (!vis.length) {
    liste.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>${SH.filtre === 'trouve' ? 'Rien de trouvé pour le moment.' : 'Tout est trouvé ici. Bravo !'}</p></div>`;
    return;
  }
  liste.innerHTML = vis.map(r => {
    const n = String(numero.get(r.id) || 0).padStart(2, '0');
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    const de = shQui(r.auteur) || 'un visiteur';
    const par = r.trouve && shQui(r.trouve_par) ? ` · coché par ${shQui(r.trouve_par)}` : '';
    const cadeau = shImgOk(r.image_cadeau)
      ? `<div class="tk-cadeau"><img class="tk-img" src="${esc(r.image_cadeau)}" alt="Photo du cadeau pour ${esc(r.personne)}" data-act="zoom" loading="lazy"><span>${ic('gift')}Le cadeau</span></div>` : '';
    return `<article class="tk${r.trouve ? ' ok' : ''}">
      <div class="tk-stub"><span class="tk-seal">愿</span><span class="tk-n">N° ${n}</span></div>
      <div class="tk-body">
        <div class="tk-top">
          <div class="tk-txt"><div class="tk-pour">pour</div><div class="tk-who">${esc(r.personne)}</div></div>
          ${shImgOk(r.image) ? `<img class="tk-img" src="${esc(r.image)}" alt="Photo du souhait de ${esc(r.personne)}" data-act="zoom" loading="lazy">` : ''}
        </div>
        <div class="tk-want">${esc(r.envie)}</div>
        ${cadeau}
        <div class="tk-foot">
          <span class="tk-meta">${esc(date)} · ajouté par ${esc(de)}${esc(par)}</span>
          <span class="tk-actions">
            <button type="button" class="tk-btn${r.trouve ? ' done' : ''}" data-act="trouve" data-id="${esc(r.id)}">${ic('check-circle')}<span>${r.trouve ? 'Trouvé' : 'Marquer trouvé'}</span></button>
            <button type="button" class="tk-btn" data-act="modifier" data-id="${esc(r.id)}" aria-label="Modifier ce ticket${r.trouve && !r.image_cadeau ? ' ou ajouter la photo du cadeau' : ''}">${ic('pencil')}${r.trouve && !r.image_cadeau ? '<span>Photo du cadeau</span>' : ''}</button>
            <button type="button" class="tk-btn del" data-act="suppr" data-id="${esc(r.id)}" aria-label="Supprimer ce ticket">${ic('trash')}</button>
          </span>
        </div>
        ${r.trouve ? '<span class="tk-stamp" aria-hidden="true">到手</span>' : ''}
      </div></article>`;
  }).join('');
}

/* Mini tuto : Roomy explique, étape par étape */
function renderTuto() {
  const box = document.getElementById('shTuto'); if (!box) return;
  const vu = shLire('souhaits_tuto', '') === '1';
  if (vu && SH.etape >= SH_TUTO.length) {
    box.innerHTML = `<button class="sh-rappel" type="button" data-act="revoir"><img src="${MIMI.tete}" alt="">Un rappel avec Roomy ?</button>`;
    return;
  }
  if (SH.etape >= SH_TUTO.length) SH.etape = 0;
  const s = SH_TUTO[SH.etape], dernier = SH.etape === SH_TUTO.length - 1;
  box.innerHTML = `<section class="sh-tuto" aria-live="polite">
    <div class="sh-tuto-tag">${s.zh ? `<span class="sh-zh">${s.zh}</span>` : ''}${s.num ? `<span class="sh-step">Étape ${s.num} sur 3</span>` : '<span class="sh-step">Mini tuto</span>'}</div>
    <div class="mimi-row">
      ${shPoseImg(s.pose)}
      <div class="mimi-bubble">${s.txt}</div>
    </div>
    <div class="sh-tuto-bar">
      <span class="sh-dots">${SH_TUTO.map((_, i) => `<i class="${i === SH.etape ? 'on' : ''}"></i>`).join('')}</span>
      <button class="sh-lien" type="button" data-act="passer">Passer</button>
      <button class="sh-next" type="button" data-act="suivant">${dernier ? "J'ai compris" : 'Suivant'}</button>
    </div></section>`;
}
function shFinTuto() { shEcrire('souhaits_tuto', '1'); SH.etape = SH_TUTO.length; renderTuto(); }

/* ───────────── Formulaire ───────────── */
// Deux photos possibles : celle du souhait (visiteurs et éditeurs) et celle du cadeau trouvé (éditeurs).
const SH_SLOTS = {
  envie: { prop: 'image', file: 'shFile', btn: 'shPhotoBtn', prev: 'shPrev', img: 'shPrevImg' },
  cadeau: { prop: 'imageCadeau', file: 'shFileC', btn: 'shPhotoBtnC', prev: 'shPrevC', img: 'shPrevImgC' },
};
function shAfficherPhoto(slot, data) {
  const s = SH_SLOTS[slot]; SH[s.prop] = data || '';
  const f = document.getElementById(s.file); if (f) f.value = '';
  const p = document.getElementById(s.prev), btn = document.getElementById(s.btn);
  if (data) document.getElementById(s.img).src = data;
  if (p) p.hidden = !data; if (btn) btn.hidden = !!data;
}
function shOuvrirFormulaire(id) {
  const editeur = isEditorMode();
  const r = id && editeur ? SH.rows.find(x => x.id === id) : null;
  SH.edition = r ? r.id : null;
  document.getElementById('shWho').value = r ? r.personne : '';
  document.getElementById('shEnvie').value = r ? r.envie : '';
  shAfficherPhoto('envie', r && shImgOk(r.image) ? r.image : '');
  shAfficherPhoto('cadeau', r && shImgOk(r.image_cadeau) ? r.image_cadeau : '');
  document.getElementById('shTrouve').checked = !!(r && r.trouve);
  document.getElementById('shEditeur').hidden = !r;
  document.getElementById('shTitre').textContent = r ? 'Modifier le ticket' : 'Nouveau ticket';
  document.getElementById('shSend').textContent = r ? 'Enregistrer' : editeur ? 'Créer le ticket' : 'Envoyer le ticket';
  shBulle(r ? `Tu changes le ticket de ${r.personne}.` : "Pour qui ? Et qu'est-ce qu'on lui rapporte ?", false);
  document.getElementById('shPersonnes').innerHTML = editeur ? [...new Set(SH.rows.map(x => x.personne.trim()))].map(p => `<option value="${esc(p)}">`).join('') : '';
  document.getElementById('shSend').disabled = false;
  openOverlay('sh-overlay');
  setTimeout(() => document.getElementById('shWho').focus(), 250);
}
function shBulle(txt, alerte) {
  const b = document.getElementById('shFormBulle'); if (!b) return;
  b.textContent = txt; b.classList.toggle('alerte', !!alerte);
  if (alerte) { b.classList.remove('secoue'); void b.offsetWidth; b.classList.add('secoue'); }
}
function shRetirerPhoto(slot) { shAfficherPhoto(slot || 'envie', ''); }
// Photo réduite avant envoi : elle est stockée dans la ligne du ticket, pas dans un fichier à part.
function shReduire(file, max = 900) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = .74, out = c.toDataURL('image/jpeg', q);
      while (out.length > 380000 && q > .4) { q -= .1; out = c.toDataURL('image/jpeg', q); }
      ok(out);
    };
    im.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image illisible')); };
    im.src = url;
  });
}
async function shPhotoChoisie(e, slot) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    shAfficherPhoto(slot, await shReduire(f));
    if (slot === 'cadeau') document.getElementById('shTrouve').checked = true; // un cadeau en photo, c'est qu'il est trouvé
  } catch (err) { shRetirerPhoto(slot); shBulle("Cette photo ne s'ouvre pas. Essaie-en une autre, ou continue sans.", true); }
}

const shTableAbsente = err => /souhaits|PGRST205|42P01/.test((err.code || '') + ' ' + (err.message || ''));
async function shEnvoyer() {
  if (SH.occupe) return;
  const personne = document.getElementById('shWho').value.trim().replace(/\s+/g, ' ');
  const envie = document.getElementById('shEnvie').value.trim();
  if (!personne && !envie) { shBulle("Il me faut une personne et son souhait.", true); document.getElementById('shWho').focus(); return; }
  if (!personne) { shBulle("Pour qui est ce ticket ? Un prénom suffit.", true); document.getElementById('shWho').focus(); return; }
  if (!envie) { shBulle(`Et qu'est-ce que ${personne} veut ?`, true); document.getElementById('shEnvie').focus(); return; }
  if (typeof sb === 'undefined' || !sb) { shBulle("Je ne suis pas connectée pour le moment.", true); return; }

  const editeur = isEditorMode();
  const cur = SH.edition && editeur ? SH.rows.find(x => x.id === SH.edition) : null;
  const libelle = cur ? 'Enregistrer' : editeur ? 'Créer le ticket' : 'Envoyer le ticket';
  SH.occupe = true; const btn = document.getElementById('shSend'); btn.disabled = true; btn.textContent = cur ? "J'enregistre…" : 'Je note…';
  try {
    if (cur) { // modification : réservée à Matis et Lise
      const trouve = document.getElementById('shTrouve').checked;
      const maj = {
        personne, envie, image: SH.image || null, image_cadeau: SH.imageCadeau || null, trouve,
        trouve_par: trouve ? (cur.trouve && cur.trouve_par ? cur.trouve_par : currentUser) : null,
        trouve_le: trouve ? (cur.trouve && cur.trouve_le ? cur.trouve_le : new Date().toISOString()) : null,
      };
      const rep = await shAppel('modifier', { id: cur.id, champs: maj });
      if (rep.error) { shBulle(shMsgErreur(rep.error), true); return; }
      const data = rep.data.row;
      SH.rows = SH.rows.map(x => x.id === data.id ? data : x);
      closeOverlay('sh-overlay'); renderSouhaits();
      if (trouve && !cur.trouve) mimiCelebre(`Trouvé pour ${personne} !`, '到手');
      return;
    }
    const ligne = { personne, envie, image: SH.image || null, auteur: currentUser || 'visiteur' };
    if (!editeur) { // le visiteur envoie sans rien relire : on ne demande pas la ligne en retour
      const { error } = await sb.from('souhaits').insert(ligne);
      if (error) {
        shBulle(shTableAbsente(error) ? "La liste n'est pas encore prête. Réessaie plus tard." : "Aïe, ça n'a pas marché : " + error.message, true);
        return;
      }
      shEcrire('souhaits_nb', String(shNbEnvoyes() + 1));
      closeOverlay('sh-overlay'); renderSouhaits();
      mimiCelebre(`Envoyé pour ${personne} !`, '太好了');
      return;
    }
    const rep = await shAppel('ajouter', { champs: ligne });
    if (rep.error) { shBulle(shMsgErreur(rep.error), true); return; }
    const data = rep.data.row;
    SH.rows = [data, ...SH.rows.filter(r => r.id !== data.id)]; SH.erreur = ''; SH.charge = true;
    SH.filtre = 'attente'; SH.pers = '';
    closeOverlay('sh-overlay'); renderSouhaits();
    mimiCelebre(`Noté pour ${personne} !`, '太好了');
  } catch (err) {
    shBulle("Je n'arrive pas à joindre la liste. Vérifie ta connexion.", true);
  } finally { SH.occupe = false; btn.disabled = false; btn.textContent = libelle; }
}

async function shBasculer(id) {
  if (!isEditorMode()) { showToast('Réservé à Matis et Lise'); return; }
  const r = SH.rows.find(x => x.id === id); if (!r) return;
  const val = !r.trouve;
  const maj = val ? { trouve: true, trouve_par: currentUser, trouve_le: new Date().toISOString() } : { trouve: false, trouve_par: null, trouve_le: null };
  const { error } = await shAppel('modifier', { id, champs: maj });
  if (error) { showToast(shColonneAbsente(error) ? 'Base pas à jour : lancer la migration souhaits_cadeau' : error.code === 'code' ? shMsgErreur(error) : 'Erreur : ' + error.message); return; }
  Object.assign(r, maj); renderSouhaits();
  if (val) mimiCelebre(`Trouvé pour ${r.personne} !`, '到手');
}
async function shSupprimer(id) {
  if (!isEditorMode()) return; // le visiteur envoie, il ne supprime pas
  const r = SH.rows.find(x => x.id === id); if (!r) return;
  if (!confirm(`Supprimer le ticket de ${r.personne} ?`)) return;
  const { error } = await shAppel('supprimer', { id });
  if (error) { showToast(error.code === 'code' ? shMsgErreur(error) : 'Erreur : ' + error.message); return; }
  SH.rows = SH.rows.filter(x => x.id !== id); renderSouhaits();
}

/* Roomy saute de joie, quelques secondes */
function mimiCelebre(txt, zh) {
  document.querySelectorAll('.mimi-pop').forEach(n => n.remove());
  const d = document.createElement('div');
  d.className = 'mimi-pop'; d.setAttribute('role', 'status');
  d.innerHTML = `${shPoseImg('joie')}<div class="mimi-bubble">${zh ? `<span class="sh-zh">${zh}</span>` : ''}${esc(txt)}</div>`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
window.mimiCelebre = mimiCelebre;

/* ───────────── Branchement sur la navigation ───────────── */
ensureSouhaitsTab();
{
  const _goTab = goTab;
  goTab = function (n, el) {
    _goTab(n, el);
    if (n !== 'souhaits') return;
    document.getElementById('nb-more')?.classList.add('on');
    document.getElementById('nd-souhaits')?.classList.add('active');
    // Le visiteur ne reçoit pas la liste. Pas de temps réel (la table est fermée à la clé publique) : relue à chaque ouverture.
    renderSouhaits(); loadSouhaits();
  };
}

// Au démarrage, puis toutes les 30 s quand l'écran est visible, et au retour dans l'app (pas de temps réel : la table est fermée).
setTimeout(shMajPastille, 2500);
setInterval(shMajPastille, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) shMajPastille(); });

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
#nd-souhaits,#nb-more{position:relative}
.sh-badge{position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:var(--laque,#c0392b);color:#fff;font-size:.56rem;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 0 0 2px var(--bg,#fff)}
#nd-souhaits .sh-badge{top:5px;right:calc(50% - 26px)}
/* ── Roomy, partout ── */
.mimi-img{display:block;width:112px;height:auto;flex:none;filter:drop-shadow(0 8px 10px rgba(31,20,17,.16));user-select:none;-webkit-user-drag:none}
.mimi-img.sm{width:72px}
.mimi-row{display:flex;align-items:flex-end;gap:6px}
.mimi-bubble{position:relative;flex:1;min-width:0;background:#fff;border:1px solid rgba(184,137,58,.55);border-radius:18px 18px 18px 6px;padding:11px 14px;font-size:.84rem;line-height:1.5;color:var(--txt);box-shadow:0 6px 16px rgba(31,20,17,.07),inset 0 0 0 3px #fff,inset 0 0 0 4px rgba(184,137,58,.18);margin-bottom:22px}
.mimi-bubble::before{content:'';position:absolute;left:-7px;bottom:12px;width:12px;height:12px;background:#fff;border-left:1px solid rgba(184,137,58,.55);border-bottom:1px solid rgba(184,137,58,.55);transform:rotate(45deg) skew(8deg,8deg);border-radius:0 0 0 3px}
.mimi-bubble.alerte{border-color:var(--laque);color:var(--laque);font-weight:600}
.mimi-bubble.alerte::before{border-color:var(--laque)}
.mimi-bubble.secoue{animation:shSecoue .38s}
@keyframes shSecoue{20%{transform:translateX(-5px)}45%{transform:translateX(5px)}70%{transform:translateX(-3px)}}
.mimi-av{width:22px;height:22px;border-radius:50%;object-fit:cover;object-position:50% 38%;background:var(--bg);box-shadow:0 0 0 1px rgba(184,137,58,.6);flex:none}
.chat-sender-av.bot-mimi{background:none;width:22px;height:22px}
.mimi-mini{width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:-5px;margin-right:4px;box-shadow:0 0 0 1px rgba(184,137,58,.6)}
.mimi-hello{float:left;width:64px;margin:0 10px 2px 0;filter:drop-shadow(0 6px 8px rgba(31,20,17,.14))}
.mimi-pop{position:fixed;left:50%;bottom:calc(var(--nav) + var(--safe) + 24px);transform:translateX(-50%);z-index:3000;display:flex;align-items:flex-end;gap:2px;max-width:min(420px,calc(100vw - 24px));cursor:pointer;animation:shPop .45s cubic-bezier(.2,1.4,.4,1) both}
.mimi-pop .mimi-img{width:124px}
.mimi-pop .mimi-bubble{margin-bottom:34px;font-weight:600;white-space:nowrap}
.mimi-pop .sh-zh{margin-right:8px}
@keyframes shPop{from{opacity:0;transform:translate(-50%,40px) scale(.7)}to{opacity:1;transform:translate(-50%,0) scale(1)}}

/* accueil, chargement, en-tête */
.login-hero,.loader-hero{width:auto!important;height:auto!important;background:none!important;box-shadow:none!important;border-radius:0!important;animation:floatSoft 4s ease-in-out infinite}
.login-hero .mimi-img,.loader-hero .mimi-img{width:150px;margin:0 auto}
.loader-hero .mimi-img{width:132px}
.hdr-logo-icon{background:none!important;box-shadow:none!important;overflow:visible}
.hdr-logo-icon img{width:42px;height:42px;object-fit:contain;filter:drop-shadow(0 3px 4px rgba(31,20,17,.2))}

/* ── Onglet Souhaits ── */
#tab-souhaits .ph h1::after{content:'愿'}#tab-souhaits .ph::before{content:'望'}
.sh-zh{font:700 .95rem 'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;color:var(--laque);letter-spacing:.12em}
.sh-tuto{position:relative;margin:4px 16px 14px;padding:12px 14px 12px;border-radius:24px;background:var(--p-lattice),linear-gradient(180deg,#fffdf8,#fbf3e2);border:1px solid rgba(184,137,58,.5);box-shadow:var(--shadow-sm),inset 0 0 0 4px #fff,inset 0 0 0 5px rgba(184,137,58,.25)}
.sh-tuto-tag{display:flex;align-items:center;gap:10px;margin:0 0 4px 6px}
.sh-step{font-size:.64rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--txt2)}
.sh-tuto .mimi-row{min-height:132px}
.sh-tuto-bar{display:flex;align-items:center;gap:10px;margin-top:-6px}
.sh-dots{display:flex;gap:6px;flex:1}
.sh-dots i{width:7px;height:7px;border-radius:50%;background:rgba(184,137,58,.35);transition:all .2s}
.sh-dots i.on{width:20px;border-radius:5px;background:var(--laque)}
.sh-lien{background:none;border:none;font:600 .76rem var(--font);color:var(--txt2);padding:8px 6px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.sh-next{background:var(--accent);color:#fff;border:none;border-radius:999px;padding:10px 18px;font:700 .8rem var(--font-title);cursor:pointer;box-shadow:var(--glow)}
.sh-next:active{background:var(--accent-deep);transform:scale(.97)}
.sh-rappel{display:flex;align-items:center;gap:8px;margin:0 16px 12px;padding:5px 14px 5px 6px;border:1px solid rgba(184,137,58,.5);background:#fffdf8;border-radius:999px;font:600 .74rem var(--font);color:var(--txt2);cursor:pointer}
.sh-rappel img{width:28px;height:28px;border-radius:50%;object-fit:cover;object-position:50% 38%;background:var(--bg)}
.sh-add{display:flex;align-items:center;justify-content:center;gap:8px;width:calc(100% - 32px);margin:0 16px 12px;padding:15px;border:none;border-radius:999px;background:var(--accent);color:#fff;font:700 .95rem var(--font-title);cursor:pointer;box-shadow:var(--glow)}
.sh-add .gi{width:20px;height:20px}
.sh-add:active{background:var(--accent-deep);transform:scale(.985)}
.sh-chips{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding:0 16px 8px}
.sh-chip{flex:none;border:1px solid var(--border);background:#fff;color:var(--txt2);border-radius:999px;padding:7px 13px;font:600 .74rem var(--font);cursor:pointer}
.sh-chip.on{background:var(--txt);border-color:var(--txt);color:var(--bg)}
.sh-pers .sh-chip{background:var(--tint-2);border-color:var(--line)}
.sh-pers .sh-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.sh-vide{text-align:center;padding:18px 24px 10px;color:var(--txt2);font-size:.84rem;line-height:1.55}
.sh-vide .mimi-img{margin:0 auto 6px;width:130px}

/* ticket */
.tk{position:relative;display:grid;grid-template-columns:70px 1fr;margin:0 16px 14px;background:#fffdf8;border-radius:16px;border:1px solid rgba(184,137,58,.55);box-shadow:var(--shadow-sm);animation:shEntre .35s ease both}
@keyframes shEntre{from{opacity:0;transform:translateY(8px)}}
.tk::before,.tk::after{content:'';position:absolute;left:63px;width:14px;height:14px;border-radius:50%;background:var(--bg);border:1px solid rgba(184,137,58,.55);z-index:1}
.tk::before{top:-8px;border-top-color:transparent;clip-path:inset(50% 0 0 0)}
.tk::after{bottom:-8px;border-bottom-color:transparent;clip-path:inset(0 0 50% 0)}
.tk-stub{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:linear-gradient(170deg,#b3202a,#8b1d2c);color:#fbf6ec;border-radius:15px 0 0 15px;border-right:2px dashed rgba(240,217,162,.7);padding:10px 4px}
.tk-seal{width:38px;height:38px;display:grid;place-items:center;border-radius:9px;border:1.5px solid var(--or-clair);font:700 1.5rem/1 'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;color:var(--or-clair);transform:rotate(-4deg)}
.tk-n{font:700 .62rem var(--font-title);letter-spacing:.08em;color:var(--or-clair);opacity:.95}
.tk-body{position:relative;padding:12px 14px 10px;min-width:0}
.tk-top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.tk-txt{min-width:0}
.tk-pour{font-size:.6rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--or)}
.tk-who{font:700 1.15rem/1.2 var(--font-title);letter-spacing:-.02em;color:var(--accent-ink);overflow-wrap:anywhere}
.tk-img{flex:none;width:64px;height:64px;object-fit:cover;border-radius:12px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(184,137,58,.55),var(--shadow-sm);cursor:zoom-in;background:var(--sand)}
.tk-want{margin-top:6px;font-size:.88rem;line-height:1.5;color:var(--txt);overflow-wrap:anywhere;white-space:pre-line}
.tk-cadeau{display:flex;align-items:center;gap:10px;margin-top:10px;padding:8px 10px;border-radius:14px;background:rgba(184,137,58,.1);border:1px dashed rgba(184,137,58,.55)}
.tk-cadeau span{display:inline-flex;align-items:center;gap:5px;font:700 .7rem var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--or)}
.tk-cadeau .gi{width:15px;height:15px}
.tk-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(184,137,58,.5);flex-wrap:wrap}
.tk-meta{font-size:.66rem;color:var(--txt3)}
.tk-actions{display:flex;gap:6px;margin-left:auto}
.tk-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);background:#fff;color:var(--txt2);border-radius:999px;padding:6px 11px;font:600 .7rem var(--font);cursor:pointer}
.tk-btn .gi{width:15px;height:15px}
.tk-btn.done{background:var(--green);border-color:var(--green);color:#fff}
.tk-btn.del{padding:6px 8px;color:var(--laque)}
.tk-btn:active{transform:scale(.95)}
.tk.ok .tk-stub{background:linear-gradient(170deg,#9a8a80,#6f625a)}
.tk.ok .tk-who,.tk.ok .tk-want{opacity:.62}
.tk-stamp{position:absolute;right:12px;bottom:46px;transform:rotate(-12deg);padding:2px 10px;border:2.5px solid var(--laque);border-radius:8px;color:var(--laque);font:700 1.25rem 'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;letter-spacing:.08em;opacity:.75;pointer-events:none;background:rgba(255,253,248,.6)}

/* feuille de saisie */
.sh-mimi-top{margin:6px 0 4px;align-items:flex-end}
.sh-mimi-top .mimi-bubble{margin-bottom:14px}
.sh-req,.sh-opt{margin-left:6px;font-size:.6rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.sh-req{color:var(--laque)}.sh-opt{color:var(--txt3)}
.sh-check{display:flex;align-items:center;gap:10px;margin:2px 0 14px;font:600 .84rem var(--font);color:var(--txt);cursor:pointer}
.sh-check input{width:20px;height:20px;accent-color:var(--accent);flex:none}
textarea.form-input{resize:vertical;min-height:84px;line-height:1.45}
.sh-photo-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border:2px dashed var(--border2);border-radius:var(--radius-sm);background:rgba(255,255,255,.7);color:var(--txt2);font:600 .84rem var(--font);cursor:pointer}
.sh-photo-btn .gi{width:20px;height:20px;color:var(--accent)}
.sh-photo-btn[hidden],.sh-photo-prev[hidden]{display:none}
.sh-photo-prev{position:relative;width:132px}
.sh-photo-prev img{display:block;width:132px;height:132px;object-fit:cover;border-radius:16px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(184,137,58,.55),var(--shadow-sm)}
.sh-photo-prev button{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;border:none;background:var(--txt);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow)}
.sh-photo-prev button .gi{width:14px;height:14px}
.sh-zoom{position:fixed;inset:0;z-index:4000;background:rgba(20,10,8,.86);display:flex;align-items:center;justify-content:center;padding:18px;cursor:zoom-out}
.sh-zoom[hidden]{display:none}
.sh-zoom img{max-width:100%;max-height:100%;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
@media (prefers-reduced-motion:reduce){.tk,.mimi-pop,.login-hero,.loader-hero,.mimi-bubble.secoue{animation:none!important}}
</style>`);
