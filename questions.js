/* ═══════════════════════════════════════════════════════════════
   questions.js — Onglet « Questions » (menu Plus) : les visiteurs parlent à Roomy,
   Matis et Lise relisent tout.

   Visiteur : il pose ses questions à Roomy (Sonnet 5.5, effort medium, via la fonction `assistant`
     en mode "visiteur"). Les échanges sont rangés par DISCUSSION : il garde la même, en rouvre une
     ancienne ou en lance une nouvelle. Ses discussions restent sur son appareil (localStorage).
     Roomy ne parle que des hôtels, des horaires de train et d'avion et des activités « peut-être ».
     Jamais d'argent, jamais ce qui a déjà été fait : c'est la fonction qui l'impose (voir index.ts).
   Matis et Lise : ils voient toutes les discussions des visiteurs, question et réponse de Roomy,
     avec un repère « nouveau » ; ouvrir une discussion la marque comme lue. La table est fermée à la clé
     publique : ils la lisent par la fonction `assistant`, avec le code de l'assistant (relecture toutes les 45 s).

   Table : public.questions_visiteurs (supabase/migrations/20261105020000_questions_visiteurs.sql)
   Chargé APRÈS souhaits.js (réutilise Roomy et ses styles).
   ═══════════════════════════════════════════════════════════════ */

const QV_MAX = 500;            // même plafond que la fonction
const QV_MAX_DISC = 30;        // discussions gardées sur l'appareil du visiteur
const QV_MAX_FIL = 40;         // messages gardés par discussion

const QV = {
  // visiteur
  disc: [], cur: '', occupe: false,
  // Matis et Lise
  rows: [], charge: false, erreur: '', ouverte: '', nonLus: new Set(), vues: new Set(), demarre: false, enCours: false,
};

const qvLire = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } };
const qvEcrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : tant pis */ } };
const qvEl = id => document.getElementById(id);

function qvUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function qvClientId() {
  let c = qvLire('qv_client', '');
  if (c.length < 8) { c = qvUuid(); qvEcrire('qv_client', c); }
  return c;
}
function qvCharger() {
  try { const l = JSON.parse(qvLire('qv_disc', '[]')); QV.disc = Array.isArray(l) ? l : []; } catch (e) { QV.disc = []; }
  QV.disc.sort((a, b) => (b.maj || 0) - (a.maj || 0));
}
function qvSauver() {
  QV.disc = QV.disc.sort((a, b) => (b.maj || 0) - (a.maj || 0)).slice(0, QV_MAX_DISC);
  QV.disc.forEach(d => { d.fil = (d.fil || []).slice(-QV_MAX_FIL); });
  qvEcrire('qv_disc', JSON.stringify(QV.disc));
}

