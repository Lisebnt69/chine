/* =========================================================
   MAP / GPS / NAVIGATION
   Version clean avec support des transports sur la carte
   ========================================================= */

let mapInst = null;
let mapReady = false;
let mapMarkersLayer = null;
let mapTransportLayer = null;
let meMarker = null;
let meCircle = null;
let watchId = null;
let myPos = null;

/* =========================================================
   HELPERS
   ========================================================= */

function safeNum(v){
  if(v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function escMap(s){
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hasValidCoords(lat, lng){
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function buildColorIcon(bg = '#e85d5d', emoji = '📍'){
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        width:38px;
        height:38px;
        border-radius:14px;
        background:${bg};
        color:#fff;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:18px;
        box-shadow:0 10px 24px rgba(0,0,0,.18);
        border:2px solid rgba(255,255,255,.85);
      ">${emoji}</div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -10]
  });
}

function buildMeIcon(){
  return L.divIcon({
    className: 'custom-map-me',
    html: `
      <div style="
        width:20px;
        height:20px;
        border-radius:999px;
        background:#3b82f6;
        border:3px solid #fff;
        box-shadow:0 0 0 6px rgba(59,130,246,.18), 0 8px 20px rgba(0,0,0,.18);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function getItemTypeColor(type){
  switch(type){
    case 'activite': return '#7c3aed';
    case 'restaurant': return '#ea580c';
    case 'cafe': return '#0891b2';
    case 'hotel': return '#e85d5d';
    case 'transport': return '#16a34a';
    default: return '#64748b';
  }
}

function getItemTypeEmoji(type){
  switch(type){
    case 'activite': return '🎯';
    case 'restaurant': return '🍜';
    case 'cafe': return '☕';
    case 'hotel': return '🏨';
    case 'transport': return '🚌';
    default: return '📍';
  }
}

function getTransportPoint(item, side){
  const nts = item?.notes || '';

  if(side === 'dep'){
    return {
      label: (item?.dep_addr || (nts.match(/DEP_ADDR:([^|]+)/)?.[1] || '')).trim(),
      lat: item?.dep_lat ?? safeNum(nts.match(/DEP_LAT:([\d.,-]+)/)?.[1] || ''),
      lng: item?.dep_lng ?? safeNum(nts.match(/DEP_LNG:([\d.,-]+)/)?.[1] || '')
    };
  }

  return {
    label: (item?.arr_addr || (nts.match(/ARR_ADDR:([^|]+)/)?.[1] || '')).trim(),
    lat: item?.arr_lat ?? safeNum(nts.match(/ARR_LAT:([\d.,-]+)/)?.[1] || ''),
    lng: item?.arr_lng ?? safeNum(nts.match(/ARR_LNG:([\d.,-]+)/)?.[1] || '')
  };
}

/**
 * Fallback coords for classic items
 * Priority:
 * 1. item.lat / item.lng
 * 2. item.latitude / item.longitude
 * 3. parse in notes => LAT:/LNG:
 */
function getItemCoords(item){
  if(!item) return null;

  const lat =
    safeNum(item.lat) ??
    safeNum(item.latitude) ??
    safeNum(item?.notes?.match(/(?:^|\|)\s*LAT:([\d.,-]+)/)?.[1] || '');

  const lng =
    safeNum(item.lng) ??
    safeNum(item.longitude) ??
    safeNum(item?.notes?.match(/(?:^|\|)\s*LNG:([\d.,-]+)/)?.[1] || '');

  if(!hasValidCoords(lat, lng)) return null;
  return [lat, lng];
}

function getDistKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDistFromMe(item){
  if(!myPos) return null;
  const coords = getItemCoords(item);
  if(!coords) return null;
  return getDistKm(myPos.lat, myPos.lng, coords[0], coords[1]);
}

function getItemStatut(item){
  if(!item) return 'idee';
  return item.statut || (item.fait ? 'fait' : 'idee');
}

function getTransportDurationOnly(item){
  const nts = item?.notes || '';
  const m = nts.match(/Durée:\s*([^|]+)/i);
  return m ? m[1].trim() : '';
}

/* =========================================================
   MAP INIT / RESET
   ========================================================= */

function initMap(){
  const el = document.getElementById('map');
  if(!el || !window.L) return;

  if(mapInst){
    setTimeout(() => mapInst.invalidateSize(), 150);
    return;
  }

  mapInst = L.map(el, {
    zoomControl: true,
    attributionControl: true
  }).setView([31.2304, 121.4737], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapInst);

  mapMarkersLayer = L.layerGroup().addTo(mapInst);
  mapTransportLayer = L.layerGroup().addTo(mapInst);

  mapReady = true;

  setTimeout(() => {
    mapInst.invalidateSize();
    renderMapMarkers();
    updateMeOnMap();
  }, 180);
}

function destroyMap(){
  if(watchId && navigator.geolocation){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if(mapInst){
    mapInst.remove();
    mapInst = null;
  }
  mapReady = false;
  mapMarkersLayer = null;
  mapTransportLayer = null;
  meMarker = null;
  meCircle = null;
}

function refreshMap(){
  if(!mapInst) initMap();
  renderMapMarkers();
}

/* =========================================================
   RENDER MAP MARKERS
   ========================================================= */

function renderMapMarkers(){
  if(!mapInst || !mapReady || !mapMarkersLayer || !mapTransportLayer) return;

  mapMarkersLayer.clearLayers();
  mapTransportLayer.clearLayers();

  const bounds = [];
  const items = Array.isArray(D?.items) ? D.items : [];

  for(const item of items){
    if(!item) continue;

    /* -----------------------------------------
       TRANSPORTS
       ----------------------------------------- */
    if(item.type === 'transport'){
      const dep = getTransportPoint(item, 'dep');
      const arr = getTransportPoint(item, 'arr');
      const duration = getTransportDurationOnly(item);
      const price = item.prix ? `${item.prix} €` : '';

      if(hasValidCoords(dep.lat, dep.lng)){
        const depMarker = L.marker([dep.lat, dep.lng], {
          icon: buildColorIcon('#16a34a', '🟢')
        }).bindPopup(`
          <div style="padding:8px 10px;min-width:220px;">
            <div style="font-size:.82rem;font-weight:800;color:#111827;margin-bottom:4px;">
              Départ transport
            </div>
            <div style="font-size:.78rem;font-weight:700;color:#0f172a;">${escMap(item.nom || 'Transport')}</div>
            <div style="font-size:.72rem;color:#475569;margin-top:4px;">
              ${escMap(dep.label || 'Lieu départ')}
            </div>
            ${item.quartier ? `<div style="font-size:.68rem;color:#64748b;margin-top:6px;">Heure départ : ${escMap(item.quartier)}</div>` : ''}
            ${duration ? `<div style="font-size:.68rem;color:#64748b;">Durée : ${escMap(duration)}</div>` : ''}
            ${price ? `<div style="font-size:.68rem;color:#64748b;">Prix : ${escMap(price)}</div>` : ''}
          </div>
        `);
        depMarker.addTo(mapTransportLayer);
        bounds.push([dep.lat, dep.lng]);
      }

      if(hasValidCoords(arr.lat, arr.lng)){
        const arrMarker = L.marker([arr.lat, arr.lng], {
          icon: buildColorIcon('#ef4444', '🔴')
        }).bindPopup(`
          <div style="padding:8px 10px;min-width:220px;">
            <div style="font-size:.82rem;font-weight:800;color:#111827;margin-bottom:4px;">
              Arrivée transport
            </div>
            <div style="font-size:.78rem;font-weight:700;color:#0f172a;">${escMap(item.nom || 'Transport')}</div>
            <div style="font-size:.72rem;color:#475569;margin-top:4px;">
              ${escMap(arr.label || 'Lieu arrivée')}
            </div>
            ${item.description ? `<div style="font-size:.68rem;color:#64748b;margin-top:6px;">Heure arrivée : ${escMap(item.description)}</div>` : ''}
            ${duration ? `<div style="font-size:.68rem;color:#64748b;">Durée : ${escMap(duration)}</div>` : ''}
            ${price ? `<div style="font-size:.68rem;color:#64748b;">Prix : ${escMap(price)}</div>` : ''}
          </div>
        `);
        arrMarker.addTo(mapTransportLayer);
        bounds.push([arr.lat, arr.lng]);
      }

      if(hasValidCoords(dep.lat, dep.lng) && hasValidCoords(arr.lat, arr.lng)){
        const line = L.polyline(
          [[dep.lat, dep.lng], [arr.lat, arr.lng]],
          {
            color: '#16a34a',
            weight: 4,
            opacity: 0.8,
            dashArray: '10 8'
          }
        );

        line.bindPopup(`
          <div style="padding:8px 10px;min-width:220px;">
            <div style="font-size:.82rem;font-weight:800;color:#111827;margin-bottom:4px;">
              ${escMap(item.nom || 'Transport')}
            </div>
            <div style="font-size:.72rem;color:#475569;">
              ${escMap(dep.label || 'Départ')} → ${escMap(arr.label || 'Arrivée')}
            </div>
            ${duration ? `<div style="font-size:.68rem;color:#64748b;margin-top:6px;">Durée : ${escMap(duration)}</div>` : ''}
            ${price ? `<div style="font-size:.68rem;color:#64748b;">Prix : ${escMap(price)}</div>` : ''}
          </div>
        `);

        line.addTo(mapTransportLayer);
      }

      continue;
    }

    /* -----------------------------------------
       CLASSIC ITEMS
       ----------------------------------------- */
    if(!['activite', 'restaurant', 'cafe', 'hotel'].includes(item.type)) continue;

    const coords = getItemCoords(item);
    if(!coords) continue;

    const [lat, lng] = coords;
    bounds.push([lat, lng]);

    const distKm = getDistFromMe(item);
    const distTxt = distKm !== null ? `${distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km'}` : '';
    const statut = getItemStatut(item);

    const marker = L.marker([lat, lng], {
      icon: buildColorIcon(getItemTypeColor(item.type), getItemTypeEmoji(item.type))
    });

    marker.bindPopup(`
      <div style="padding:8px 10px;min-width:220px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-size:.82rem;font-weight:800;color:#111827;">
            ${escMap(item.nom || 'Sans nom')}
          </div>
          <span style="
            font-size:.58rem;
            font-weight:700;
            padding:3px 8px;
            border-radius:999px;
            background:${statut === 'fait' ? '#dcfce7' : statut === 'planifie' ? '#dbeafe' : '#f3f4f6'};
            color:${statut === 'fait' ? '#15803d' : statut === 'planifie' ? '#1d4ed8' : '#475569'};
          ">
            ${statut}
          </span>
        </div>

        <div style="font-size:.68rem;color:#64748b;margin-top:6px;">
          ${escMap(item.type || '')}
        </div>

        ${item.description ? `
          <div style="font-size:.72rem;color:#334155;margin-top:8px;line-height:1.45;">
            ${escMap(item.description)}
          </div>
        ` : ''}

        ${item.adresse_cn ? `
          <div style="font-size:.68rem;color:#64748b;margin-top:8px;">
            ${escMap(item.adresse_cn)}
          </div>
        ` : ''}

        ${distTxt ? `
          <div style="font-size:.68rem;color:#0f766e;margin-top:8px;font-weight:700;">
            📍 ${escMap(distTxt)} de vous
          </div>
        ` : ''}

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
          <button onclick='changeStatutFromMap("${String(item.id)}")' style="
            border:none;
            background:#111827;
            color:#fff;
            padding:8px 10px;
            border-radius:10px;
            font-size:.72rem;
            font-weight:700;
            cursor:pointer;
          ">Changer statut</button>

          ${hasValidCoords(lat, lng) ? `
            <button onclick='navigateToItem(${JSON.stringify({
              nom: item.nom || '',
              lat,
              lng,
              adresse_cn: item.adresse_cn || ''
            })})' style="
              border:none;
              background:#e85d5d;
              color:#fff;
              padding:8px 10px;
              border-radius:10px;
              font-size:.72rem;
              font-weight:700;
              cursor:pointer;
            ">Y aller</button>
          ` : ''}
        </div>
      </div>
    `);

    marker.addTo(mapMarkersLayer);
  }

  updateMeOnMap();

  if(bounds.length){
    try{
      mapInst.fitBounds(bounds, {padding:[28, 28]});
    }catch(e){}
  }else if(myPos){
    mapInst.setView([myPos.lat, myPos.lng], 12);
  }else{
    mapInst.setView([31.2304, 121.4737], 5);
  }
}

