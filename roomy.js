/* ═══════════════════════════════════════════════════════════════
   roomy.js — Onglet « Roomy » : les conversations de Matis et Lise avec Roomy, rangées comme sur Claude.

   - Plusieurs conversations, une par thème. Roomy donne un titre après le premier échange ; on peut renommer et
     supprimer. La liste est triée par date (Aujourd'hui, Hier, 7 derniers jours, Plus ancien).
   - Matis et Lise partagent les mêmes conversations : chaque message dit qui parle, et chacun voit ce que
     l'autre a écrit (relecture toutes les 3 s tant qu'un fil est ouvert).
   - « Stop » : le bouton carré, ou le mot « stop » (« arrête », « ça suffit »…) envoyé à Roomy. Elle coupe sa
     réflexion en cours et ne modifie plus rien dans l'app ; ce qu'elle avait déjà changé reste changé, et elle le dit.
   - Aucune lecture possible pour un visiteur : les conversations sont dans des tables fermées à la clé publique
     (supabase/migrations/20261105070000_roomy_conversations.sql), lues et écrites uniquement par la fonction
     `assistant` (mode « roomy »), protégée par le code de l'assistant que seuls Matis et Lise ont. L'onglet n'existe
     même pas côté visiteur.

   Remplace Roomy dans le chat commun : @roomy et les puces « Demander à Roomy » ouvrent maintenant une conversation ici.
   Chargé APRÈS questions.js (réutilise la mascotte, les styles de souhaits.js et l'icône de icons.js).
   ═══════════════════════════════════════════════════════════════ */

const RM = {
  liste: [], charge: false, erreur: '', q: '',
  vue: 'liste',            // 'liste' | 'fil'
  cur: '', titre: '', msgs: [], derniere: '',
  enCours: false,          // Roomy est en train de répondre (vu par le serveur, donc aussi par l'autre personne)
  envoi: false,            // ma requête d'envoi est en vol
  arret: false,            // j'ai demandé l'arrêt, j'attends que Roomy s'arrête
  sonde: false, chargeListe: false, tFil: null, tListe: null, demarre: false,
};
// Même motif que la fonction (index.ts, RE_STOP) : un message qui ne contient que « stop ».
const RM_STOP = /^\s*(?:@?roomy[\s,]+)?(?:stop(?:pe)?|arr[êe]te(?:[\s-]*toi)?|annule|[çc]a suffit|tais[\s-]*toi)(?:[\s,]+roomy)?\s*[.!]*\s*$/i;
const RM_SUGGESTIONS = [
  ['Cet aprem ?', "Qu'est-ce qu'on fait cet aprem ? Propose 3 options depuis le cerveau."],
  ['Optimiser demain', 'Optimise le planning de demain (ordre et heures) et applique-le.'],
  ['Pas encore casés', 'Quels reels du cerveau ne sont pas encore dans le planning ? Classe-les par ville.'],
];
const RM_SVG_STOP = '<svg class="rm-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/></svg>';
const RM_SVG_RETOUR = '<svg class="rm-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>';

const rmEl = id => document.getElementById(id);
const rmCourt = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const rmQui = k => k === 'matis' ? 'Matis' : k === 'lise' ? 'Lise' : MIMI.nom;
const rmHeure = iso => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const rmCodeSilencieux = () => { try { return localStorage.getItem('ia_secret') || ''; } catch (e) { return ''; } };
const rmSurOnglet = () => !!rmEl('tab-roomy')?.classList.contains('on');

/* ───────────── Accès à la fonction ───────────── */
// Retourne le JSON de la fonction, ou { erreur, code, status }. `silencieux` : jamais de fenêtre de saisie du code
// (relectures de fond). Les messages ne sont jamais gardés sur le téléphone : tout est relu en base.
async function rmAppel(action, extra, silencieux) {
  const code = silencieux ? rmCodeSilencieux() : iaSecret();
  if (!code) return { erreur: 'code', code: 'code' };
  try {
    const r = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'x-app-secret': code },
      body: JSON.stringify({ mode: 'roomy', action, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem('ia_secret'); } catch (e) { /* tant pis */ } return { erreur: 'code', code: 'code', status: 401 }; }
    if (!r.ok) return { ...j, erreur: j.error || 'erreur ' + r.status, status: r.status };
    return j;
  } catch (e) { return { erreur: 'réseau', code: 'reseau' }; }
}