const qvDate = iso => iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const qvCourt = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/* ───────────── Onglet et tiroir ───────────── */
function qvEnsureTab() {
  if (qvEl('tab-questions')) return;
  const main = qvEl('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-questions';
  tab.innerHTML = `<div class="ph"><h1>Questions</h1><p id="qvSub">Demande à Roomy</p></div><div id="qvCorps"></div>`;
  main.appendChild(tab);
  tab.addEventListener('click', qvClic);
  tab.addEventListener('input', e => { if (e.target.id === 'qvQ') qvCompteur(); });
  tab.addEventListener('keydown', e => { if (e.target.id === 'qvQ' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); qvEnvoyer(); } });

  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !qvEl('nd-questions')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-questions'; b.type = 'button';
    b.onclick = () => { goTab('questions', qvEl('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic">${ic('help')}</span><span class="nav-drawer-lbl">Questions</span><span class="qv-badge" id="qvBadge" hidden></span>`;
    grid.appendChild(b);
  }
}

function qvClic(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'envoyer': qvEnvoyer(); break;
    case 'nouvelle': qvNouvelle(); break;
    case 'ouvrir': QV.cur = id; qvRendre(); qvVersLeBas(); break;
    case 'ouvrir-disc': qvOuvrirDisc(id); break;
    case 'retour': QV.ouverte = ''; qvRendre(); break;
    case 'recharger': qvChargerBase(false); break;
    case 'suppr-disc': qvSupprimerDisc(id); break;
  }
}

function qvRendre() {
  const tab = qvEl('tab-questions'); if (!tab) return;
  if (isEditorMode()) qvRendreEditeur(); else qvRendreVisiteur();
}

/* ═══════════════ Côté visiteur ═══════════════ */
function qvNouvelle() {
  if (QV.occupe) return;
  QV.cur = qvUuid();
  qvRendre();
  setTimeout(() => qvEl('qvQ')?.focus(), 50);
}
function qvVersLeBas() { setTimeout(() => qvEl('qvCompo')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60); }
function qvCompteur() {
  const q = qvEl('qvQ'), c = qvEl('qvCpt'); if (q && c) c.textContent = `${q.value.length} / ${QV_MAX}`;
}
function qvBulle(txt, alerte) {
  const b = qvEl('qvBulle'); if (!b) return;
  b.textContent = txt; b.classList.toggle('alerte', !!alerte);
  if (alerte) { b.classList.remove('secoue'); void b.offsetWidth; b.classList.add('secoue'); }
}

function qvRendreVisiteur() {
  const corps = qvEl('qvCorps'), sub = qvEl('qvSub'); if (!corps) return;
  if (!QV.cur) QV.cur = QV.disc[0]?.id || qvUuid();     // on reprend la dernière discussion, sinon on en ouvre une
  const d = QV.disc.find(x => x.id === QV.cur);
  const fil = d ? d.fil : [];
  const pseudo = qvLire('qv_pseudo', '');
  const aSaisir = qvEl('qvQ')?.value || '';
  if (sub) sub.textContent = QV.disc.length ? `${QV.disc.length} discussion${QV.disc.length > 1 ? 's' : ''}` : 'Demande à Roomy';

  const chips = `<div class="sh-chips qv-disc">
      <button class="sh-chip qv-new${!d ? ' on' : ''}" type="button" data-act="nouvelle">${ic('plus')}<span>Nouvelle</span></button>
      ${QV.disc.map(x => `<button class="sh-chip${x.id === QV.cur ? ' on' : ''}" type="button" data-act="ouvrir" data-id="${esc(x.id)}" title="${esc(x.titre)}">${esc(qvCourt(x.titre, 26))}</button>`).join('')}
    </div>`;

  const bulles = fil.map(m => `
    <div class="qv-msg moi"><div class="qv-b">${esc(m.q)}</div></div>
    ${m.r ? `<div class="qv-msg mimi"><img class="mimi-av" src="${MIMI.tete}" alt=""><div class="qv-b">${mdIA(m.r)}</div></div>`
      : `<div class="qv-msg mimi"><img class="mimi-av" src="${MIMI.tete}" alt=""><div class="qv-b qv-attente">Roomy réfléchit…</div></div>`}`).join('');

  corps.innerHTML = `
    <div class="mimi-row qv-intro">
      ${shPoseImg('explique')}
      <div class="mimi-bubble" id="qvBulle">${d ? 'Je t\'écoute. Tu peux continuer cette discussion, en rouvrir une autre ou en lancer une nouvelle.'
        : 'Pose-moi ta question ! Je connais les hôtels, les horaires de train et d\'avion, et ce qu\'ils feront peut-être. Pour l\'argent et pour ce qu\'ils ont déjà fait, je ne dis rien.'}</div>
    </div>
    <p class="qv-note">${ic('eye')}<span>Matis et Lise lisent les questions posées ici.</span></p>
    ${chips}
    ${bulles ? `<div class="qv-fil" aria-live="polite">${bulles}</div>` : ''}
    <div class="qv-compo" id="qvCompo">
      <input class="form-input" id="qvPseudo" maxlength="40" autocomplete="given-name" placeholder="Ton prénom (facultatif)" value="${esc(pseudo)}">
      <textarea class="form-input" id="qvQ" rows="3" maxlength="${QV_MAX}" placeholder="Ta question pour Roomy…">${esc(aSaisir)}</textarea>
      <div class="qv-pied"><span class="qv-cpt" id="qvCpt">0 / ${QV_MAX}</span></div>
      <button class="btn-primary" type="button" data-act="envoyer" ${QV.occupe ? 'disabled' : ''}>${QV.occupe ? 'Roomy réfléchit…' : 'Demander à Roomy'}</button>
    </div>`;
  qvCompteur();
}

async function qvEnvoyer() {
  if (QV.occupe) return;
  const champ = qvEl('qvQ'); if (!champ) return;
  const question = champ.value.trim();
  if (!question) { qvBulle('Écris d\'abord ta question.', true); champ.focus(); return; }
  if (question.length > QV_MAX) { qvBulle(`Ta question est trop longue (${QV_MAX} caractères au maximum).`, true); return; }
  const pseudo = (qvEl('qvPseudo')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  qvEcrire('qv_pseudo', pseudo);

  let d = QV.disc.find(x => x.id === QV.cur);
  const nouvelle = !d;
  if (!d) { d = { id: QV.cur, titre: qvCourt(question, 60), maj: Date.now(), fil: [] }; QV.disc.unshift(d); }
  const msg = { q: question, r: null, t: Date.now() };
  d.fil.push(msg); d.maj = Date.now();
  QV.occupe = true; champ.value = '';
  qvRendre(); qvVersLeBas();

  let echec = '';
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      body: JSON.stringify({ mode: 'visiteur', question, pseudo, client_id: qvClientId(), discussion: d.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.reply) msg.r = j.reply;
    else echec = j.error || `Roomy ne répond pas pour le moment (erreur ${r.status}).`;
  } catch (e) {
    echec = 'Je n\'arrive pas à joindre Roomy. Vérifie ta connexion.';
  }

  QV.occupe = false;
  if (echec) {
    // La question n'est pas perdue : on la remet dans le champ pour la renvoyer.
    d.fil = d.fil.filter(m => m !== msg);
    if (nouvelle && !d.fil.length) { QV.disc = QV.disc.filter(x => x !== d); }
    qvSauver(); qvRendre();
    const c2 = qvEl('qvQ'); if (c2) { c2.value = question; qvCompteur(); }
    qvBulle(echec, true);
    return;
  }
  qvSauver(); qvRendre(); qvVersLeBas();
}

/* ═══════════════ Côté Matis et Lise ═══════════════ */
// La table est FERMÉE à la clé publique (elle contient ce que des visiteurs ont écrit) : tout passe par la
// fonction `assistant`, avec le code de l'assistant (celui du chat @ia). `silencieux` : en tâche de fond on
// n'ouvre jamais la fenêtre du code, on utilise seulement celui déjà saisi sur cet appareil.
async function qvAppel(action, extra, silencieux) {
  const code = silencieux ? qvLire('ia_secret', '') : iaSecret();
  if (!code) return { erreur: 'code' };
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': code },
      body: JSON.stringify({ mode: 'questions', action, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem('ia_secret'); } catch (e) { /* tant pis */ } return { erreur: 'code' }; }
    if (!r.ok) return { erreur: j.code === 'table' ? 'table' : (j.error || 'erreur ' + r.status) };
    return j;
  } catch (e) { return { erreur: 'réseau' }; }
}

async function qvChargerBase(silencieux) {
  if (!isEditorMode() || (silencieux && QV.enCours)) return;   // une relecture de fond n'en double jamais une autre ; l'ouverture de l'onglet passe toujours
  QV.enCours = true;
  const j = await qvAppel('lister', {}, silencieux);
  QV.enCours = false;
  if (j.erreur) {
    if (silencieux && j.erreur === 'code') return;      // pas de code saisi : on attend que Matis ou Lise ouvre l'onglet
    QV.erreur = j.erreur;
  } else {
    const avant = new Set(QV.rows.map(r => r.id));
    QV.rows = j.rows || []; QV.erreur = '';
    QV.nonLus = new Set(QV.rows.filter(r => !r.lu).map(r => r.id));
    if (QV.charge && !qvEl('tab-questions')?.classList.contains('on') && QV.rows.some(r => !r.lu && !avant.has(r.id))) {
      showToast('Nouvelle question d\'un visiteur');
    }
  }
  QV.charge = true;
  qvMajBadge();
  if (qvEl('tab-questions')?.classList.contains('on')) qvRendre();
}

// À la connexion de Matis ou Lise : on charge, puis on relit toutes les 45 s pour repérer les nouvelles questions.
function qvDemarrer() {
  if (QV.demarre || !isEditorMode()) return;
  QV.demarre = true;
  qvChargerBase(true);
  setInterval(() => { if (isEditorMode() && document.visibilityState === 'visible') qvChargerBase(true); }, 45000);
}

function qvMajBadge() {
  const n = isEditorMode() ? QV.nonLus.size : 0;
  const b = qvEl('qvBadge');
  if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); }
  qvEl('nb-more')?.classList.toggle('qv-new', n > 0);
}

