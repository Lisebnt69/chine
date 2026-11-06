/* ═══════════════════════════════════════════════════════════════
   push.js — Notifications push, réservées à Matis et Lise.

   Un téléphone s'abonne depuis Paramètres → Notifications. L'abonnement part dans la fonction `push` (code de l'assistant
   exigé) qui le range dans une table fermée à la clé publique. Ensuite c'est la base qui déclenche :
   un message du chat prévient l'autre, et deux rappels par jour préviennent des transports (veille 19 h, jour même 7 h).

   Un visiteur n'a ni le bouton, ni d'abonnement : à la déconnexion le téléphone se désabonne, quel que soit le compte.
   iPhone : les notifications n'existent que si l'app est ajoutée à l'écran d'accueil (iOS 16.4 minimum).
   ═══════════════════════════════════════════════════════════════ */

const PUSH_URL = SB_URL + '/functions/v1/push';
const pushEl = id => document.getElementById(id);
const pushCodeSilencieux = () => { try { return localStorage.getItem('ia_secret') || ''; } catch (e) { return ''; } };
const pushMarque = (on) => { try { on ? localStorage.setItem('push_on', '1') : localStorage.removeItem('push_on'); } catch (e) { /* ignoré */ } };
const pushEstMarque = () => { try { return localStorage.getItem('push_on') === '1'; } catch (e) { return false; } };

const pushSupporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhone / iPad : le navigateur seul n'a pas le push, il faut l'app ajoutée à l'écran d'accueil.
const pushIosSansApp = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  && !(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));

// Appel de la fonction. `code` : le code de l'assistant (seulement pour les modes qui l'exigent).
async function pushAppel(mode, extra, code) {
  try {
    const headers = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    if (code) headers['x-app-secret'] = code;
    const r = await fetch(PUSH_URL, { method: 'POST', headers, body: JSON.stringify({ mode, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem('ia_secret'); } catch (e) { /* tant pis */ } return { erreur: 'Le code de l\'assistant n\'est pas bon.', code: 'code' }; }
    if (!r.ok) return { ...j, erreur: j.error || 'erreur ' + r.status };
    return j;
  } catch (e) { return { erreur: 'Pas de réseau.', code: 'reseau' }; }
}

function pushCleEnBinaire(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// `ready` ne se résout jamais si le service worker n'est pas enregistré : on abandonne après 4 s plutôt que de bloquer l'écran.
const pushReg = () => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 4000))]);

async function pushAbonnementLocal() {
  if (!pushSupporte()) return null;
  try { const reg = await pushReg(); return reg ? await reg.pushManager.getSubscription() : null; }
  catch (e) { return null; }
}

/* ───────────── Interface (Paramètres) ───────────── */
async function pushRendre() {
  const box = pushEl('pushBlock'); if (!box) return;
  const ligne = (texte, bouton) => {
    box.innerHTML = `<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:8px;">🔔 Notifications</div>
      <div style="font-size:.76rem;color:var(--txt2);line-height:1.5;margin-bottom:${bouton ? '10px' : '0'};">${texte}</div>${bouton || ''}`;
  };
  const btn = (label, fn, secondaire) => `<button class="${secondaire ? 'btn-cancel' : 'btn-primary'}" style="margin-top:0;${secondaire ? 'margin-bottom:6px;' : ''}" onclick="${fn}">${label}</button>`;

  if (!pushSupporte()) { ligne('Ce navigateur ne gère pas les notifications.'); return; }
  if (pushIosSansApp()) { ligne('Sur iPhone, ajoute d\'abord l\'app à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil), puis ouvre-la depuis là.'); return; }
  if (Notification.permission === 'denied') { ligne('Les notifications sont bloquées pour ce site. Réactive-les dans les réglages du téléphone, puis reviens ici.'); return; }

  const sub = await pushAbonnementLocal();
  if (sub && pushEstMarque()) {
    ligne('Activées sur ce téléphone : tu es prévenu·e quand l\'autre écrit dans le chat, et la veille (19 h) et le jour même (7 h) de chaque transport.',
      btn('Envoyer un test', 'pushTester()', true) + btn('Désactiver', 'pushDesactiver()', true));
  } else {
    ligne('Sois prévenu·e quand l\'autre écrit dans le chat, et avant chaque transport. Ça ne concerne que Matis et Lise.', btn('Activer les notifications', 'pushActiver()'));
  }
}

