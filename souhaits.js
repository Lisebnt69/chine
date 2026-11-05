/* ═══════════════════════════════════════════════════════════════
   souhaits.js — Onglet « Souhaits » (menu Plus) + la mascotte Roomy

   Souhaits : une liste de tickets « telle personne veut telle chose ».
     - ouvert au mode visiteur : c'est le seul endroit où il peut écrire
     - une personne ET un souhait obligatoires, une photo facultative
     - Matis et Lise cochent « trouvé » ; chacun peut supprimer ses propres tickets
   Roomy : la chatte mascotte. Elle explique l'onglet aux visiteurs (mini tuto)
     et elle est l'assistante IA du chat : c'est à elle qu'on parle.

   Table : public.souhaits (supabase/migrations/20261105010000_souhaits.sql)
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
const SH = { rows: [], charge: false, erreur: '', filtre: 'attente', pers: '', occupe: false, image: '', etape: 0 };
const SH_TUTO = [
  { pose: 'explique', zh: '欢迎', txt: "Bienvenue ! Moi, c'est <b>Roomy</b>. Ici, on note ce que vos proches aimeraient qu'on leur rapporte de Chine. Un souhait = un ticket." },
  { pose: 'explique', num: 1, txt: "<b>Pour qui ?</b> Dis-moi la personne : un prénom suffit. Maman, Julien, Mamie…" },
  { pose: 'explique', num: 2, txt: "<b>Qu'est-ce qu'elle veut ?</b> Du thé, un éventail, un t-shirt… Plus tu es précis (taille, couleur), mieux Matis et Lise chercheront." },
  { pose: 'calme', num: 3, txt: "<b>Une photo ?</b> C'est facultatif. Si tu as un modèle en tête, montre-le-moi. Sinon, ce n'est pas grave." },
  { pose: 'joie', zh: '太好了', txt: "Et voilà ! Ton ticket rejoint la liste. Matis et Lise le cocheront quand ils l'auront trouvé." },
];

const shLire = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } };
const shEcrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : tant pis */ } };
const shMesIds = () => { try { return JSON.parse(shLire('souhaits_mes', '[]')); } catch (e) { return []; } };
const shPoseImg = (pose, cls) => `<img class="${cls || 'mimi-img'}" src="${MIMI.img[pose] || MIMI.img.calme}" alt="${MIMI.nom}, la chatte mascotte" draggable="false">`;

SH.etape = shLire('souhaits_tuto', '') === '1' ? SH_TUTO.length : 0; // déjà vu sur cet appareil : on n'affiche que le rappel

/* ───────────── Données ───────────── */
async function loadSouhaits() {
  if (typeof sb === 'undefined' || !sb) return;
  const { data, error } = await sb.from('souhaits').select('*').order('created_at', { ascending: false });
  if (error) {
    SH.erreur = /souhaits|PGRST205|42P01/.test((error.code || '') + ' ' + (error.message || '')) ? 'table' : (error.message || 'erreur');
  } else { SH.rows = data || []; SH.erreur = ''; }
  SH.charge = true;
  renderSouhaits();
}