// Les lignes, regroupées par discussion, de la plus récente à la plus ancienne.
function qvDiscussions() {
  const m = new Map();
  for (const r of QV.rows) {
    if (!m.has(r.discussion_id)) m.set(r.discussion_id, { id: r.discussion_id, lignes: [] });
    m.get(r.discussion_id).lignes.push(r);
  }
  return [...m.values()].map(d => ({
    ...d,
    pseudo: (d.lignes.find(r => r.pseudo) || {}).pseudo || '',
    derniere: d.lignes[d.lignes.length - 1].created_at,
    nouvelles: d.lignes.filter(r => QV.nonLus.has(r.id)).length,
  })).sort((a, b) => String(b.derniere).localeCompare(String(a.derniere)));
}

function qvRendreEditeur() {
  const corps = qvEl('qvCorps'), sub = qvEl('qvSub'); if (!corps) return;
  if (QV.erreur) {
    if (sub) sub.textContent = 'Questions des visiteurs';
    const msg = QV.erreur === 'code' ? "Il me faut le code de l'assistant (le même que pour <b>@ia</b>) pour lire les questions."
      : QV.erreur === 'table' ? "La boîte à questions n'est pas encore branchée. Lancer <b>supabase/migrations/20261105020000_questions_visiteurs.sql</b> dans Supabase (SQL Editor), puis redéployer la fonction <b>assistant</b>."
      : "Je n'arrive pas à lire les questions pour le moment (" + esc(QV.erreur) + ").";
    corps.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>${msg}</p><button class="sh-chip on" type="button" data-act="recharger">${QV.erreur === 'code' ? 'Entrer le code' : 'Réessayer'}</button></div>`;
    return;
  }
  if (!QV.charge) { if (sub) sub.textContent = 'Questions des visiteurs'; corps.innerHTML = '<div class="sh-vide"><p>Je cherche les questions…</p></div>'; return; }
  const ds = qvDiscussions();
  if (QV.ouverte && !ds.some(d => d.id === QV.ouverte)) QV.ouverte = '';
  if (QV.ouverte) { qvRendreFil(ds.find(d => d.id === QV.ouverte)); return; }

  const nbNouv = QV.nonLus.size;
  if (sub) sub.textContent = ds.length ? `${ds.length} discussion${ds.length > 1 ? 's' : ''} · ${nbNouv ? nbNouv + ' nouvelle' + (nbNouv > 1 ? 's' : '') : 'tout est lu'}` : 'Questions des visiteurs';
  if (!ds.length) {
    corps.innerHTML = `<div class="sh-vide">${shPoseImg('calme')}<p>Aucune question pour l'instant.<br>Quand un visiteur parlera à Roomy, ça apparaîtra ici.</p></div>`;
    return;
  }
  corps.innerHTML = ds.map(d => {
    const q1 = d.lignes[0].question;
    const sansRep = d.lignes.some(r => !r.reponse && r.erreur);
    return `<button class="qv-carte${d.nouvelles ? ' neuf' : ''}" type="button" data-act="ouvrir-disc" data-id="${esc(d.id)}">
      <span class="qv-carte-top"><b>${esc(d.pseudo || 'Un visiteur')}</b><span>${esc(qvDate(d.derniere))}</span></span>
      <span class="qv-carte-q">${esc(qvCourt(q1, 110))}</span>
      <span class="qv-carte-pied">
        <span>${d.lignes.length} question${d.lignes.length > 1 ? 's' : ''}</span>
        ${d.nouvelles ? `<span class="qv-tag">${d.nouvelles} nouvelle${d.nouvelles > 1 ? 's' : ''}</span>` : ''}
        ${sansRep ? '<span class="qv-tag alerte">sans réponse</span>' : ''}
      </span></button>`;
  }).join('');
}