/* ───────────── Actions ───────────── */
async function pushActiver() {
  if (!isEditorMode()) { showToast('Réservé à Matis et Lise'); return; }
  if (!pushSupporte() || pushIosSansApp()) { pushRendre(); return; }

  // La permission d'abord, tout de suite : le navigateur ne l'accorde qu'à un geste de l'utilisateur, et la suite attend le réseau.
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { showToast('Notifications refusées'); pushRendre(); return; }

  const code = iaSecret();
  if (!code) { showToast('Il faut le code de l\'assistant'); return; }

  const k = await pushAppel('cle', {}, code);
  if (!k.key) { showToast(k.code === 'reseau' ? 'Pas de réseau' : 'Notifications pas encore branchées côté serveur'); return; }

  try {
    const reg = await pushReg();
    if (!reg) { showToast('Le mode hors-ligne n\'est pas prêt, recharge l\'app'); return; }
    const cle = pushCleEnBinaire(k.key);
    let sub = await reg.pushManager.getSubscription();
    try {
      sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
    } catch (e) {
      // Un abonnement fait avec une autre clé bloque le nouveau : on repart de zéro.
      if (sub) await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
    }
    const r = await pushAppel('subscribe', { user: currentUser, subscription: sub.toJSON(), appareil: navigator.userAgent }, code);
    if (r.erreur) { showToast('Échec : ' + r.erreur); return; }
    pushMarque(true);
    showToast('🔔 Notifications activées');
    pushRendre();
    pushTester(true);
  } catch (e) {
    console.error(e);
    showToast('Impossible d\'activer : ' + (e && e.message ? e.message : e));
  }
}

async function pushTester(auto) {
  const code = pushCodeSilencieux() || iaSecret();
  if (!code) return;
  const r = await pushAppel('test', { user: currentUser }, code);
  if (r.erreur) { showToast('Test raté : ' + r.erreur); return; }
  if (!r.envoyes && !auto) showToast('Rien envoyé : réactive les notifications');
}

async function pushDesactiver() {
  const sub = await pushAbonnementLocal();
  pushMarque(false);
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (e) { /* ignoré */ }
    const code = pushCodeSilencieux();
    if (code) await pushAppel('unsubscribe', { endpoint }, code);
  }
  showToast('Notifications désactivées');
  pushRendre();
}

// Déconnexion : le téléphone se désabonne quel que soit le compte suivant (un visiteur ne doit rien recevoir de Matis ni de Lise).
// Se désabonner côté navigateur suffit à couper : la base reçoit un 410 au prochain envoi et supprime la ligne.
async function pushQuitter() {
  const sub = await pushAbonnementLocal();
  pushMarque(false);
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) { /* ignoré */ }
  const code = pushCodeSilencieux();
  if (code) await pushAppel('unsubscribe', { endpoint }, code);
}

/* ───────────── Au démarrage ───────────── */
function pushAller(onglet) {
  if (onglet && typeof goTab === 'function') { try { goTab(onglet); } catch (e) { /* onglet absent */ } }
}

async function pushDemarrer() {
  if (!pushSupporte()) return;

  // Touche sur une notif alors que l'app est déjà ouverte : le service worker nous dit où aller.
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'goTab') pushAller(e.data.onglet); });
  // App fermée : elle s'ouvre sur #tab=chat.
  const m = /^#tab=([a-z]+)$/.exec(location.hash);
  if (m && isEditorMode()) { pushAller(m[1]); history.replaceState(null, '', location.pathname + location.search); }

  const sub = await pushAbonnementLocal();
  if (!sub) return;
  // Visiteur ou personne de connecté·e alors que le téléphone est abonné : on coupe (compte changé sans passer par « Changer de compte »).
  if (!isEditorMode()) { await pushQuitter(); return; }
  // Resynchronise en silence : retrouve l'abonnement si la base l'a perdu, et le rattache au bon compte si le téléphone a changé de main.
  const code = pushCodeSilencieux();
  if (code && Notification.permission === 'granted' && pushEstMarque()) {
    pushAppel('subscribe', { user: currentUser, subscription: sub.toJSON(), appareil: navigator.userAgent }, code);
  }
}