function rmMessageErreur(j) {
  if (j.code === 'code') return 'Le code de l\'assistant manque ou n\'est pas bon.';
  if (j.code === 'reseau') return 'Pas de réseau. Roomy en a besoin.';
  if (j.code === 'table') return 'Les conversations ne sont pas encore branchées dans la base (migration à lancer).';
  if (j.code === 'ancienne_version') return j.erreur;
  return j.erreur || 'Erreur';
}

/* ───────────── Onglet et tiroir ───────────── */
function rmEnsureTab() {
  if (rmEl('tab-roomy')) return;
  const main = rmEl('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-roomy';
  tab.innerHTML = '<div id="rmCorps"></div>';
  main.appendChild(tab);
  tab.addEventListener('click', rmClic);
  tab.addEventListener('input', e => {
    if (e.target.id === 'rmInp') { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }
    if (e.target.id === 'rmQ') { RM.q = e.target.value; rmRendreRangees(); }
  });
  tab.addEventListener('keydown', e => {
    if (e.target.id === 'rmInp' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); RM.enCours && !RM_STOP.test(e.target.value) ? showToast("Roomy répond encore. Dis « stop » pour l'arrêter.") : rmEnvoyer(); }
    if (e.target.classList?.contains('rm-row') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rmOuvrir(e.target.dataset.id); }
  });

  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !rmEl('nd-roomy')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-roomy'; b.type = 'button';
    b.onclick = () => { goTab('roomy', rmEl('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic"><img class="rm-tiroir-av" src="${MIMI.tete}" alt=""></span><span class="nav-drawer-lbl">Roomy</span>`;
    grid.insertBefore(b, grid.firstChild);
  }
  rmMontrer('liste');
}

function rmClic(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'nouvelle': rmNouvelle(); break;
    case 'ouvrir': rmOuvrir(id); break;
    case 'retour': rmRetour(); break;
    case 'renommer': rmRenommer(id || RM.cur); break;
    case 'supprimer': rmSupprimer(id || RM.cur); break;
    case 'envoyer': RM.enCours ? rmStop() : rmEnvoyer(); break;
    case 'stop': rmStop(); break;
    case 'suggestion': rmEnvoyer(el.dataset.q); break;
    case 'recharger': rmChargerListe(); break;
    case 'code': iaSecret(true); rmChargerListe(); break;
  }
}

/* ───────────── Écrans ───────────── */
// Le squelette de chaque écran est posé une fois ; ensuite on ne met à jour que les morceaux qui changent
// (la saisie et le focus du clavier ne sautent jamais pendant une relecture).
function rmMontrer(vue) {
  const corps = rmEl('rmCorps'); if (!corps) return;
  RM.vue = vue;
  rmEl('tab-roomy')?.classList.toggle('rm-fil-on', vue === 'fil');
  if (vue === 'liste') {
    corps.innerHTML = `
      <div class="ph rm-ph"><div class="rm-ph-t"><img class="rm-ph-av" src="${MIMI.tete}" alt=""><div><h1>Roomy</h1><p id="rmSub"></p></div></div></div>
      <div class="rm-liste-haut">
        <button class="btn-primary rm-nouv" type="button" data-act="nouvelle">${ic('plus')}<span>Nouvelle conversation</span></button>
        <div class="rm-rech" id="rmRech" hidden>${ic('search')}<input class="form-input" id="rmQ" type="search" placeholder="Chercher une conversation" autocomplete="off" value="${esc(RM.q)}"></div>
      </div>
      <div id="rmRangees"></div>`;
    rmRendreRangees();
  } else {
    corps.innerHTML = `
      <div class="rm-fil">
        <div class="rm-bar">
          <button class="rm-ib" type="button" data-act="retour" aria-label="Retour aux conversations">${RM_SVG_RETOUR}</button>
          <button class="rm-bar-titre" type="button" data-act="renommer" id="rmTitre" title="Renommer"></button>
          <button class="rm-ib" type="button" data-act="supprimer" aria-label="Supprimer la conversation">${ic('trash')}</button>
        </div>
        <div class="rm-msgs" id="rmMsgs"></div>
        <div class="rm-compo">
          <textarea class="rm-inp" id="rmInp" rows="1" maxlength="4000" placeholder="Écris à Roomy…  (dis « stop » pour l'arrêter)"></textarea>
          <button class="rm-send" id="rmSend" type="button" data-act="envoyer" aria-label="Envoyer">${ic('arrow-up')}</button>
        </div>
      </div>`;
    rmRendreFil(true);
  }
}

/* ── Liste ── */
function rmGroupe(iso) {
  const jour = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((jour(new Date()) - jour(new Date(iso))) / 86400000);
  return diff <= 0 ? "Aujourd'hui" : diff === 1 ? 'Hier' : diff <= 7 ? '7 derniers jours' : 'Plus ancien';
}
function rmDateCourte(iso) {
  const d = new Date(iso);
  return rmGroupe(iso) === "Aujourd'hui" ? rmHeure(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function rmRendreRangees() {
  const zone = rmEl('rmRangees'); if (!zone) return;
  const sub = rmEl('rmSub'), rech = rmEl('rmRech');
  if (sub) sub.textContent = RM.liste.length ? `${RM.liste.length} conversation${RM.liste.length > 1 ? 's' : ''}, partagées entre Matis et Lise` : 'Une conversation par thème';
  if (rech) rech.hidden = RM.liste.length < 5;
  if (!RM.charge) { zone.innerHTML = '<div class="rm-vide">Chargement…</div>'; return; }
  if (RM.erreur) {
    const code = RM.erreur === 'code';
    zone.innerHTML = `<div class="rm-vide rm-vide-err">${esc(code ? 'Le code de l\'assistant est nécessaire pour ouvrir les conversations.' : RM.erreur)}
      <button class="prog-btn" type="button" data-act="${code ? 'code' : 'recharger'}">${code ? 'Saisir le code' : 'Réessayer'}</button></div>`;
    return;
  }
  const q = RM.q.trim().toLowerCase();
  const lignes = RM.liste.filter(c => !q || (c.titre + ' ' + (c.apercu || '')).toLowerCase().includes(q));
  if (!lignes.length) {
    zone.innerHTML = `<div class="rm-vide">${RM.liste.length ? 'Aucune conversation ne correspond.' : 'Pas encore de conversation. Lance-en une : Roomy range chaque thème à part.'}</div>`;
    return;
  }
  let html = '', groupe = '';
  for (const c of lignes) {
    const g = rmGroupe(c.updated_at);
    if (g !== groupe) { groupe = g; html += `<div class="rm-groupe">${esc(g)}</div>`; }
    html += `
      <div class="rm-row" role="button" tabindex="0" data-act="ouvrir" data-id="${esc(c.id)}">
        <div class="rm-row-main">
          <div class="rm-row-t">${esc(c.titre)}</div>
          <div class="rm-row-s">${c.en_cours ? '<span class="rm-pouls"></span>Roomy répond…' : esc(rmCourt(String(c.apercu || '').replace(/[*_`#>]/g, ''), 90)) || '&nbsp;'}</div>
        </div>
        <div class="rm-row-d">${esc(rmDateCourte(c.updated_at))}</div>
        <button class="rm-ib sm" type="button" data-act="renommer" data-id="${esc(c.id)}" aria-label="Renommer">${ic('pencil')}</button>
        <button class="rm-ib sm" type="button" data-act="supprimer" data-id="${esc(c.id)}" aria-label="Supprimer">${ic('trash')}</button>
      </div>`;
  }
  zone.innerHTML = html;
}

async function rmChargerListe(silencieux) {
  if (!isEditorMode() || RM.chargeListe) return;
  RM.chargeListe = true;
  const j = await rmAppel('lister', {}, silencieux);
  RM.chargeListe = false;
  if (j.erreur) {
    if (silencieux && j.code === 'code') return;
    RM.erreur = j.code === 'code' ? 'code' : rmMessageErreur(j);
  } else { RM.liste = j.rows || []; RM.erreur = ''; }
  RM.charge = true;
  if (RM.vue === 'liste') rmRendreRangees();
}

/* ── Fil ── */
function rmBulle(m) {
  const t = rmHeure(m.created_at);
  if (m.role === 'user') {
    const moi = m.auteur === currentUser;
    return `<div class="rm-m ${moi ? 'moi' : 'autre'}">${moi ? '' : `<span class="rm-qui">${esc(rmQui(m.auteur))}</span>`}<div class="rm-b">${esc(m.content).replace(/\n/g, '<br>')}</div><span class="rm-h">${esc(t)}</span></div>`;
  }
  const ch = (m.changes || []).length
    ? `<div class="rm-ch">${m.changes.map(c => `<span>${esc(String(c).replace(/^[^\p{L}\p{N}]+/u, ''))}</span>`).join('')}</div>` : '';
  const etat = m.statut === 'arrete' ? ' arrete' : m.statut === 'erreur' ? ' erreur' : '';
  return `<div class="rm-m roomy${etat}"><img class="mimi-av" src="${MIMI.tete}" alt=""><div class="rm-col"><div class="rm-b">${mdIA(m.content)}</div>${ch}<span class="rm-h">${esc(t)}</span></div></div>`;
}

function rmVideFil() {
  return `<div class="rm-accueil">
    <div class="mimi-row">${shPoseImg('explique')}<div class="mimi-bubble">Je suis là ! Dis-moi ce que tu cherches : une idée pour cet aprem, un planning à changer, un resto, une dépense à noter. Chaque conversation reste à part, et Lise et Matis la voient toutes les deux.</div></div>
    <div class="rm-sugs">${RM_SUGGESTIONS.map(([l, q]) => `<button class="sh-chip" type="button" data-act="suggestion" data-q="${esc(q)}">${esc(l)}</button>`).join('')}</div>
  </div>`;
}

function rmRendreFil(forcerBas) {
  const zone = rmEl('rmMsgs'); if (!zone) return;
  const bas = forcerBas || zone.scrollHeight - zone.scrollTop - zone.clientHeight < 90;
  const titre = rmEl('rmTitre'); if (titre) titre.textContent = RM.cur ? RM.titre : 'Nouvelle conversation';
  let html = RM.msgs.length ? RM.msgs.map(rmBulle).join('') : rmVideFil();
  if (RM.enCours) {
    html += `<div class="rm-m roomy"><img class="mimi-av" src="${MIMI.tete}" alt=""><div class="rm-col"><div class="rm-b rm-attente">${RM.arret ? 'Roomy s\'arrête…' : 'Roomy réfléchit…'}
      ${RM.arret ? '' : '<button class="rm-stop-lien" type="button" data-act="stop">Arrêter</button>'}</div></div></div>`;
  }
  zone.innerHTML = html;
  const send = rmEl('rmSend');
  if (send) {
    send.classList.toggle('stop', RM.enCours);
    send.setAttribute('aria-label', RM.enCours ? 'Arrêter Roomy' : 'Envoyer');
    send.innerHTML = RM.enCours ? RM_SVG_STOP : ic('arrow-up');
    send.disabled = RM.arret;
  }
  if (bas) zone.scrollTop = zone.scrollHeight;
}

// Fusionne des messages du serveur dans le fil : sans doublon, et le message provisoire (affiché dès l'envoi)
// est remplacé par le vrai.
function rmFusion(nouveaux) {
  for (const m of nouveaux || []) {
    if (RM.msgs.some(x => x.id === m.id)) continue;
    if (m.role === 'user') {
      const i = RM.msgs.findIndex(x => String(x.id).startsWith('tmp_') && x.content === m.content && x.auteur === m.auteur);
      if (i >= 0) RM.msgs.splice(i, 1);
    }
    RM.msgs.push(m);
  }
  const vrais = RM.msgs.filter(x => !String(x.id).startsWith('tmp_'))
    .sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  const provisoires = RM.msgs.filter(x => String(x.id).startsWith('tmp_'));
  RM.msgs = [...vrais, ...provisoires];
  if (vrais.length) RM.derniere = vrais[vrais.length - 1].created_at;
}

function rmMajConversation(c) {
  if (!c) return;
  if (c.id === RM.cur) RM.titre = c.titre;
  const i = RM.liste.findIndex(x => x.id === c.id);
  if (i >= 0) RM.liste[i] = { ...RM.liste[i], ...c }; else RM.liste.unshift(c);
  RM.liste.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

/* ── Ouvrir, créer, quitter ── */
function rmNouvelle() {
  rmArreterSonde();
  Object.assign(RM, { cur: '', titre: '', msgs: [], derniere: '', enCours: false, envoi: false, arret: false });
  rmMontrer('fil');
  setTimeout(() => rmEl('rmInp')?.focus(), 60);
}

async function rmOuvrir(id) {
  if (!id) return;
  Object.assign(RM, { cur: id, titre: RM.liste.find(c => c.id === id)?.titre || '', msgs: [], derniere: '', enCours: false, envoi: false, arret: false });
  rmMontrer('fil');
  const zone = rmEl('rmMsgs'); if (zone) zone.innerHTML = '<div class="rm-vide">Chargement…</div>';
  const j = await rmAppel('ouvrir', { id });
  if (RM.cur !== id) return;
  if (j.erreur) {
    if (j.code === 'absente') { showToast('Cette conversation n\'existe plus'); RM.liste = RM.liste.filter(c => c.id !== id); rmRetour(); return; }
    if (zone) zone.innerHTML = `<div class="rm-vide rm-vide-err">${esc(rmMessageErreur(j))}<button class="prog-btn" type="button" data-act="retour">Retour</button></div>`;
    return;
  }
  RM.titre = j.conversation.titre; RM.enCours = !!j.conversation.en_cours;
  rmFusion(j.messages);
  rmRendreFil(true);
  rmDemarrerSonde();
  setTimeout(() => rmEl('rmInp')?.focus(), 60);
}

function rmRetour() {
  rmArreterSonde();
  Object.assign(RM, { cur: '', titre: '', msgs: [], derniere: '', enCours: false, envoi: false, arret: false });
  rmMontrer('liste');
  rmChargerListe(true);
}

/* ── Relecture (l'autre personne écrit, ou Roomy a fini pendant que l'app dormait) ── */
function rmDemarrerSonde() { rmArreterSonde(); RM.tFil = setInterval(rmSonder, 3000); }
function rmArreterSonde() { if (RM.tFil) { clearInterval(RM.tFil); RM.tFil = null; } }

async function rmSonder() {
  if (RM.vue !== 'fil' || !RM.cur || RM.sonde || document.visibilityState !== 'visible' || !rmSurOnglet() || !isEditorMode()) return;
  const id = RM.cur;
  RM.sonde = true;
  const j = await rmAppel('ouvrir', { id, apres: RM.derniere || undefined }, true);
  RM.sonde = false;
  if (RM.cur !== id) return;
  if (j.erreur) {
    if (j.code === 'absente') { showToast('Cette conversation a été supprimée'); RM.liste = RM.liste.filter(c => c.id !== id); rmRetour(); }
    return;
  }
  const avant = RM.msgs.length, titreAvant = RM.titre, etatAvant = RM.enCours;
  rmFusion(j.messages);
  RM.titre = j.conversation.titre;
  RM.enCours = !!j.conversation.en_cours || RM.envoi;
  if (!RM.enCours) RM.arret = false;
  // Un message provisoire que le serveur n'a jamais reçu (réseau coupé pendant l'envoi) : on le rend pour le renvoyer.
  const perdu = RM.msgs.find(x => String(x.id).startsWith('tmp_') && !RM.envoi && !j.conversation.en_cours && Date.now() - Date.parse(x.created_at) > 25000);
  if (perdu) {
    RM.msgs = RM.msgs.filter(x => x !== perdu);
    const inp = rmEl('rmInp'); if (inp && !inp.value) inp.value = perdu.content;
    showToast('Ton message n\'est pas parti. Renvoie-le.');
  }
  if (RM.msgs.length !== avant || RM.titre !== titreAvant || RM.enCours !== etatAvant || perdu) rmRendreFil(false);
  rmMajConversation(j.conversation);
}

/* ── Envoyer, arrêter ── */
async function rmEnvoyer(forcer) {
  const inp = rmEl('rmInp');
  const t = String(forcer ?? inp?.value ?? '').trim();
  if (!t || !isEditorMode()) return;
  const stop = RM_STOP.test(t);
  if (RM.enCours && !stop) { showToast('Roomy répond encore. Dis « stop » pour l\'arrêter.'); return; }
  if (RM.envoi && !stop) return;
  if (forcer === undefined && inp) { inp.value = ''; inp.style.height = ''; }

  if (!RM.cur) {   // première phrase : la conversation naît ici, avec le début du message pour titre provisoire
    const n = await rmAppel('nouvelle', { texte: t, qui: currentUser });
    if (n.erreur) { showToast(rmMessageErreur(n)); if (inp && forcer === undefined) inp.value = t; return; }
    RM.cur = n.conversation.id; RM.titre = n.conversation.titre; RM.derniere = '';
    rmMajConversation(n.conversation);
    rmDemarrerSonde();
  }
  const id = RM.cur;
  RM.msgs.push({ id: 'tmp_' + Date.now(), role: 'user', auteur: currentUser, content: t, created_at: new Date().toISOString() });
  if (!stop) { RM.enCours = true; RM.envoi = true; }
  rmRendreFil(true);

  const j = await rmAppel('envoyer', { id, texte: t, qui: currentUser });
  if (!stop) RM.envoi = false;
  if (RM.cur !== id) return;           // on a changé de conversation pendant l'attente : la relecture rattrapera
  if (j.conversation === null) { rmRetour(); return; }
  if (j.messages) rmFusion(j.messages);
  if (j.conversation) rmMajConversation(j.conversation);
  if (j.erreur && !j.messages) {
    if (j.code === 'occupee') { RM.msgs = RM.msgs.filter(x => !String(x.id).startsWith('tmp_')); RM.enCours = true; showToast(j.erreur); }
    else if (j.code === 'absente') { showToast('Cette conversation n\'existe plus'); rmRetour(); return; }
    else if (j.status && j.status < 500 && j.status !== 429) {   // refus net (code, message trop long…) : rien n'est parti
      RM.msgs = RM.msgs.filter(x => !String(x.id).startsWith('tmp_')); RM.enCours = false;
      if (inp && !inp.value) inp.value = t;
      showToast(rmMessageErreur(j));
    }
    // sinon (réseau, délai dépassé) : la réponse a peut-être été écrite quand même, la relecture le dira
  } else if (!stop || !j.arrete) { RM.enCours = false; RM.arret = false; }   // « stop » d'une réponse en cours : c'est elle qui conclut
  rmRendreFil(true);
  if (!j.erreur && j.changes?.length) showToast('Roomy : ' + j.changes.slice(0, 3).join(' · '));
}

async function rmStop() {
  if (!RM.cur || !RM.enCours || RM.arret) return;
  RM.arret = true; rmRendreFil(true);
  const j = await rmAppel('stop', { id: RM.cur });
  if (j.erreur) { RM.arret = false; rmRendreFil(false); showToast(rmMessageErreur(j)); return; }
  if (!j.etait_en_cours) { RM.enCours = false; RM.arret = false; rmRendreFil(false); }
  // Sinon la réponse en cours revient sous une seconde ou deux avec « J'arrête là », ou la relecture la ramène.
}

/* ── Renommer, supprimer ── */
function rmRenommer(id) {
  if (!id) return;
  const c = RM.liste.find(x => x.id === id) || (id === RM.cur ? { id, titre: RM.titre } : null); if (!c) return;
  rmEl('rm-sheet')?.remove();
  const sh = document.createElement('div');
  sh.className = 'overlay on'; sh.id = 'rm-sheet';
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Renommer la conversation</div>
    <input class="form-input" id="rmNom" maxlength="80" value="${esc(c.titre)}" autocomplete="off">
    <button class="btn-primary" id="rmNomOk" type="button">Enregistrer</button></div>`;
  document.body.appendChild(sh);
  const champ = rmEl('rmNom');
  const valider = async () => {
    const titre = champ.value.trim(); if (!titre) return;
    rmEl('rmNomOk').disabled = true;
    const j = await rmAppel('renommer', { id, titre });
    sh.remove();
    if (j.erreur) { showToast(rmMessageErreur(j)); return; }
    rmMajConversation(j.conversation);
    if (RM.vue === 'liste') rmRendreRangees(); else rmRendreFil(false);
  };
  rmEl('rmNomOk').onclick = valider;
  champ.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); valider(); } };
  setTimeout(() => { champ.focus(); champ.select(); }, 60);
}

async function rmSupprimer(id) {
  if (!id) return;
  const titre = RM.liste.find(x => x.id === id)?.titre || RM.titre || 'cette conversation';
  if (!confirm(`Supprimer « ${titre} » ?\nMatis et Lise ne la retrouveront plus.`)) return;
  const j = await rmAppel('supprimer', { id });
  if (j.erreur) { showToast(rmMessageErreur(j)); return; }
  RM.liste = RM.liste.filter(c => c.id !== id);
  if (RM.cur === id) rmRetour(); else rmRendreRangees();
  showToast('Conversation supprimée');
}

/* ───────────── Entrées depuis le reste de l'app ───────────── */
// Les puces « Demander à Roomy », « Cet aprem ? »… et « @roomy » du chat commun ouvrent une conversation ici :
// le chat commun (chat_messages) est lisible avec la clé publique, les conversations de Roomy ne le sont plus.
function rmDemander(question) {
  if (!isEditorMode()) { showToast('Roomy est réservée à Matis et Lise'); return; }
  goTab('roomy', rmEl('nb-more'));
  rmNouvelle();
  if (question) rmEnvoyer(question);
}
window.rmDemander = rmDemander;

askIA = function (q) { rmDemander(q); };

{
  const _sendChat = sendChat;
  sendChat = async function () {
    const inp = rmEl('chatInp');
    const text = (inp?.value || '').trim();
    if (!IA_TRIGGER.test(text)) return _sendChat();
    inp.value = ''; inp.style.height = '';
    rmDemander(text.replace(IA_TRIGGER, '').trim());
  };
}

{
  const _goTab = goTab;
  goTab = function (n, el) {
    if (n === 'roomy' && !isEditorMode()) { showToast('Roomy est réservée à Matis et Lise'); return; }
    _goTab(n, el);
    if (n !== 'roomy') { rmArreterSonde(); clearInterval(RM.tListe); RM.tListe = null; return; }
    rmEl('nb-more')?.classList.add('on');
    rmEl('nd-roomy')?.classList.add('active');
    if (RM.vue === 'fil' && RM.cur) { rmSonder(); rmDemarrerSonde(); }
    else { rmChargerListe(); clearInterval(RM.tListe); RM.tListe = setInterval(() => { if (RM.vue === 'liste' && rmSurOnglet() && document.visibilityState === 'visible') rmChargerListe(true); }, 15000); }
  };
}
// Retour dans l'app (téléphone sorti de veille) : on relit tout de suite.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && rmSurOnglet()) { RM.vue === 'fil' ? rmSonder() : rmChargerListe(true); } });

// Le chat commun n'est plus le lieu de Roomy.
{
  const inp = rmEl('chatInp');
  if (inp) inp.placeholder = 'Message… (@roomy ouvre une conversation avec Roomy)';
}

rmEnsureTab();

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
.reader-mode #nd-roomy,.reader-mode #tab-roomy{display:none!important}
#tab-roomy.rm-fil-on.on::after{display:none}
.rm-tiroir-av{width:30px;height:30px;border-radius:50%;object-fit:cover;object-position:50% 38%;box-shadow:0 0 0 1px rgba(184,137,58,.6)}
.rm-svg{width:20px;height:20px;display:block}
.rm-ph-t{display:flex;align-items:center;gap:12px}
.rm-ph-t h1{line-height:1.1}.rm-ph-t p{font-size:.78rem;color:var(--txt2);margin-top:2px}
.rm-ph-av{width:46px;height:46px;border-radius:50%;object-fit:cover;object-position:50% 38%;box-shadow:0 0 0 1px rgba(184,137,58,.6);background:var(--bg);flex:none}
.rm-liste-haut{padding:0 16px 6px}
.rm-nouv{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:0}
.rm-nouv .gi{width:18px;height:18px}
.rm-rech{position:relative;margin-top:10px}
.rm-rech[hidden]{display:none}
.rm-rech .gi{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--txt3);pointer-events:none}
.rm-rech .form-input{padding-left:38px;border-radius:999px}
.rm-groupe{font:700 .72rem var(--font);color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;padding:16px 18px 6px}
.rm-row{display:flex;align-items:center;gap:6px;margin:0 12px 4px;padding:11px 8px 11px 12px;border-radius:14px;cursor:pointer;color:var(--txt)}
.rm-row:active,.rm-row:focus-visible{background:var(--sand);outline:none}
.rm-row-main{flex:1;min-width:0}
.rm-row-t{font-weight:600;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rm-row-s{font-size:.74rem;color:var(--txt2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rm-row-d{font-size:.68rem;color:var(--txt3);flex:none}
.rm-pouls{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:6px;animation:rmPouls 1.2s ease-in-out infinite}
@keyframes rmPouls{50%{opacity:.25}}
.rm-ib{flex:none;width:40px;height:40px;border:none;background:transparent;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--txt2);cursor:pointer}
.rm-ib:active{background:var(--sand)}
.rm-ib.sm{width:34px;height:34px;color:var(--txt3)}
.rm-ib .gi{width:18px;height:18px}.rm-ib.sm .gi{width:16px;height:16px}
.rm-vide{padding:30px 24px;text-align:center;font-size:.84rem;color:var(--txt2);line-height:1.5}
.rm-vide-err{color:var(--laque)}
.rm-vide .prog-btn{display:block;margin:12px auto 0}
.rm-fil{display:flex;flex-direction:column;height:calc(100svh - var(--hdr) - 70px - var(--nav) - var(--safe))}
.rm-bar{display:flex;align-items:center;gap:2px;padding:6px 8px;border-bottom:1px solid var(--border);background:rgba(251,246,236,.92);flex:none}
.rm-bar-titre{flex:1;min-width:0;border:none;background:transparent;font:700 .98rem var(--font-title,var(--font));color:var(--txt);text-align:left;padding:8px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.rm-msgs{flex:1;min-height:0;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:10px}
.rm-m{display:flex;flex-direction:column;max-width:86%}
.rm-m.moi{align-self:flex-end;align-items:flex-end}
.rm-m.autre{align-self:flex-start}
.rm-m.roomy{align-self:flex-start;flex-direction:row;gap:7px;align-items:flex-end;max-width:94%}
.rm-m.roomy .mimi-av{width:28px;height:28px;margin-bottom:16px}
.rm-col{min-width:0;display:flex;flex-direction:column}
.rm-qui{font:600 .64rem var(--font);color:var(--txt2);margin:0 4px 3px}
.rm-b{padding:9px 13px;font-size:.86rem;line-height:1.5;overflow-wrap:anywhere}
.rm-m.moi .rm-b{background:var(--accent);color:#fff;border-radius:18px 18px 6px 18px}
.rm-m.autre .rm-b{background:#fff;border:1px solid var(--border);border-radius:18px 18px 18px 6px;box-shadow:var(--shadow-sm)}
.rm-m.roomy .rm-b{background:#fff;border:1px solid rgba(184,137,58,.55);border-radius:18px 18px 18px 6px;box-shadow:var(--shadow-sm)}
.rm-m.roomy.arrete .rm-b{background:var(--sand);border-style:dashed;color:var(--txt2)}
.rm-m.roomy.erreur .rm-b{border-color:var(--laque);color:var(--laque)}
.rm-m.roomy .rm-b p{margin:0}.rm-m.roomy .rm-b p+p{margin-top:6px}
.rm-m.roomy .rm-b ul,.rm-m.roomy .rm-b ol{margin:4px 0 0;padding-left:18px}
.rm-m.roomy .md strong{color:inherit}
.rm-m.roomy .md h3,.rm-m.roomy .md h4,.rm-m.roomy .md h5,.rm-m.roomy .md h6{color:var(--accent-ink,var(--accent))}
.rm-m.roomy .md a{color:var(--accent)}
.rm-m.roomy .md code{background:var(--sand)}
.rm-m.roomy .md pre{background:var(--sand);color:var(--txt)}
.rm-m.roomy .md blockquote{border-left-color:var(--or,var(--gold))}
.rm-m.roomy .md hr{border-top-color:var(--border)}
.rm-h{font-size:.6rem;color:var(--txt3);margin:3px 4px 0}
.rm-ch{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.rm-ch span{font-size:.66rem;background:var(--sand);border-radius:8px;padding:3px 8px;color:var(--txt2)}
.rm-attente{color:var(--txt2);font-style:italic;display:flex;align-items:center;gap:10px;animation:rmPouls 1.4s ease-in-out infinite}
.rm-stop-lien{border:1px solid var(--border2);background:#fff;border-radius:999px;padding:4px 11px;font:600 .72rem var(--font);color:var(--accent);cursor:pointer;font-style:normal}
.rm-accueil{margin:auto 0;padding:6px 2px}
.rm-accueil .mimi-bubble{margin-bottom:12px}
.rm-sugs{display:flex;flex-wrap:wrap;gap:6px;padding-left:6px}
.rm-compo{display:flex;align-items:flex-end;gap:8px;padding:8px 12px calc(10px + 0px);border-top:1px solid var(--border);background:rgba(251,246,236,.95);flex:none}
.rm-inp{flex:1;min-height:42px;max-height:120px;resize:none;border:1.5px solid var(--border);border-radius:22px;padding:10px 15px;font:.88rem/1.4 var(--font);color:var(--txt);background:#fff}
.rm-inp:focus{outline:none;border-color:var(--accent)}
.rm-send{flex:none;width:42px;height:42px;border:none;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
.rm-send .gi{width:20px;height:20px}
.rm-send.stop{background:var(--txt)}
.rm-send:disabled{opacity:.5}
@media (prefers-reduced-motion:reduce){.rm-pouls,.rm-attente{animation:none}}
</style>`);