function qvRendreFil(d) {
  const corps = qvEl('qvCorps'), sub = qvEl('qvSub');
  if (sub) sub.textContent = `${d.pseudo || 'Un visiteur'} · ${d.lignes.length} question${d.lignes.length > 1 ? 's' : ''}`;
  corps.innerHTML = `
    <div class="qv-barre">
      <button class="sh-chip" type="button" data-act="retour">← Toutes les discussions</button>
      <button class="tk-btn del" type="button" data-act="suppr-disc" data-id="${esc(d.id)}" aria-label="Supprimer cette discussion">${ic('trash')}</button>
    </div>
    <div class="qv-fil">${d.lignes.map(r => `
      <div class="qv-msg moi${QV.vues.has(r.id) ? ' neuf' : ''}">
        <div class="qv-b">${esc(r.question)}<span class="qv-heure">${esc(qvDate(r.created_at))}</span></div>
      </div>
      <div class="qv-msg mimi"><img class="mimi-av" src="${MIMI.tete}" alt="">
        <div class="qv-b">${r.reponse ? mdIA(r.reponse) : r.erreur ? '<i>Roomy n\'a pas pu répondre.</i>' : '<i>Roomy réfléchit…</i>'}
          ${r.filtree ? '<span class="qv-flag">Sa réponse parlait d\'argent : elle a été remplacée par un refus.</span>' : ''}
          ${r.erreur ? `<span class="qv-flag">${esc(qvCourt(r.erreur, 160))}</span>` : ''}
        </div></div>`).join('')}</div>`;
}