/* =========================================================
   GPS
   ========================================================= */

function startGPS(){
  if(!navigator.geolocation){
    if(typeof showToast === 'function') showToast('❌ GPS non disponible');
    return;
  }

  const banner = document.getElementById('gpsBanner');
  const txt = document.getElementById('gpsTxt');
  const acc = document.getElementById('gpsAcc');

  if(banner) banner.classList.add('on');
  if(txt) txt.textContent = 'Recherche GPS…';

  watchId = navigator.geolocation.watchPosition(
    pos => {
      myPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy
      };

      const accM = Math.round(myPos.acc);
      if(txt) txt.textContent = 'Position trouvée';
      if(acc) acc.textContent = '± ' + accM + 'm';
      if(banner) setTimeout(() => banner.classList.remove('on'), 3000);

      updateMeOnMap();
      updateProcheBadges();
      renderMapMarkers();
    },
    err => {
      if(txt) txt.textContent = 'GPS indisponible';
      if(acc) acc.textContent = err.message || 'Erreur GPS';
      setTimeout(() => {
        if(banner) banner.classList.remove('on');
      }, 2500);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    }
  );
}

function stopGPS(){
  if(watchId && navigator.geolocation){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function updateMeOnMap(){
  if(!mapInst || !myPos) return;

  const pos = [myPos.lat, myPos.lng];

  if(meMarker){
    meMarker.setLatLng(pos);
  }else{
    meMarker = L.marker(pos, {
      icon: buildMeIcon(),
      zIndexOffset: 1000
    }).addTo(mapInst);

    meMarker.bindPopup(`
      <div style="padding:8px;font-size:.82rem;font-weight:600;">
        📍 Vous êtes ici<br>
        <span style="font-size:.68rem;color:#888;">
          ± ${Math.round(myPos.acc)}m
        </span>
      </div>
    `);
  }

  if(meCircle){
    meCircle.setLatLng(pos).setRadius(myPos.acc);
  }else{
    meCircle = L.circle(pos, {
      radius: myPos.acc,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: .08,
      weight: 1.5
    }).addTo(mapInst);
  }
}

function centerOnMe(){
  if(!myPos){
    startGPS();
    if(typeof showToast === 'function') showToast('📍 Recherche GPS…');
    return;
  }

  if(!mapInst) return;

  mapInst.setView([myPos.lat, myPos.lng], 15, {animate:true});

  const btn = document.getElementById('gpsBtn');
  if(btn){
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 1200);
  }
}

function updateProcheBadges(){
  if(!myPos) return;

  const act = document.getElementById('tab-activites');
  if(act && act.classList.contains('on') && typeof renderItems === 'function'){
    ['activite', 'restaurant', 'cafe'].forEach(t => renderItems(t));
  }
}

/* =========================================================
   NAVIGATION VERS UN LIEU
   ========================================================= */

function navigateToItem(data){
  let d;
  try{
    d = typeof data === 'string' ? JSON.parse(data) : data;
  }catch(e){
    return;
  }

  const lat = safeNum(d?.lat);
  const lng = safeNum(d?.lng);
  const nom = d?.nom || '';
  const adresseCn = d?.adresse_cn || '';

  if(!hasValidCoords(lat, lng)){
    if(typeof showToast === 'function') showToast('❌ Coordonnées introuvables');
    return;
  }

  const amapNav = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(nom)}&mode=walking&src=chine2026`;
  const amapSearch = adresseCn
    ? `https://www.amap.com/search?query=${encodeURIComponent(adresseCn)}`
    : `https://www.amap.com/search?query=${encodeURIComponent(nom)}`;

  showNavChoice(nom, amapNav, amapSearch, lat, lng);
}