let shAbonne = false;
function shAbonner() {
  if (shAbonne || typeof sb === 'undefined' || !sb) return;
  shAbonne = true;
  try { sb.channel('rt-souhaits').on('postgres_changes', { event: '*', schema: 'public', table: 'souhaits' }, () => loadSouhaits()).subscribe(); }
  catch (e) { shAbonne = false; }
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
      <div class="sheet-title">Nouveau ticket</div>
      <div class="form-group"><label class="form-label" for="shWho">Pour qui ? <span class="sh-req">obligatoire</span></label>
        <input class="form-input" id="shWho" maxlength="40" autocomplete="off" list="shPersonnes" placeholder="Maman, Julien, Mamie…">
        <datalist id="shPersonnes"></datalist></div>
      <div class="form-group"><label class="form-label" for="shEnvie">Qu'est-ce qu'elle veut ? <span class="sh-req">obligatoire</span></label>
        <textarea class="form-input" id="shEnvie" rows="3" maxlength="300" placeholder="Du thé au jasmin, un éventail rouge, un t-shirt taille M…"></textarea></div>
      <div class="form-group"><label class="form-label">Photo <span class="sh-opt">facultatif</span></label>
        <input type="file" id="shFile" accept="image/*" hidden>
        <button class="sh-photo-btn" id="shPhotoBtn" type="button" data-act="photo">${ic('camera')}<span>Ajouter une photo</span></button>
        <div class="sh-photo-prev" id="shPrev" hidden><img id="shPrevImg" alt="Aperçu de la photo"><button type="button" data-act="retirer-photo" aria-label="Retirer la photo">${ic('x')}</button></div>
      </div>
      <button class="btn-primary" id="shSend" type="button" data-act="envoyer">Créer le ticket</button>
      <button class="btn-cancel" type="button" data-act="fermer">Annuler</button>
      <div style="height:4px;"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', shClic);
  ov.querySelector('#shFile').addEventListener('change', shPhotoChoisie);
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
    case 'photo': document.getElementById('shFile').click(); break;
    case 'retirer-photo': shRetirerPhoto(); break;
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
  const rows = SH.rows;
  const nbOk = rows.filter(r => r.trouve).length;
  const sub = document.getElementById('shSub');
  if (sub) sub.textContent = rows.length ? `${rows.length} ticket${rows.length > 1 ? 's' : ''} · ${nbOk} trouvé${nbOk > 1 ? 's' : ''}` : "Ce qu'on rapporte de Chine";

  const liste = document.getElementById('shListe'), fil = document.getElementById('shFiltres');
  if (SH.erreur) {
    fil.innerHTML = '';
    liste.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>${SH.erreur === 'table'
      ? (isEditorMode() ? "La liste n'est pas encore branchée. Lancer <b>supabase/migrations/20261105010000_souhaits.sql</b> dans Supabase (SQL Editor)." : "La liste dort encore. Reviens un peu plus tard !")
      : 'Je n\'arrive pas à lire la liste pour le moment.'}</p></div>`;
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
  const mes = new Set(shMesIds()), editeur = isEditorMode();
  liste.innerHTML = vis.map(r => {
    const n = String(numero.get(r.id) || 0).padStart(2, '0');
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    const de = r.auteur === 'matis' ? 'Matis' : r.auteur === 'lise' ? 'Lise' : 'un visiteur';
    const peutSuppr = editeur || mes.has(r.id);
    return `<article class="tk${r.trouve ? ' ok' : ''}">
      <div class="tk-stub"><span class="tk-seal">愿</span><span class="tk-n">N° ${n}</span></div>
      <div class="tk-body">
        <div class="tk-top">
          <div class="tk-txt"><div class="tk-pour">pour</div><div class="tk-who">${esc(r.personne)}</div></div>
          ${/^data:image\/(jpeg|png|webp);base64,/.test(r.image || '') ? `<img class="tk-img" src="${esc(r.image)}" alt="Photo du souhait de ${esc(r.personne)}" data-act="zoom" loading="lazy">` : ''}
        </div>
        <div class="tk-want">${esc(r.envie)}</div>
        <div class="tk-foot">
          <span class="tk-meta">${esc(date)} · ajouté par ${de}</span>
          <span class="tk-actions">
            ${editeur ? `<button type="button" class="tk-btn${r.trouve ? ' done' : ''}" data-act="trouve" data-id="${esc(r.id)}">${ic('check-circle')}<span>${r.trouve ? 'Trouvé' : 'Marquer trouvé'}</span></button>` : ''}
            ${peutSuppr ? `<button type="button" class="tk-btn del" data-act="suppr" data-id="${esc(r.id)}" aria-label="Supprimer ce ticket">${ic('trash')}</button>` : ''}
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
function shOuvrirFormulaire() {
  document.getElementById('shWho').value = '';
  document.getElementById('shEnvie').value = '';
  shRetirerPhoto();
  shBulle("Pour qui ? Et qu'est-ce qu'on lui rapporte ?", false);
  document.getElementById('shPersonnes').innerHTML = [...new Set(SH.rows.map(r => r.personne.trim()))].map(p => `<option value="${esc(p)}">`).join('');
  document.getElementById('shSend').disabled = false;
  openOverlay('sh-overlay');
  setTimeout(() => document.getElementById('shWho').focus(), 250);
}
function shBulle(txt, alerte) {
  const b = document.getElementById('shFormBulle'); if (!b) return;
  b.textContent = txt; b.classList.toggle('alerte', !!alerte);
  if (alerte) { b.classList.remove('secoue'); void b.offsetWidth; b.classList.add('secoue'); }
}
function shRetirerPhoto() {
  SH.image = '';
  const f = document.getElementById('shFile'); if (f) f.value = '';
  const p = document.getElementById('shPrev'), btn = document.getElementById('shPhotoBtn');
  if (p) p.hidden = true; if (btn) btn.hidden = false;
}
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
async function shPhotoChoisie(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    SH.image = await shReduire(f);
    document.getElementById('shPrevImg').src = SH.image;
    document.getElementById('shPrev').hidden = false;
    document.getElementById('shPhotoBtn').hidden = true;
  } catch (err) { shRetirerPhoto(); shBulle("Cette photo ne s'ouvre pas. Essaie-en une autre, ou continue sans.", true); }
}

async function shEnvoyer() {
  if (SH.occupe) return;
  const personne = document.getElementById('shWho').value.trim().replace(/\s+/g, ' ');
  const envie = document.getElementById('shEnvie').value.trim();
  if (!personne && !envie) { shBulle("Il me faut une personne et son souhait.", true); document.getElementById('shWho').focus(); return; }
  if (!personne) { shBulle("Pour qui est ce ticket ? Un prénom suffit.", true); document.getElementById('shWho').focus(); return; }
  if (!envie) { shBulle(`Et qu'est-ce que ${personne} veut ?`, true); document.getElementById('shEnvie').focus(); return; }
  if (typeof sb === 'undefined' || !sb) { shBulle("Je ne suis pas connectée pour le moment.", true); return; }

  SH.occupe = true; const btn = document.getElementById('shSend'); btn.disabled = true; btn.textContent = 'Je note…';
  try {
    const ligne = { personne, envie, image: SH.image || null, auteur: currentUser || 'visiteur' };
    const { data, error } = await sb.from('souhaits').insert(ligne).select().single();
    if (error) {
      shBulle(/souhaits|PGRST205|42P01/.test((error.code || '') + ' ' + (error.message || '')) ? "La liste n'est pas encore prête. Réessaie plus tard." : "Aïe, ça n'a pas marché : " + error.message, true);
      return;
    }
    SH.rows = [data, ...SH.rows.filter(r => r.id !== data.id)]; SH.erreur = ''; SH.charge = true;
    shEcrire('souhaits_mes', JSON.stringify([data.id, ...shMesIds()].slice(0, 200)));
    SH.filtre = 'attente'; SH.pers = '';
    closeOverlay('sh-overlay'); renderSouhaits();
    mimiCelebre(`Noté pour ${personne} !`, '太好了');
  } catch (err) {
    shBulle("Je n'arrive pas à joindre la liste. Vérifie ta connexion.", true);
  } finally { SH.occupe = false; btn.disabled = false; btn.textContent = 'Créer le ticket'; }
}

async function shBasculer(id) {
  if (!isEditorMode()) { showToast('Réservé à Matis et Lise'); return; }
  const r = SH.rows.find(x => x.id === id); if (!r) return;
  const val = !r.trouve;
  const { error } = await sb.from('souhaits').update({ trouve: val }).eq('id', id);
  if (error) { showToast('Erreur : ' + error.message); return; }
  r.trouve = val; renderSouhaits();
  if (val) mimiCelebre(`Trouvé pour ${r.personne} !`, '到手');
}
async function shSupprimer(id) {
  const r = SH.rows.find(x => x.id === id); if (!r) return;
  if (!(isEditorMode() || shMesIds().includes(id))) return;
  if (!confirm(`Supprimer le ticket de ${r.personne} ?`)) return;
  const { error } = await sb.from('souhaits').delete().eq('id', id);
  if (error) { showToast('Erreur : ' + error.message); return; }
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
    shAbonner(); renderSouhaits(); loadSouhaits();
  };
}

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
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