async function qvOuvrirDisc(id) {
  QV.ouverte = id;
  QV.vues = new Set([...QV.nonLus]);                 // « nouveau » reste visible pendant la lecture
  qvRendre();
  const ids = QV.rows.filter(r => r.discussion_id === id && !r.lu).map(r => r.id);
  if (!ids.length) return;
  const j = await qvAppel('lu', { ids });
  if (j.erreur) { showToast('Erreur : ' + j.erreur); return; }
  QV.rows.forEach(r => { if (ids.includes(r.id)) r.lu = true; });
  ids.forEach(i => QV.nonLus.delete(i));
  qvMajBadge();
}

async function qvSupprimerDisc(id) {
  if (!isEditorMode()) return;
  if (!confirm('Supprimer cette discussion et toutes ses questions ?')) return;
  const j = await qvAppel('supprimer', { discussion: id });
  if (j.erreur) { showToast('Erreur : ' + j.erreur); return; }
  QV.rows = QV.rows.filter(r => r.discussion_id !== id);
  QV.nonLus = new Set(QV.rows.filter(r => !r.lu).map(r => r.id));
  QV.ouverte = ''; qvMajBadge(); qvRendre();
}

/* ───────────── Branchement sur l'app : DÉBRANCHÉ ─────────────
   L'IA est réservée à Matis et Lise : plus d'onglet Questions, pour personne. Le code reste en place,
   sans bouton ni onglet. Pour le rétablir, voir le commit 8a8fc68. */

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
#tab-questions .ph h1::after{content:'问'}#tab-questions .ph::before{content:'答'}
.qv-intro{margin:0 16px 0;min-height:132px}
.qv-note{display:flex;align-items:center;gap:7px;margin:-10px 16px 12px;font-size:.72rem;color:var(--txt2)}
.qv-note .gi{width:15px;height:15px;color:var(--or);flex:none}
.qv-disc .sh-chip{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qv-disc .qv-new{display:inline-flex;align-items:center;gap:5px}
.qv-disc .qv-new .gi{width:14px;height:14px}
.qv-fil{display:flex;flex-direction:column;gap:8px;margin:4px 16px 14px}
.qv-msg{display:flex;align-items:flex-end;gap:7px;max-width:100%}
.qv-msg.moi{justify-content:flex-end}
.qv-msg.mimi .mimi-av{width:28px;height:28px;margin-bottom:2px}
.qv-b{max-width:84%;padding:9px 13px;font-size:.84rem;line-height:1.5;overflow-wrap:anywhere;white-space:pre-line}
.qv-msg.moi .qv-b{background:var(--accent);color:#fff;border-radius:18px 18px 6px 18px}
.qv-msg.mimi .qv-b{background:#fff;color:var(--txt);border:1px solid rgba(184,137,58,.55);border-radius:18px 18px 18px 6px;box-shadow:var(--shadow-sm);white-space:normal}
.qv-msg.mimi .qv-b p{margin:0}.qv-msg.mimi .qv-b p+p{margin-top:6px}
.qv-msg.mimi .qv-b ul,.qv-msg.mimi .qv-b ol{margin:4px 0 0;padding-left:18px}
.qv-attente{color:var(--txt2);font-style:italic;animation:qvPulse 1.3s ease-in-out infinite}
@keyframes qvPulse{50%{opacity:.45}}
.qv-heure{display:block;margin-top:3px;font-size:.62rem;opacity:.75}
.qv-msg.moi.neuf .qv-b{box-shadow:0 0 0 2px var(--or-clair),0 0 0 3px var(--or)}
.qv-flag{display:block;margin-top:6px;padding:5px 9px;border-radius:9px;background:rgba(139,29,44,.08);color:var(--laque);font-size:.68rem;font-weight:600;line-height:1.4}
.qv-compo{display:flex;flex-direction:column;gap:8px;margin:0 16px 16px}
.qv-compo .btn-primary{margin-top:2px}
.qv-compo .btn-primary:disabled{opacity:.6}
.qv-pied{display:flex;justify-content:flex-end;margin-top:-4px}
.qv-cpt{font-size:.66rem;color:var(--txt3)}
.qv-barre{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 16px 10px}
.qv-carte{display:flex;flex-direction:column;gap:5px;width:calc(100% - 32px);margin:0 16px 10px;padding:12px 14px;text-align:left;background:#fffdf8;border:1px solid rgba(184,137,58,.55);border-radius:16px;box-shadow:var(--shadow-sm);font-family:var(--font);cursor:pointer;color:var(--txt)}
.qv-carte:active{transform:scale(.99)}
.qv-carte.neuf{border-color:var(--laque);box-shadow:var(--shadow-sm),inset 4px 0 0 var(--laque)}
.qv-carte-top{display:flex;justify-content:space-between;gap:8px;font-size:.72rem;color:var(--txt3)}
.qv-carte-top b{font:700 .9rem var(--font-title);color:var(--accent-ink)}
.qv-carte-q{font-size:.84rem;line-height:1.45;overflow-wrap:anywhere}
.qv-carte-pied{display:flex;align-items:center;gap:8px;font-size:.68rem;color:var(--txt2);flex-wrap:wrap}
.qv-tag{padding:2px 9px;border-radius:999px;background:var(--laque);color:#fff;font-weight:700;font-size:.64rem}
.qv-tag.alerte{background:var(--or);color:var(--txt)}
.nav-drawer-btn#nd-questions{position:relative}
.qv-badge{position:absolute;top:5px;right:5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--laque);color:#fff;font:700 .62rem/18px var(--font);text-align:center}
.qv-badge[hidden]{display:none}
#nb-more.qv-new .nic{position:relative}
#nb-more.qv-new .nic::after{content:'';position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:var(--or);border:2px solid #fff}
@media (prefers-reduced-motion:reduce){.qv-attente{animation:none}}
</style>`);
