// Cache offline. Réseau d'abord pour la page et les scripts (pour recevoir les mises à jour),
// cache en secours quand il n'y a pas de réseau.
const CACHE_NAME = 'chine-app-v37';
const PLATS_IMGS = ['baijiu','baozi','beibingyang','bieres','bingfen','chadan','chagee','changde','choudoufu','chun','ciba','cybm','dabaitu','danchao','dandan','danhonggao','dazhaxie','duojiao','eggtart','fengzhua','fuqi','gaiwan','ganbian','gongbao','guazi','guiling','guokui','haidilao','heytea','hongshao','hongshu','huangjiu','huiguo','huoguo','icecream','jianbing','jiaozi','jiuniang','kaoya','kfcwrap','kfczhou','koushui','kungfu','laitang','latiao','laziji','liangpi','lizi','luckin','lulu','luosi','maocai','maoxuewang','mapo','mctaro','mcteri','mcwings','mixue','naicha','roujiamo','sandapao','sanxia','shuangpi','shuizhu','sjb','suancaiyu','suanmei','sulafen','sursou','tangcu','tanghua','tanghulu','tastien','wallace','wanglaoji','wanza','xiaochaorou','xiaomian','xlb','yabo','yangrouchuan','yangzhi','youtiao','yuxiang','zhongshui'].map(f => './plats/' + f + '.webp');
const ASSETS = ['./', './index.html', './ia.js', './prog.js', './souhaits.js', './questions.js', './roomy.js','./push.js','./depense.js','./resa.js', './plats.js','./plats-img.js','./accueil.js','./meteo.js','./meteo.json','./visiteur.js','./galerie.js','./mascotte/calme.webp', './mascotte/explique.webp', './mascotte/joie.webp', './mascotte/tete.webp', './icons.js', './fonts/GeneralSans-500.woff2', './fonts/GeneralSans-600.woff2', './fonts/GeneralSans-700.woff2', './cerveau.json', './manifest.webmanifest', './icons-app/icon-192.png', './icons-app/icon-512.png', './icons-app/icon-maskable-512.png', './icons-app/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).then(() => Promise.allSettled(PLATS_IMGS.map(u => cache.add(u))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase / OSM / API : jamais de cache
  if (url.origin !== self.location.origin && !/unpkg|jsdelivr|fonts\.g/.test(url.host)) return;
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {}); }
      return response;
    }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
  );
});

// ── Notifications push (Matis et Lise seulement : seuls eux peuvent s'abonner, voir push.js) ──
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { corps: event.data ? event.data.text() : '' }; }
  event.waitUntil(Promise.all([self.clients.matchAll({ type: 'window' }).then(ws => ws.forEach(w => w.postMessage({ type: 'push-recu', onglet: d.onglet || '' }))), self.registration.showNotification(d.titre || 'Chine 2026', {
    body: d.corps || '',
    tag: d.tag || undefined,          // même tag = la notif précédente est remplacée au lieu de s'empiler
    renotify: !!d.tag,                // mais le téléphone vibre quand même
    icon: './icons-app/icon-192.png',
    badge: './icons-app/icon-192.png',
    data: { onglet: d.onglet || '' },
  })]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const onglet = (event.notification.data && event.notification.data.onglet) || '';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    const w = wins[0];
    if (w) { w.postMessage({ type: 'goTab', onglet }); return w.focus(); }
    return self.clients.openWindow('./index.html' + (onglet ? '#tab=' + onglet : ''));
  }));
});