function showNavChoice(nom, amapNav, amapSearch, lat, lng){
  const old = document.getElementById('navChoiceSheet');
  if(old) old.remove();

  const sheet = document.createElement('div');
  sheet.id = 'navChoiceSheet';
  sheet.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.5);
    z-index:3000;
    display:flex;
    align-items:flex-end;
    backdrop-filter:blur(4px);
    animation:fadeIn .2s ease;
  `;

  sheet.innerHTML = `
    <div style="
      width:100%;
      background:#fff;
      border-radius:24px 24px 0 0;
      padding:0 20px calc(20px + env(safe-area-inset-bottom));
      animation:slideUp .28s cubic-bezier(.4,0,.2,1);
      box-shadow:0 -18px 48px rgba(92,56,36,.18);
    ">
      <div style="width:36px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 18px;"></div>

      <div style="font-size:1rem;font-weight:700;color:#231815;margin-bottom:4px;">
        🧭 Naviguer vers
      </div>
      <div style="font-size:.8rem;color:#6b5b53;margin-bottom:18px;">
        ${escMap(nom)}
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <a href="${amapNav}" target="_blank" style="
          display:flex;align-items:center;gap:12px;padding:14px;
          background:linear-gradient(135deg,#e85d5d,#f59b7a);
          border-radius:14px;color:#fff;text-decoration:none;
          font-weight:600;font-size:.88rem;">
          <span style="font-size:1.3rem;">🧭</span>
          <div>
            <div>Ouvrir dans Amap</div>
            <div style="font-size:.68rem;opacity:.8;">Navigation GPS en temps réel</div>
          </div>
        </a>

        <a href="${amapSearch}" target="_blank" style="
          display:flex;align-items:center;gap:12px;padding:14px;
          background:#f7efe8;border:1.5px solid #eedfd3;border-radius:14px;
          color:#231815;text-decoration:none;font-weight:600;font-size:.88rem;">
          <span style="font-size:1.3rem;">🔍</span>
          <div>
            <div>Rechercher sur Amap</div>
            <div style="font-size:.68rem;color:#6b5b53;">Web — affiche l'adresse</div>
          </div>
        </a>

        <a href="https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w" target="_blank" style="
          display:flex;align-items:center;gap:12px;padding:14px;
          background:#f0f8ff;border:1.5px solid #dbeafe;border-radius:14px;
          color:#1d4ed8;text-decoration:none;font-weight:600;font-size:.88rem;">
          <span style="font-size:1.3rem;">🍎</span>
          <div>
            <div>Apple Plans</div>
            <div style="font-size:.68rem;color:#3b82f6;">Fallback si Amap indispo</div>
          </div>
        </a>
      </div>

      <button onclick="document.getElementById('navChoiceSheet').remove()" style="
        width:100%;
        margin-top:10px;
        padding:12px;
        background:#f7efe8;
        border:none;
        border-radius:12px;
        font-family:inherit;
        font-size:.86rem;
        color:#6b5b53;
        cursor:pointer;
      ">Annuler</button>
    </div>
  `;

  sheet.onclick = e => {
    if(e.target === sheet) sheet.remove();
  };

  document.body.appendChild(sheet);
}

/* =========================================================
   ACTIONS
   ========================================================= */

async function changeStatutFromMap(itemId){
  const item = (D?.items || []).find(x => String(x.id) === String(itemId));
  if(!item) return;

  const current = getItemStatut(item);
  const next = { idee:'planifie', planifie:'fait', fait:'idee' }[current] || 'idee';

  if(typeof setStatut === 'function'){
    await setStatut(itemId, next);
    setTimeout(() => renderMapMarkers(), 400);
  }
}

/* =========================================================
   AUTO INIT WHEN TAB OPENS
   ========================================================= */

function onMapTabOpen(){
  initMap();
  setTimeout(() => {
    if(mapInst) mapInst.invalidateSize();
    renderMapMarkers();
  }, 120);
}
