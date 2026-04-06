const SB_URL='https://nwskpowizbggdqghnhcw.supabase.co';
const SB_KEY='sb_publishable_571IoCHNSZxkvF7MW77Fxg_CfWgvcT4';
const sb=supabase.createClient(SB_URL,SB_KEY);
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'if-file') {
    const file = e.target.files[0];
    if (!file) return;

    // Optionnel : Alerte si le fichier est trop lourd (> 1.5 Mo) pour éviter de bloquer Supabase
    if (file.size > 20*1024*1024) {
      alert("Fichier trop lourd (max 20Mo).");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = function() {
      const hiddenInput = document.getElementById('if-file-data');
      if (hiddenInput) {
        hiddenInput.value = reader.result;
        document.getElementById('file-preview').innerHTML = `<b style="color:var(--vert2); font-size:0.6rem;">✅ Fichier prêt !</b>`;
      }
    }
    reader.readAsDataURL(file);
  }
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      console.log("Service worker OK");
    } catch (err) {
      console.error("Erreur service worker :", err);
    }
  });
}
// ── UTILISATEURS avec MDP ──
let currentUser = localStorage.getItem('chine_user') || null; // 'matis' | 'lise'
const USERS = {
  matis:   { name:'Matis', emoji:'👨', color:'#3b82f6', bg:'#dbeafe', av:'m', pin:'matis2026' },
  lise:    { name:'Lise',  emoji:'👩', color:'#ec4899', bg:'#fce7f3', av:'l', pin:'lise2026' },
  visiteur:{ name:'Visiteur', emoji:'👁️', color:'#64748b', bg:'#f1f5f9', av:'v', pin:null }
};
  let loginTargetUser = null;

function openLoginModal(userKey, userName){
  loginTargetUser = userKey;

  document.getElementById('loginTitle').textContent =
    `🔐 Bonjour ${userName}`;

  document.getElementById('loginPassword').value = '';
  document.getElementById('loginModal').style.display = 'flex';

  setTimeout(()=>{
    document.getElementById('loginPassword').focus();
  },100);
}

function closeLoginModal(){
  document.getElementById('loginModal').style.display = 'none';
  loginTargetUser = null;
}
const D={budget:[],planning:[],items:[],slots:[],checklist:[],notes:[]};
let budgetPP=parseFloat(localStorage.getItem('bpp')||'2500');
let convRate=parseFloat(localStorage.getItem('convRate')||'7.78');
let sortBy={activite:'ville',restaurant:'ville',cafe:'ville',hotel:'ville'};
let pickerCtx=null;
let dayDragSrc=null;
let searchOpen=false;
let viewMode={activite:'galerie',restaurant:'galerie',cafe:'galerie',hotel:'liste'};
// ── STATUT & TERRAIN STATE ──
let terrainMode=false;
let terrainFilter='tous'; // 'tous'|'idee'|'planifie'|'fait'|'coeur'|'rapide'|'pasCher'|ville
let dragItemId=null; // id of item being dragged to planning

const VILLES=['Shanghai','Chongqing','Chengdu','Karst de Wulong','Furong','Zhangjiajie'];
const VILLE_IC={Shanghai:'🏙️',Chongqing:'🌆',Chengdu:'🐼','Karst de Wulong':'🏔️',Furong:'🌸',Zhangjiajie:'🏞️'};
const MO=['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const TYPE_IC={activite:'🎯',restaurant:'🍜',cafe:'☕',hotel:'🏨',transport:'🚄'};
const TYPE_LABEL={activite:'Activité',restaurant:'Restaurant',cafe:'Café / Bar',hotel:'Hôtel',transport:'Transport'};
const TRANSPORT_TYPES=['✈️ Vol','🚂 Train','🚌 Bus','🚗 Taxi / DiDi','🚢 Bateau'];
const MOMENTS=['','Matin','Après-midi','Soir','Journée'];

// ── METEO DATA (static, November) ──
const METEO_DATA={
  Shanghai:{min:10,max:18,desc:'Nuageux, quelques pluies',ic:'🌧️'},
  Chongqing:{min:10,max:16,desc:'Souvent nuageux',ic:'☁️'},
  Chengdu:{min:9,max:15,desc:'Brumeux le matin',ic:'🌫️'},
  'Karst de Wulong':{min:7,max:14,desc:'Frais, brumeux',ic:'🌫️'},
  Furong:{min:8,max:14,desc:'Frais, possible pluie',ic:'🌦️'},
  Zhangjiajie:{min:6,max:13,desc:'Brume magnifique le matin',ic:'🌁'},
};

// ── PHRASEBOOK ──
const PHRASES=[
  {cat:'Basiques & Politesse',phrases:[
    {fr:'Bonjour',zh:'你好',pin:'Nǐ hǎo'},
    {fr:'Merci',zh:'谢谢',pin:'Xièxiè'},
    {fr:'S\'il vous plaît',zh:'请',pin:'Qǐng'},
    {fr:'Oui',zh:'是',pin:'Shì'},
    {fr:'Non',zh:'不是',pin:'Bú shì'},
    {fr:'De rien / Je vous en prie',zh:'不客气',pin:'Bù kèqì'},
    {fr:'Excusez-moi / Pardon',zh:'不好意思',pin:'Bù hǎoyìsi'},
  ]},
  {cat:'🍽️ Manger & Boire',phrases:[
    {fr:'Pas épicé (important !)',zh:'不辣',pin:'Bù là'},
    {fr:'Un peu épicé',zh:'微辣',pin:'Wēi là'},
    {fr:'Épicé',zh:'很辣',pin:'là'},
    {fr:'Eau plate (Temp. ambiante)',zh:'常温水',pin:'Chángwēn shuǐ'},
    {fr:'Eau gazeuse',zh:'气泡水',pin:'Qìpào shuǐ'},
    {fr:'L\'addition',zh:'买单',pin:'Mǎi dān'},
  ]},
  {cat:'🗺️ Orientation & Transport',phrases:[
    {fr:'Où est le métro ?',zh:'地铁站在哪里？',pin:'Dìtiězhàn zài nǎlǐ?'},
    {fr:'Gare ferroviaire',zh:'火车站',pin:'Huǒchē zhàn'},
    {fr:'Toilettes',zh:'厕所',pin:'Cèsuǒ'},
    {fr:'Allez à cette adresse svp',zh:'请去这个地址',pin:'Qǐng qù zhège dìzhǐ'},
    {fr:'Ici (pour s\'arrêter)',zh:'在这里',pin:'Zài zhèlǐ'},
  ]},
  {cat:'💰 Shopping & Négociation',phrases:[
    {fr:'Combien ça coûte ?',zh:'多少钱？',pin:'Duōshao qián?'},
    {fr:'C\'est trop cher !',zh:'太贵了！',pin:'Tài guì le!'},
    {fr:'Puis-je avoir un rabais ?',zh:'便宜一点可以吗？',pin:'Piányí yīdiǎn kěyǐ ma?'},
    {fr:'Scanner mon code (paiement)',zh:'扫我的码',pin:'Sǎo wǒ de mǎ'},
  ]},
  {cat:'🔌 Besoins Divers',phrases:[
    {fr:'Mot de passe WiFi',zh:'WIFI 密码',pin:'WIFI mìmǎ'},
    {fr:'Batterie externe / Chargeur',zh:'充电宝 / 充电器',pin:'Chōngdiàn bǎo / Chōngdiàn qì'},
    {fr:'Avez-vous du papier toilette ?',zh:'你有卫生纸吗？',pin:'Nǐ yǒu wèishēngzhǐ ma?'},
    {fr:'Prendre une photo ?',zh:'拍照吗？',pin:'Pāizhào ma?'},
  ]},
  {cat:'🚑 Urgences',phrases:[
    {fr:'À l\'aide !',zh:'救命！',pin:'Jiùmìng!'},
    {fr:'Je suis perdu(e)',zh:'我迷路了',pin:'Wǒ mílù le'},
    {fr:'Hôpital / Médecin',zh:'医院 / 医生',pin:'Yīyuàn / Yīshēng'},
    {fr:'Appelez la police',zh:'叫警察',pin:'Jiào jǐngchá'},
  ]},
];

// ── PACKING CATEGORIES ──
const PACK_DEFAULT=[
  {cat:'👔 Vêtements',emoji:'👔',items:[
    {l:'T-shirts (×5)',d:false},{l:'Pulls / Sweats (×3)',d:false},{l:'Pantalons (×2)',d:false},
    {l:'Veste imperméable',d:false},{l:'Manteau chaud (Zhangjiajie)',d:false},
    {l:'Sous-vêtements (×7)',d:false},{l:'Chaussettes (×7)',d:false},
    {l:'Chaussures de marche',d:false},{l:'Tongs / claquettes',d:false},
  ]},
  {cat:'💊 Santé & Pharmacie',emoji:'💊',items:[
    {l:'Médicaments habituels',d:false},{l:'Anti-diarrhéiques',d:false},
    {l:'Crème solaire',d:false},{l:'Répulsif moustiques',d:false},
    {l:'Pansements / désinfectant',d:false},{l:'Masques FFP2',d:false},
  ]},
  {cat:'📱 Électronique',emoji:'📱',items:[
    {l:'Téléphone + chargeur',d:false},{l:'Batterie externe (20000mAh)',d:false},
    {l:'Adaptateur prise CN (Type A/I)',d:false},{l:'Écouteurs',d:false},
    {l:'Appareil photo',d:false},{l:'Multiprise',d:false},
  ]},
  {cat:'📄 Documents',emoji:'📄',items:[
    {l:'Passeport',d:false},{l:'Visa Chine',d:false},
    {l:'Photocopies passeport',d:false},{l:'Assurance voyage imprimée',d:false},
    {l:'Réservations hôtels',d:false},{l:'Billets transport',d:false},
  ]},
  {cat:'🧴 Hygiène',emoji:'🧴',items:[
    {l:'Brosse à dents + dentifrice',d:false},{l:'Déodorant',d:false},
    {l:'Shampooing',d:false},{l:'Serviette microfibre',d:false},
    {l:'Papier toilette de secours',d:false},
  ]},
];

// ── INIT ──
async function init(){
  const offlineBanner = document.getElementById('offlineBanner');
  const loader = document.getElementById('loader');
  const loaderMsg = document.getElementById('loader-msg');
  const convRateInp = document.getElementById('conv-rate-inp');

  function syncOfflineBanner(){
    if(!offlineBanner) return;
    if(!navigator.onLine){
      offlineBanner.classList.add('on');
      offlineBanner.textContent = '📵 Mode hors-ligne — données en cache';
    } else {
      offlineBanner.classList.remove('on');
    }
  }

  window.addEventListener('offline', syncOfflineBanner);
  window.addEventListener('online', syncOfflineBanner);
  syncOfflineBanner();

  const cached = localStorage.getItem('chine_cache');
  if(cached){
    try{
      const c = JSON.parse(cached);
      Object.assign(D, c);
      renderAll();
    }catch(e){
      console.error('Erreur cache local :', e);
    }
  }

  try{
    if(loaderMsg) loaderMsg.textContent = 'Chargement…';

    await loadAll();

    localStorage.setItem('chine_cache', JSON.stringify(D));
    subAll();

    if(loader) loader.style.display = 'none';
    if(convRateInp) convRateInp.value = convRate;

    renderAll();
    loadMeteo();
    updateEditorUI();
    updateProfilUI();

  }catch(e){
    console.error(e);

    if(cached){
      if(loader) loader.style.display = 'none';
      renderAll();
      loadMeteo();
      updateEditorUI();
      updateProfilUI();
      syncOfflineBanner();
    }else{
      if(loaderMsg) loaderMsg.textContent = 'Erreur : ' + (e?.message || e);
    }
  }
}

function isEditorMode(){
  return currentUser === 'matis' || currentUser === 'lise';
}

function requireEditor(){
  if(isEditorMode()) return true;

  showToast(
    currentUser === 'visiteur'
      ? '👁️ Mode visiteur : lecture seule'
      : "Connecte-toi d'abord"
  );
  return false;
}

function updateEditorUI(){
  const canEdit = isEditorMode();

  document.body.classList.toggle('reader-mode', !canEdit);

  document.querySelectorAll('[data-editor-only]').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });

  const badge = document.getElementById('editorModeLabel');
  if(badge){
    badge.textContent = canEdit ? 'Compte éditeur' : 'Lecture seule';
  }

  const modeLine = document.getElementById('settingsUserMode');
  if(modeLine){
    if(currentUser === 'visiteur'){
      modeLine.textContent = '👁️ Visiteur · lecture seule';
      modeLine.style.color = 'var(--accent)';
    } else {
      modeLine.textContent = '✏️ Compte éditeur';
      modeLine.style.color = 'var(--green)';
    }
  }
}

function showToast(text){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
async function loadAll(){
  const runs=[
    sb.from('budget').select('*').order('id',{ascending:true}),
    sb.from('planning').select('*').order('ordre',{ascending:true,nullsFirst:false}),
    sb.from('items').select('*').order('type',{ascending:true}).order('id',{ascending:true}),
    sb.from('planning_slots').select('*').order('id',{ascending:true}),
    sb.from('checklist').select('*').order('categorie',{ascending:true}).order('id',{ascending:true}),
    sb.from('notes').select('*').order('id',{ascending:true})
  ];
  const keys=['budget','planning','items','slots','checklist','notes'];
  const results=await Promise.all(runs);
  results.forEach(({data,error},i)=>{if(error)throw error;D[keys[i]]=data||[];});
  D._ts=Date.now();
}

let renderAllDebounceTimer=null;
function debouncedRenderAll(){
  clearTimeout(renderAllDebounceTimer);
  renderAllDebounceTimer=setTimeout(()=>{flash();renderAll();},400);
}

function subAll(){
  const map={budget:'budget',planning:'planning',items:'items',slots:'planning_slots',checklist:'checklist',notes:'notes'};
  Object.entries(map).forEach(([key,table])=>{
    sb.channel('rt-'+table).on('postgres_changes',{event:'*',schema:'public',table},async(payload)=>{
      // Mise à jour locale immédiate sans re-fetch complet pour les updates simples
      if(payload.eventType==='UPDATE'&&payload.new){
        const idx=D[key]?.findIndex(x=>x.id===payload.new.id);
        if(idx>=0){D[key][idx]=payload.new;}
        else{const{data}=await sb.from(table).select('*').order('id',{ascending:true});D[key]=data||[];}
      }else if(payload.eventType==='INSERT'&&payload.new){
        if(!D[key])D[key]=[];
        D[key].push(payload.new);
      }else if(payload.eventType==='DELETE'&&payload.old?.id){
        D[key]=(D[key]||[]).filter(x=>x.id!==payload.old.id);
      }else{
        const{data}=await sb.from(table).select('*').order('id',{ascending:true});
        D[key]=data||[];
      }
      localStorage.setItem('chine_cache',JSON.stringify(D));
      debouncedRenderAll();
    }).subscribe();
  });
}
function formatHeureDecalage(heureChine) {
  if (!heureChine || !heureChine.includes('h')) return null;
  
  // On extrait les heures et minutes (ex: "14h30")
  let [h, m] = heureChine.split('h').map(Number);
  
  // En novembre, la Chine (UTC+8) a 7h d'avance sur la France (UTC+1)
  let hFrance = h - 7;
  
  let jourRelatif = "";
  if (hFrance < 0) {
    hFrance += 24;
    jourRelatif = " (J-1)";
  }
  
  return `${String(hFrance).padStart(2, '0')}h${String(m).padStart(2, '0')}${jourRelatif}`;
}
function flash(){const d=document.getElementById('ld');const t=document.getElementById('liveTxt');if(d){d.classList.remove('off');if(t){t.textContent='Live';t.style.color='var(--green)';}setTimeout(()=>{d.classList.add('off');if(t){t.textContent='Sync';t.style.color='';}},2000);}}

// ── METEO ──
function loadMeteo(){
  const cont=document.getElementById('meteoBody');
  if(!cont)return;
  cont.innerHTML='';
  Object.entries(METEO_DATA).forEach(([city,m])=>{
    const d=document.createElement('div');d.className='meteo-row';
    d.innerHTML=`<span style="font-size:1.2rem;">${m.ic}</span><span class="meteo-city-name">${city}</span><span class="meteo-desc">${m.desc}</span><span class="meteo-temp">${m.min}–${m.max}°C</span>`;
    cont.appendChild(d);
  });
}

function toggleMeteo(){
  const b=document.getElementById('meteoBody');
  const arr=document.getElementById('meteo-arr');
  if(b.style.display==='none'){b.style.display='flex';b.style.flexDirection='column';b.style.gap='6px';b.style.padding='0 16px 14px';arr.textContent='▲';}
  else{b.style.display='none';arr.textContent='▼';}
}


// ── NAV DRAWER ──
function getDrawerMainNavMap(){
  return {
    restaurants:'nb-more',
    hotels:'nb-more',
    transport:'nb-more',
    checklist:'nb-more',
    notes:'nb-more',
    phrases:'nb-more',
    stats:'nb-more',
    galerie:'nb-more',
    pratique:'nb-more',
    budget:'nb-budget',
    planning:'nb-planning',
    activites:'nb-activites',
    carte:'nb-carte',
    chat:'nb-chat'
  };
}

function navBtnRef(btn){
  if(!btn) return null;
  const id = btn.id || '';
  const map = {
    'nd-restaurants':'nb-more',
    'nd-hotels':'nb-more',
    'nd-transport':'nb-more',
    'nd-checklist':'nb-more',
    'nd-notes':'nb-more',
    'nd-phrases':'nb-more',
    'nd-stats':'nb-more',
    'nd-galerie':'nb-more',
    'nd-pratique':'nb-more'
  };
  const mainId = map[id];
  return mainId ? document.getElementById(mainId) : null;
}

function syncNavDrawerState(activeTab){
  document.querySelectorAll('.nav-drawer-btn').forEach(btn=>btn.classList.remove('active'));
  const activeMap = {
    restaurants:'nd-restaurants',
    hotels:'nd-hotels',
    transport:'nd-transport',
    checklist:'nd-checklist',
    notes:'nd-notes',
    phrases:'nd-phrases',
    stats:'nd-stats',
    galerie:'nd-galerie',
    pratique:'nd-pratique'
  };
  const activeDrawerId = activeMap[activeTab];
  if(activeDrawerId){
    document.getElementById(activeDrawerId)?.classList.add('active');
  }
}

function toggleNavDrawer(force){
  const drawer = document.getElementById('navDrawer');
  if(!drawer) return;
  const shouldOpen = typeof force === 'boolean' ? force : !drawer.classList.contains('open');
  drawer.classList.toggle('open', shouldOpen);
  document.body.style.overflow = shouldOpen ? 'hidden' : '';
}

function closeNavDrawer(){
  toggleNavDrawer(false);
}

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeNavDrawer();
});

// ── TABS ──
function goTab(n,el){
  if(n === 'chat' && currentUser === 'visiteur'){
    showToast('🔒 Chat indisponible en mode visiteur');
    return;
  }

  const targetTab=document.getElementById('tab-'+n);
  if(!targetTab){
    console.warn('Tab introuvable :', n);
    return;
  }

  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(t=>t.classList.remove('on'));

  const navMap = getDrawerMainNavMap();
  const fallbackMainBtnId = navMap[n];
  const mainBtn = el || (fallbackMainBtnId ? document.getElementById(fallbackMainBtnId) : null);

  targetTab.classList.add('on');
  if(mainBtn) mainBtn.classList.add('on');
  syncNavDrawerState(n);
  closeNavDrawer();
  closeSearch();
  window.scrollTo({top:0,behavior:'instant'});
  if(n==='phrases')renderPhrases();
  if(n==='checklist')renderPacking();
  if(n==='stats')renderStats();
  if(n==='carte'){initMap();}
  if(n==='chat'){initChat();}
  if(n==='galerie'){renderGalerie();}
  if(n==='pratique'){renderPratique();}
}

// ── SEARCH ──
function toggleSearch(){
  searchOpen=!searchOpen;
  document.getElementById('searchBar').classList.toggle('on',searchOpen);
  document.getElementById('mainContent').style.marginTop=searchOpen?'49px':'0';
  if(searchOpen){setTimeout(()=>document.getElementById('searchInp').focus(),100);}
  else{document.getElementById('searchResults').style.display='none';document.getElementById('searchInp').value='';}
}
function closeSearch(){
  searchOpen=false;
  document.getElementById('searchBar').classList.remove('on');
  document.getElementById('searchResults').style.display='none';
  document.getElementById('mainContent').style.marginTop='0';
}
function doSearch(q){
  const res=document.getElementById('searchResults');
  if(!q||q.length<2){res.style.display='none';return;}
  const lower=q.toLowerCase();
  const matches=D.items.filter(x=>
    (x.nom||'').toLowerCase().includes(lower)||
    (x.ville||'').toLowerCase().includes(lower)||
    (x.quartier||'').toLowerCase().includes(lower)||
    (x.description||'').toLowerCase().includes(lower)
  ).slice(0,12);
  if(!matches.length){res.style.display='none';return;}
  res.innerHTML='';res.style.display='block';
  matches.forEach(item=>{
    const d=document.createElement('div');d.className='sr-item';
    d.innerHTML=`<span class="sr-ic">${TYPE_IC[item.type]||'📍'}</span>
      <div class="sr-info"><div class="sr-name">${esc(item.nom)}</div><div class="sr-meta">${TYPE_LABEL[item.type]||''} · ${esc(item.ville||'')}${item.quartier&&item.quartier!=='À définir'?' · '+esc(item.quartier):''}</div></div>
      ${parseFloat(item.prix||0)>0?`<span style="font-family:var(--ft);font-size:.9rem;color:var(--or);">${fmtE(parseFloat(item.prix))}</span>`:''}`;
    d.onclick=()=>{closeSearch();openItemSheet(item.type,item);};
    res.appendChild(d);
  });
}

// ── RENDER ALL ──
function renderAll(){
  renderBudget();renderPlanning();updateNextStep();
  ['activite','restaurant','cafe','hotel'].forEach(renderItems);
  renderTransports();renderChecklist();renderNotes();
  renderPhrases();
  // Ne re-render la carte QUE si elle est visible (évite boucle)
  if(mapInst&&document.getElementById('tab-carte')?.classList.contains('on')){
    renderMapMarkers();
  }
}

// ── CONVERTISSEUR ──
function convEurToRmb(){const e=parseFloat(document.getElementById('conv-eur').value)||0;document.getElementById('conv-rmb').value=e?Math.round(e*convRate*100)/100:'';}
function convRmbToEur(){const r=parseFloat(document.getElementById('conv-rmb').value)||0;document.getElementById('conv-eur').value=r?Math.round(r/convRate*100)/100:'';}
function updateRate(v){convRate=parseFloat(v)||7.78;localStorage.setItem('convRate',convRate);}

// ── BUDGET ──
function renderBudget(){
  const list=document.getElementById('bList');list.innerHTML='';
  const tot2=budgetPP*2;

  // Calcul par personne
  // "les deux" = divisé par 2 pour chacun
  // "matis" = intégralité sur Matis
  // "lise" = intégralité sur Lise
  let depMatis=0,depLise=0;
  D.budget.forEach(r=>{
    const t=parseFloat(r.total||0);
    const who=r.personne||'les deux';
    if(who==='matis'){depMatis+=t;}
    else if(who==='lise'){depLise+=t;}
    else{depMatis+=t/2;depLise+=t/2;}
  });
  const dep=depMatis+depLise;
  const rest=tot2-dep;
  const pct=Math.min(100,tot2>0?dep/tot2*100:0);
  const restM=budgetPP-depMatis;
  const restL=budgetPP-depLise;

  document.getElementById('bTotal').textContent=fmtE(tot2);
  document.getElementById('bSub').textContent=fmtE(dep)+' dépensés · '+Math.round(pct)+'% utilisés';
  document.getElementById('bDep').textContent=fmtE(dep);
  document.getElementById('bRest').textContent=fmtE(rest);
  document.getElementById('bProg2').textContent=Math.round(pct)+'%';

  // Per person
  document.getElementById('bMatisDep').textContent=fmtE(depMatis);
  const mrEl=document.getElementById('bMatisRest');
  mrEl.textContent=(restM>=0?'Reste '+fmtE(restM):'Dépassé de '+fmtE(-restM));
  mrEl.className='pc-rest '+(restM>=0?'ok':'warn');
  const mBar=document.getElementById('bMatisBar');if(mBar)mBar.style.width=Math.min(100,budgetPP>0?depMatis/budgetPP*100:0)+'%';

  document.getElementById('bLiseDep').textContent=fmtE(depLise);
  const lrEl=document.getElementById('bLiseRest');
  lrEl.textContent=(restL>=0?'Reste '+fmtE(restL):'Dépassé de '+fmtE(-restL));
  lrEl.className='pc-rest '+(restL>=0?'ok':'warn');
  const lBar=document.getElementById('bLiseBar');if(lBar)lBar.style.width=Math.min(100,budgetPP>0?depLise/budgetPP*100:0)+'%';

  const pb=document.getElementById('bProg');pb.style.width=pct+'%';
  pb.style.background=pct>100?'var(--accent)':pct>85?'linear-gradient(90deg,var(--accent),#f97316)':'linear-gradient(90deg,var(--green),#6edcc4)';

  // Budget alert
  const alert=document.getElementById('budgetAlert');
  const alertTxt=document.getElementById('budgetAlertText');
  if(pct>=100){
    alert.classList.add('on');
    alertTxt.innerHTML=`<b>Budget dépassé !</b> ${fmtE(dep-tot2)} de plus que prévu.`;
  }else if(pct>=80){
    alert.classList.add('on');
    alertTxt.innerHTML=`<b>${Math.round(pct)}% utilisé.</b> Reste ${fmtE(rest)} global · Matis ${fmtE(restM)} · Lise ${fmtE(restL)}`;
  }else{
    alert.classList.remove('on');
  }

  const whoLabel={'les deux':'👥 Les deux','matis':'👤 Matis','lise':'👤 Lise'};
  const whoClass={'les deux':'lesdeux','matis':'matis','lise':'lise'};
  D.budget.forEach(r=>{
    const t=parseFloat(r.total||0);
    const who=r.personne||'les deux';
    const montantAffiche=who==='les deux'?fmtE(t)+' ('+fmtE(t/2)+'/pers.)':fmtE(t);
    const d=document.createElement('div');d.className='b-item';
    d.innerHTML=`<div class="b-icon">${(r.categorie||'💸').split(' ')[0]||'💸'}</div>
      <div class="b-body"><div class="b-name">${esc(r.description)}</div><div class="b-meta">${esc(r.categorie)}</div></div>
      <span class="b-who ${whoClass[who]||'lesdeux'}">${whoLabel[who]||'👥'}</span>
      <div class="b-amount">${montantAffiche}</div>`;
    d.onclick=()=>openBudgetEdit(r);list.appendChild(d);
  });
}

function closeSheet(id){var el=document.getElementById(id);if(el)el.remove();}
function openOverlay(id){document.getElementById(id).classList.add('on');}
function closeOverlay(id){document.getElementById(id).classList.remove('on');}
function openBudgetSheet(){
  if(!isEditorMode()){
    showToast('🔒 Mode lecteur');
    return;
  }
  document.getElementById('b-sheet-title').textContent='Nouvelle dépense';
  document.getElementById('b-id').value='';
  document.getElementById('b-cat').value='';
  document.getElementById('b-desc').value='';
  document.getElementById('b-total').value='';
  document.getElementById('b-del-btn').style.display='none';
  openOverlay('budget-overlay');
}
function openBudgetEdit(r){
  if(!isEditorMode()){
  showToast('🔒 Mode lecteur');
  return;
}
  document.getElementById('b-sheet-title').textContent='Modifier';
  document.getElementById('b-id').value=r.id;document.getElementById('b-cat').value=r.categorie||'';
  document.getElementById('b-desc').value=r.description||'';document.getElementById('b-total').value=r.total||'';
  document.getElementById('b-who').value=r.personne||'les deux';
  document.getElementById('b-del-btn').style.display='block';openOverlay('budget-overlay');
}
async function saveBudget(){
  if(!isEditorMode()){
  showToast('🔒 Mode lecteur');
  return;
}
  const id=document.getElementById('b-id').value;
  const p={categorie:document.getElementById('b-cat').value,description:document.getElementById('b-desc').value,total:parseFloat(document.getElementById('b-total').value)||0,source:'manuel',personne:document.getElementById('b-who').value||'les deux'};
  if(id)await sb.from('budget').update(p).eq('id',id);else await sb.from('budget').insert(p);
  closeOverlay('budget-overlay');
}
async function deleteBudget(){
  if(!isEditorMode()){
  showToast('🔒 Mode lecteur');
  return;
}
  const id=document.getElementById('b-id').value;
  if(id)await sb.from('budget').delete().eq('id',id);closeOverlay('budget-overlay');
}
function savePP(){budgetPP=parseFloat(document.getElementById('pp-val').value)||2500;localStorage.setItem('bpp',budgetPP);renderBudget();closeOverlay('pp-sheet');}

// ── ITEMS ──
function getItemStatut(item){
  if(item.statut)return item.statut;
  if(item.fait)return'fait';
  if(D.slots.some(s=>s.item_id===item.id))return'planifie';
  return'idee';
}
function getItemPriorite(item){
  if(item.priorite)return item.priorite;
  const avg=((item.matis||0)+(item.lise||0))/2;
  if(avg>=4.5)return'coeur';
  if(avg>=3)return'sympa';
  return'optionnel';
}
function getItemDuree(item){return item.duree||'';}
function applyTerrainFilter(items){
  if(terrainFilter==='tous')return items;
  if(terrainFilter==='idee')return items.filter(x=>getItemStatut(x)==='idee');
  if(terrainFilter==='planifie')return items.filter(x=>getItemStatut(x)==='planifie');
  if(terrainFilter==='fait')return items.filter(x=>getItemStatut(x)==='fait');
  if(terrainFilter==='coeur')return items.filter(x=>getItemPriorite(x)==='coeur');
  if(terrainFilter==='rapide')return items.filter(x=>getItemDuree(x)==='30min');
  if(terrainFilter==='pasCher')return items.filter(x=>parseFloat(x.prix||0)<30);
  if(terrainFilter==='proche'){
    if(!myPos)return items; // pas de GPS = tout afficher
    return items.filter(x=>{const d=getDistFromMe(x);return d!==null&&d<2;}).sort((a,b)=>(getDistFromMe(a)||999)-(getDistFromMe(b)||999));
  }
  return items.filter(x=>(x.ville||'')=== terrainFilter);
}
function renderItems(type){
  const contId='cont-'+type,sortId='sort-'+type;
  const cont=document.getElementById(contId);if(!cont)return;cont.innerHTML='';
  const sortEl=document.getElementById(sortId);
  const sort=sortBy[type]||'ville';
  if(sortEl){
    sortEl.innerHTML='';
    // Vue toggle
    const vm=viewMode[type]||'liste';
    ['liste','galerie'].forEach(v=>{
      const b=document.createElement('button');b.className='view-btn'+(vm===v?' on':'');
      b.textContent=v==='liste'?'☰ Liste':'⊞ Galerie';
      b.onclick=()=>{viewMode[type]=v;renderItems(type);};sortEl.appendChild(b);
    });
    // spacer
    const sp=document.createElement('span');sp.style.cssText='width:1px;background:var(--border);margin:4px 4px;flex-shrink:0;';sortEl.appendChild(sp);
    // Sort chips
    [['ville','Ville'],['quartier','Quartier'],['envie','Envie'],['statut','Statut']].forEach(([k,lbl])=>{
      const b=document.createElement('button');b.className='s-chip'+(sort===k?' on':'');b.textContent=lbl;
      b.onclick=()=>{sortBy[type]=k;renderItems(type);};sortEl.appendChild(b);
    });
  }
  let items=D.items.filter(x=>x.type===type);
  if(terrainMode && type==='activite'){
    items=items.filter(x=>getItemStatut(x)!=='idee');
  } else {
    items=applyTerrainFilter(items);
  }
  if(!items.length){
    cont.innerHTML=`<div class="empty-state"><div class="empty-icon">${TYPE_IC[type]||'📍'}</div><div class="empty-txt">${terrainMode?'Aucune activité planifiée':'Aucun élément'}</div><div class="empty-sub">${terrainMode?'Planifiez des activités':'Ajoutez le premier'}</div></div>`;
    return;
  }
  if(sort==='statut'){
    const order={planifie:0,idee:1,fait:2};
    const sorted=[...items].sort((a,b)=>(order[getItemStatut(a)]||1)-(order[getItemStatut(b)]||1));
    const blk=document.createElement('div');blk.className='city-section';
    blk.innerHTML='<div class="city-header"><div class="city-icon">🏷️</div><div class="city-name">Par statut</div><span class="city-count">'+sorted.length+'</span></div>';
    const vm0=viewMode[type]||'liste';
    if(vm0==='galerie'){const g=document.createElement('div');g.className='gallery-grid';sorted.forEach((item,idx)=>{const c=makeGalleryCard(item);c.style.animationDelay=idx*0.04+'s';g.appendChild(c);});blk.appendChild(g);}
    else{sorted.forEach((item,idx)=>{const c=makeCard(item);c.style.animationDelay=idx*0.04+'s';blk.appendChild(c);});}
    cont.appendChild(blk);return;
  }
  if(sort==='envie'){
    const sorted=[...items].sort((a,b)=>((b.matis||0)+(b.lise||0))-((a.matis||0)+(a.lise||0)));
    const blk=document.createElement('div');blk.className='city-section';
    blk.innerHTML='<div class="city-header"><div class="city-icon">⭐</div><div class="city-name">Par envie</div><span class="city-count">'+sorted.length+'</span></div>';
    const vmE=viewMode[type]||'liste';
    if(vmE==='galerie'){const g=document.createElement('div');g.className='gallery-grid';sorted.forEach((item,idx)=>{const c=makeGalleryCard(item);c.style.animationDelay=idx*0.05+'s';g.appendChild(c);});blk.appendChild(g);}
    else{sorted.forEach((item,idx)=>{const c=makeCard(item);c.style.animationDelay=idx*0.05+'s';blk.appendChild(c);});}
    cont.appendChild(blk);return;
  }
  const gk=sort==='quartier'?'quartier':'ville';
  const groups={};
  items.forEach(item=>{const k=item[gk]||'Autre';if(!groups[k])groups[k]=[];groups[k].push(item);});
  Object.entries(groups).sort(([a],[b])=>a.localeCompare(b,'fr')).forEach(([key,grp])=>{
    const blk=document.createElement('div');blk.className='city-section';
    const ico=sort==='ville'?(VILLE_IC[key]||'📍'):'📌';
    blk.innerHTML=`<div class="city-header"><div class="city-icon">${ico}</div><div class="city-name">${esc(key)}</div><span class="city-count">${grp.length}</span></div>`;
    const vmG=viewMode[type]||'liste';
    if(vmG==='galerie'){const g=document.createElement('div');g.className='gallery-grid';grp.forEach((item,idx)=>{const c=makeGalleryCard(item);c.style.animationDelay=idx*0.04+'s';g.appendChild(c);});blk.appendChild(g);}
    else{grp.forEach((item,idx)=>{const c=makeCard(item);c.style.animationDelay=idx*0.04+'s';blk.appendChild(c);});}
    cont.appendChild(blk);
  });
}

const CITY_IMG={
  'Shanghai':'https://images.unsplash.com/photo-1537524337987-af2b83e7d96d?w=400&q=70&auto=format&fit=crop',
  'Chongqing':'https://images.unsplash.com/photo-1567018759895-d78b0b82d9c0?w=400&q=70&auto=format&fit=crop',
  'Chengdu':'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=400&q=70&auto=format&fit=crop',
  'Zhangjiajie':'https://images.unsplash.com/photo-1518599807935-37015b9cefcb?w=400&q=70&auto=format&fit=crop',
  'Karst de Wulong':'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&q=70&auto=format&fit=crop',
  'Furong':'https://images.unsplash.com/photo-1590010265989-cb28e35c0c06?w=400&q=70&auto=format&fit=crop',
};

function extractImageUrl(raw=''){
  if(!raw) return '';
  const imgMatch = raw.match(/IMG:([^|\n]+)/i);
  if(imgMatch) return imgMatch[1].trim();
  const urlMatch = raw.match(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"']*)?/i);
  if(urlMatch) return urlMatch[0].trim();
  return '';
}

function getItemImage(item){
  return extractImageUrl(item.notes||'') || extractImageUrl(item.description||'') || CITY_IMG[item.ville] || '';
}
function itemShouldCountInBudget(item){
  if(!item || parseFloat(item.prix||0)<=0) return false;
  if(['hotel','transport'].includes(item.type)) return !!item.fait;
  const inPlanning = D.slots.some(s=>s.item_id===item.id);
  return !!item.fait || inPlanning;
}
function getExistingBudgetForItem(itemId){
  return D.budget.find(b=>b.item_id===itemId);
}

function buildAmapUrl(item){
  if(item && item.mapUrl && String(item.mapUrl).trim()) return item.mapUrl;

  const q = (item && item.adresse_cn && String(item.adresse_cn).trim())
    || [item && item.nom, item && item.ville, item && item.adresse].filter(Boolean).join(' ').trim();

  if(!q) return '';
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}`;
}
function openAmap(item){
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const webUrl = buildAmapUrl(item, 'web');
  const appUrl = isAndroid
    ? buildAmapUrl(item, 'app')
    : isIOS
      ? buildAmapUrl(item, 'ios')
      : webUrl;

  if(!appUrl) return;

  if(!isAndroid && !isIOS){
    window.open(webUrl, '_blank');
    return;
  }

  const start = Date.now();
  window.location.href = appUrl;

  setTimeout(() => {
    // si l'app ne s'est pas ouverte, fallback web
    if(Date.now() - start < 1400){
      window.location.href = webUrl;
    }
  }, 900);
}
function makeGalleryCard(item){
  const d=document.createElement('div');
  const statut=getItemStatut(item);
  const priorite=getItemPriorite(item);
  const duree=getItemDuree(item);
  d.className='gc statut-'+statut;

  const prix=parseFloat(item.prix||0);
  const nuits=parseInt(item.prix_type||1)||1;
  const totalAffiche=item.type==='hotel'&&prix>0?prix*nuits:prix;
  const prioIcon={coeur:'⭐',sympa:'👍',optionnel:'🤷'}[priorite]||'';
  const typePill={activite:'🎯',restaurant:'🍜',cafe:'☕',hotel:'🏨'}[item.type]||'📍';

  // Drag pour idées activités
  if(item.type==='activite'&&statut==='idee'){
    d.draggable=true;
    d.addEventListener('dragstart',e=>{dragItemId=item.id;const z=document.getElementById('dragToPlanZone');if(z)z.classList.add('active');e.dataTransfer.effectAllowed='copy';});
    d.addEventListener('dragend',()=>{const z=document.getElementById('dragToPlanZone');if(z){z.classList.remove('active');z.classList.remove('drag-over');}dragItemId=null;});
  }

  const statutBtns=`<div class="gc-stat-btns" onclick="event.stopPropagation()">
    <button class="gc-stat-btn${statut==='idee'?' active-idee':''}" onclick="setStatut('${item.id}','idee')">💡</button>
    <button class="gc-stat-btn${statut==='planifie'?' active-planifie':''}" onclick="setStatut('${item.id}','planifie')">📅</button>
    <button class="gc-stat-btn${statut==='fait'?' active-fait':''}" onclick="setStatut('${item.id}','fait')">✅</button>
  </div>`;

  d.innerHTML=`
    <div class="gc-img-placeholder">${prioIcon||typePill}</div>
    <div class="gc-body">
      <div class="gc-name">${esc(item.nom)}</div>
      <div class="gc-tags">
        ${item.ville?`<span class="gc-tag tag-city">${esc(item.ville)}</span>`:''}
        ${item.quartier&&item.quartier!=='À définir'?`<span class="gc-tag tag-q">${esc(item.quartier)}</span>`:''}
        ${duree?`<span class="gc-tag" style="background:#f5f3ff;color:#6d28d9;">⏱ ${esc(duree)}</span>`:''}
      </div>
      <div class="gc-footer">
        <span class="gc-price">${prix>0?fmtE(totalAffiche):'Gratuit'}</span>
        <span class="gc-statut ${statut}">${statut==='idee'?'💡':''}${statut==='planifie'?'📅':''}${statut==='fait'?'✅':''}</span>
        ${prioIcon?`<span class="gc-prio">${prioIcon}</span>`:''}
      </div>
      ${statutBtns}
    </div>`;

  d.onclick=()=>openItemSheet(item.type,item);
  return d;
}

function makeCard(item){
  const d=document.createElement('div');d.className='ic';
  const prix=parseFloat(item.prix||0);
  const typePill={activite:'🎯',restaurant:'🍜',cafe:'☕',hotel:'🏨'}[item.type]||'📍';
  const nuits=parseInt(item.prix_type||1)||1;
  const totalAffiche=item.type==='hotel'&&prix>0?prix*nuits:prix;
  const metaRight=item.type==='hotel'?(nuits+` nuit${nuits>1?'s':''}`):(item.prix_type||'');
  const cleanDesc=esc(String(item.description||'').replace(/IMG:[^|]+/ig,'').replace(/\s+\|\s+/g,' · ').trim());
  const hasAmap = !!buildAmapUrl(item, 'web');
  // Pas d'image dans les cards

  // Distance depuis ma position
  const distKm=getDistFromMe(item);
  const distBadge=distKm!==null?(distKm<0.5?`<span class="proche-badge">📍 ${Math.round(distKm*1000)}m</span>`:distKm<2?`<span class="proche-badge" style="background:#f0fdf4;color:#166534;">📍 ${Math.round(distKm*10)/10}km</span>`:''):'';

  const statut=getItemStatut(item);
  const priorite=getItemPriorite(item);
  const duree=getItemDuree(item);

  // Statut pill
  const statutPills={idee:'💡 Idée',planifie:'📅 Planifié',fait:'✅ Fait'};
  const statutPill=`<span class="statut-pill ${statut}">${statutPills[statut]||'💡 Idée'}</span>`;

  // Priorité icon
  const prioIcon={coeur:'⭐',sympa:'👍',optionnel:'🤷'}[priorite]||'';

  // Durée badge
  const dureeBadge=duree?`<span class="tag tt" style="background:#f5f3ff;color:#6d28d9;">⏱ ${esc(duree)}</span>`:'';

  // Statut class on card
  d.classList.add('statut-'+statut);

  // Enable drag for activites
  if(item.type==='activite'&&statut==='idee'){
    d.draggable=true;
    d.addEventListener('dragstart',e=>{
      dragItemId=item.id;
      const zone=document.getElementById('dragToPlanZone');
      if(zone)zone.classList.add('active');
      e.dataTransfer.effectAllowed='copy';
    });
    d.addEventListener('dragend',()=>{
      const zone=document.getElementById('dragToPlanZone');
      if(zone){zone.classList.remove('active');zone.classList.remove('drag-over');}
      dragItemId=null;
    });
  }

  d.innerHTML=`
    <div class="ic-hero">${prioIcon||typePill}</div>
    <div class="ic-body">
      <div class="ic-topline">
        <div style="flex:1;min-width:0;">
          <div class="ic-name">${esc(item.nom)}${statutPill}${distBadge}</div>
          <div class="ic-tags">
            ${item.ville?`<span class="tag tv">${esc(item.ville)}</span>`:''}
            ${item.quartier&&item.quartier!=='À définir'?`<span class="tag tq">${esc(item.quartier)}</span>`:''}
            ${dureeBadge}
            ${metaRight&&!['nuit','gratuit',''].includes(String(metaRight).toLowerCase())?`<span class="tag tt">${esc(metaRight)}</span>`:''}
          </div>
        </div>
        ${prix>0?`<div class="ic-quick">${fmtE(totalAffiche)}</div>`:''}
      </div>
      ${cleanDesc?`<div class="ic-desc">${cleanDesc}</div>`:''}
      <div class="ic-bottom">
        <div class="ic-prix">${prix>0?fmtE(totalAffiche):'Gratuit'}${prix>0?`<small>${item.type==='hotel'?'total estimé':item.type==='restaurant'?'par repas':item.type==='cafe'?'par stop':'estimé'}</small>`:''}</div>
        <div class="stars-row">
          <span class="slbl2">M</span><div class="stars">${starsRO(item.matis)}</div>
          <span class="slbl2">L</span><div class="stars">${starsRO(item.lise)}</div>
        </div>
        ${hasAmap ? `<button class="map-link" type="button" onclick="event.stopPropagation(); openAmap(${encodeURIComponent(JSON.stringify(item)).replace(/'/g, '%27')})">🗺 Amap</button>` : ''}
      </div>
      <!-- Statut toggle -->
      <div class="statut-toggle" onclick="event.stopPropagation()">
        <button class="st-btn-state${statut==='idee'?' active-idee':''}" onclick="setStatut('${item.id}','idee')">💡 Idée</button>
        <button class="st-btn-state${statut==='planifie'?' active-planifie':''}" onclick="setStatut('${item.id}','planifie')">📅 Planifié</button>
        <button class="st-btn-state${statut==='fait'?' active-fait':''}" onclick="setStatut('${item.id}','fait')">✅ Fait</button>
      </div>
      <!-- Priorité (activités seulement) -->
      ${item.type==='activite'?`<div class="priorite-row" onclick="event.stopPropagation()">
        <button class="prio-btn${priorite==='coeur'?' active':''}" onclick="setPriorite('${item.id}','coeur')">⭐ Coup de cœur</button>
        <button class="prio-btn${priorite==='sympa'?' active':''}" onclick="setPriorite('${item.id}','sympa')">👍 Sympa</button>
        <button class="prio-btn${priorite==='optionnel'?' active':''}" onclick="setPriorite('${item.id}','optionnel')">🤷 Optionnel</button>
      </div>
      <div class="duree-row" onclick="event.stopPropagation()">
        <button class="duree-btn${duree==='30min'?' active':''}" onclick="setDuree('${item.id}','30min')">⚡ 30min</button>
        <button class="duree-btn${duree==='1h'?' active':''}" onclick="setDuree('${item.id}','1h')">⏱ 1h</button>
        <button class="duree-btn${duree==='2h+'?' active':''}" onclick="setDuree('${item.id}','2h+')">🕐 2h+</button>
        ${duree?`<button class="duree-btn" onclick="setDuree('${item.id}','')">✕</button>`:''}
      </div>`:''}
    </div>`;

  if(hasAmap){
    const mapBtn=d.querySelector('.map-link');
    if(mapBtn){mapBtn.addEventListener('click',(e)=>{e.stopPropagation();openAmap(item);});}
  }
  d.onclick=()=>openItemSheet(item.type,item);return d;
}
function starsRO(v){let h='';for(let i=1;i<=5;i++)h+=`<span class="star${i<=(v||0)?' on':''}">★</span>`;return h;}

// ── ITEM SHEET ──
function openItemSheet(type, item = null){
  // Visiteur : peut voir les détails mais pas créer
  const readOnly = !isEditorMode();
  if(readOnly && !item){showToast('👁️ Mode visiteur — lecture seule');return;}
  document.getElementById('item-sheet-inner').innerHTML = buildItemForm(type, item, readOnly);
  openOverlay('item-overlay');
}
function buildItemForm(type, item, readOnly=false) {
  const isNew = !item;
  const v = k => item ? esc(item[k] || '') : '';
  const n = k => item ? (item[k] || 0) : 0;
  const id = item ? item.id : '';
  const roAttr = readOnly ? ' readonly disabled style="opacity:.7;pointer-events:none;"' : '';
  const title = isNew && !readOnly ? `Ajouter ${TYPE_LABEL[type] || ''}` : TYPE_LABEL[type] || (readOnly?'Détail':'Modifier');
  const amapF = `
    <div class="form-group">
      <div class="form-label">Lien Amap</div>
      <input class="form-input" id="if-mapurl" value="${v('mapUrl')}" placeholder="https://uri.amap.com/search?keyword=...">
    </div>
  `;
  const adresseCnF = `
  <div class="form-group">
    <div class="form-label">Adresse en chinois</div>
    <input class="form-input" id="if-adresse-cn" value="${v('adresse_cn')}" placeholder="上海市黄浦区中山东一路...">
  </div>
`;

  // Préparation des variables communes
  const RO=readOnly?' readonly disabled style="opacity:.65;pointer-events:none;background:var(--sand);"':'';
  const commonTop = `<div class="sheet-handle"></div><div class="sheet-title">${title}</div>
    <input type="hidden" id="if-id" value="${id}"><input type="hidden" id="if-type" value="${type}">
    <div class="form-group"><div class="form-label">Nom</div><input class="form-input" id="if-nom" value="${v('nom')}" placeholder="Nom…"${RO}></div>
    <div class="form-group"><div class="form-label">Ville</div>
      <select class="form-input" id="if-ville"${RO}><option value="">Ville…</option>${VILLES.map(vi => `<option ${item && item.ville === vi ? 'selected' : ''}>${vi}</option>`).join('')}</select>
    </div>
    <div class="form-group"><div class="form-label">Quartier</div><input class="form-input" id="if-quartier" value="${v('quartier')}" placeholder="ex: Pudong…"${RO}></div>
    <div class="form-group"><div class="form-label">Description</div><input class="form-input" id="if-desc" value="${v('description')}" placeholder="Description…"${RO}></div>`;

  const starsF = who => `<div><div class="form-label">${who === 'matis' ? 'Matis' : 'Lise'} ⭐</div>
    <div class="stars" id="sf-${who}">${[1, 2, 3, 4, 5].map(s => `<span class="star-edit${s <= n(who) ? ' on' : ''}" onclick="setStar('${who}',${s})">★</span>`).join('')}</div>
    <input type="hidden" id="if-${who}" value="${n(who)}"></div>`;

  const bottom = `<div class="row-2">${starsF('matis')}${starsF('lise')}</div>
    <div class="form-group"><div class="form-label">Notes perso</div><input class="form-input" id="if-notes" value="${v('notes').replace(/IMG:[^|]+\|?/ig,'').trim()}" placeholder="Notes…"></div>
    <div class="form-group">
      <div class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
        <span>📍 Coordonnées GPS</span>
        <button type="button" onclick="geocodeItem()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:.65rem;font-weight:600;cursor:pointer;font-family:var(--font);">🔍 Géocoder</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
        <input class="form-input" id="if-lat" type="number" step="0.000001" value="${n('lat')||''}" placeholder="Latitude ex: 31.2304">
        <input class="form-input" id="if-lng" type="number" step="0.000001" value="${n('lng')||''}" placeholder="Longitude ex: 121.4737">
      </div>
      <div id="geocode-status" style="font-size:.65rem;color:var(--txt2);margin-top:4px;min-height:16px;"></div>
    </div>
    <div class="form-group"><div class="form-label">Statut</div>
      <select class="form-input" id="if-statut">
        <option value="idee" ${(!item||!item.statut||item.statut==='idee')?'selected':''}>💡 Idée — on pourrait faire</option>
        <option value="planifie" ${item&&item.statut==='planifie'?'selected':''}>📅 Planifié — on va faire</option>
        <option value="fait" ${item&&(item.statut==='fait'||item.fait)?'selected':''}>✅ Fait — on a fait</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Priorité</div>
      <select class="form-input" id="if-priorite">
        <option value="" ${!item||!item.priorite?'selected':''}>— Non définie</option>
        <option value="coeur" ${item&&item.priorite==='coeur'?'selected':''}>⭐ Coup de cœur — must do</option>
        <option value="sympa" ${item&&item.priorite==='sympa'?'selected':''}>👍 Sympa — si l'occasion</option>
        <option value="optionnel" ${item&&item.priorite==='optionnel'?'selected':''}>🤷 Optionnel — bof</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Durée estimée</div>
      <select class="form-input" id="if-duree-est">
        <option value="" ${!item||!item.duree?'selected':''}>— Non définie</option>
        <option value="30min" ${item&&item.duree==='30min'?'selected':''}>⚡ 30 min</option>
        <option value="1h" ${item&&item.duree==='1h'?'selected':''}>⏱ 1 heure</option>
        <option value="2h+" ${item&&item.duree==='2h+'?'selected':''}>🕐 2h+</option>
      </select>
    </div>
    ${!readOnly ? `<button class="btn-primary" onclick="saveItem()">Enregistrer</button>` : ''}
    ${!isNew && !readOnly ? `<button class="btn-danger" onclick="deleteItem()">Supprimer</button>` : ''}
    <button class="btn-cancel" onclick="closeOverlay('item-overlay')">${readOnly?'Fermer':'Annuler'}</button>
    <div style="height:4px;"></div>`;

  // --- SECTION TRANSPORT ---
  if (type === 'transport') {
    const nts = v('notes');
    const tType = item ? item.prix_type : '✈️ Vol'; // Correction : définition de tType

    return `<div class="sheet-handle"></div><div class="sheet-title">${title}</div>
      <input type="hidden" id="if-id" value="${id}"><input type="hidden" id="if-type" value="transport">
      <div class="form-group"><div class="form-label">Trajet</div><input class="form-input" id="if-nom" value="${v('nom')}" placeholder="Paris → Shanghai…"></div>
      <div class="row-2">
        <div class="form-group">
          <div class="form-label">Départ (Heure + Fuseau)</div>
          <div style="display:flex;gap:4px;">
            <input class="form-input" id="if-dep" value="${v('quartier')}" placeholder="20h20" style="flex:2;">
            <select class="form-input" id="if-tz-dep" style="flex:1.5;padding:5px;font-size:0.7rem;">
              <option value="🇫🇷 FR" ${nts.includes('D:🇫🇷 FR') ? 'selected' : ''}>🇫🇷 FR</option>
              <option value="🇨🇳 CN" ${nts.includes('D:🇨🇳 CN') ? 'selected' : ''}>🇨🇳 CN</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">Arrivée (Heure + Fuseau)</div>
          <div style="display:flex;gap:4px;">
            <input class="form-input" id="if-arr" value="${v('description')}" placeholder="15h10" style="flex:2;">
            <select class="form-input" id="if-tz-arr" style="flex:1.5;padding:5px;font-size:0.7rem;">
              <option value="🇨🇳 CN" ${nts.includes('A:🇨🇳 CN') ? 'selected' : ''}>🇨🇳 CN</option>
              <option value="🇫🇷 FR" ${nts.includes('A:🇫🇷 FR') ? 'selected' : ''}>🇫🇷 FR</option>
            </select>
          </div>
          <select class="form-input" id="if-day-rel" style="margin-top:5px; font-size:0.7rem;">
            <option value="" ${!nts.includes('J+') ? 'selected' : ''}>Même jour</option>
            <option value=" (J+1)" ${nts.includes('J+1') ? 'selected' : ''}>Arrivée Lendemain (J+1)</option>
          </select>
        </div>
      </div>
      <div class="form-group"><div class="form-label">Durée du trajet</div><input class="form-input" id="if-duree" value="${nts.split('Durée: ')[1] || ''}" placeholder="11h50"></div>
      <div class="form-group"><div class="form-label">Date de départ</div><input class="form-input" id="if-date" type="date" value="${v('adresse')}"></div>
      <div class="form-group"><div class="form-label">Prix total (€)</div>${readOnly?'<div class="form-input" style="background:var(--sand);color:var(--txt2);">***€</div>':`<input class="form-input" id="if-prix" type="number" value="${n('prix')||''}">`}</div>
      <div class="form-group"><div class="form-label">Type de transport</div>
        <select class="form-input" id="if-prix-type">
          <option value="✈️ Vol" ${tType === '✈️ Vol' ? 'selected' : ''}>✈️ Vol</option>
          <option value="🚂 Train" ${tType === '🚂 Train' ? 'selected' : ''}>🚂 Train</option>
          <option value="🚌 Bus" ${tType === '🚌 Bus' ? 'selected' : ''}>🚌 Bus</option>
          <option value="🚗 Taxi" ${tType === '🚗 Taxi' ? 'selected' : ''}>🚗 Taxi / DiDi</option>
        </select>
      </div>
      <!-- Adresses gare / aéroport -->
      <div style="background:var(--sand);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:10px;">📍 Gares / Aéroports (pour la carte)</div>
        <div class="row-2">
          <div class="form-group" style="margin-bottom:8px;">
            <div class="form-label">Départ — nom du lieu</div>
            <input class="form-input" id="if-dep-addr" value="${(nts.match(/DEP_ADDR:([^|]+)/)||['',''])[1].trim()}" placeholder="Aéroport CDG, Gare Lyon…">
          </div>
          <div class="form-group" style="margin-bottom:8px;">
            <div class="form-label">Arrivée — nom du lieu</div>
            <input class="form-input" id="if-arr-addr" value="${(nts.match(/ARR_ADDR:([^|]+)/)||['',''])[1].trim()}" placeholder="Aéroport Pudong, Gare Nord…">
          </div>
        </div>
        <div class="row-2">
          <div class="form-group" style="margin-bottom:0;">
            <div class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Coords départ</span>
              <button type="button" onclick="geocodeTransportPoint('dep')" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:2px 8px;font-size:.6rem;cursor:pointer;font-family:var(--font);">🔍</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;">
              <input class="form-input" id="if-dep-lat" type="number" step="0.000001" value="${(nts.match(/DEP_LAT:([\d.,-]+)/)||['',''])[1]}" placeholder="Lat">
              <input class="form-input" id="if-dep-lng" type="number" step="0.000001" value="${(nts.match(/DEP_LNG:([\d.,-]+)/)||['',''])[1]}" placeholder="Lng">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <div class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Coords arrivée</span>
              <button type="button" onclick="geocodeTransportPoint('arr')" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:2px 8px;font-size:.6rem;cursor:pointer;font-family:var(--font);">🔍</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;">
              <input class="form-input" id="if-arr-lat" type="number" step="0.000001" value="${(nts.match(/ARR_LAT:([\d.,-]+)/)||['',''])[1]}" placeholder="Lat">
              <input class="form-input" id="if-arr-lng" type="number" step="0.000001" value="${(nts.match(/ARR_LNG:([\d.,-]+)/)||['',''])[1]}" placeholder="Lng">
            </div>
          </div>
        </div>
        <div id="geocode-transport-status" style="font-size:.62rem;color:var(--txt2);margin-top:6px;min-height:14px;"></div>
      </div>
      <div class="form-group" style="background: rgba(39, 174, 96, 0.1); padding: 10px; border-radius: 10px; border: 1px solid rgba(39, 174, 96, 0.3); margin-top: 15px; margin-bottom: 15px;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; font-size: 0.85rem; color: #2ecc71;">
          <input type="checkbox" id="if-fait" ${item && item.fait ? 'checked' : ''} style="width: 18px; height: 18px;"> ✅ Billet réservé / payé ?
        </label>
      </div>
      <input type="hidden" id="if-file-data" value="">
      ${!readOnly?'<button class="btn-primary" onclick="saveItem()">Enregistrer</button>':''}
      ${!isNew&&!readOnly?`<button class="btn-danger" onclick="deleteItem()">Supprimer</button>`:''}
      <button class="btn-cancel" onclick="closeOverlay('item-overlay')">${readOnly?'Fermer':'Annuler'}</button>`;
  }

  // --- SECTION HOTEL ---
  if (type === 'hotel') {
    return commonTop + `
      <div class="row-2">
        <div class="form-group">
          <div class="form-label">Prix / nuit (€)</div>
          ${readOnly?'<div class="form-input" style="background:var(--sand);color:var(--txt2);">***€</div>':`<input class="form-input" id="if-prix" type="number" value="${n('prix')||''}" placeholder="0.00">`}
        </div>
        <div class="form-group">
          <div class="form-label">Nb de nuits</div>
          ${readOnly?'<div class="form-input" style="background:var(--sand);color:var(--txt2);">***</div>':`<input class="form-input" id="if-nuits" type="number" value="${item && item.prix_type ? parseInt(item.prix_type) || 1 : 1}" placeholder="1">`}
        </div>
      </div>
  
      <div class="form-group">
        <div class="form-label">Check-in</div>
        <input class="form-input" id="if-checkin" type="date" value="${v('adresse')}">
      </div>
  
      ${adresseCnF}
  
      <div class="form-group" style="background: rgba(39, 174, 96, 0.1); padding: 10px; border-radius: 10px; border: 1px solid rgba(39, 174, 96, 0.3); margin-bottom: 15px;">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; font-size: 0.85rem; color: #2ecc71;">
          <input type="checkbox" id="if-fait" ${item && item.fait ? 'checked' : ''} style="width: 18px; height: 18px;"> ✅ Chambre réservée ?
        </label>
      </div>
  
      <input type="hidden" id="if-file-data" value="">
      ${bottom}`;
  }


// --- LOGIQUE RESTO / ACTIVITÉ ---
  const prixLabel = type === 'restaurant'
    ? 'Prix moyen / pers. (€)'
    : type === 'cafe'
      ? 'Prix moyen (€)'
      : 'Prix estimé (€)';
  
  const typeSel = type === 'restaurant'
    ? `<div class="form-group">
         <div class="form-label">Type de repas</div>
         <select class="form-input" id="if-moment">
           <option value="">Indifférent</option>
           <option value="Déjeuner" ${item && item.prix_type === 'Déjeuner' ? 'selected' : ''}>🌞 Déjeuner</option>
           <option value="Dîner" ${item && item.prix_type === 'Dîner' ? 'selected' : ''}>🌙 Dîner</option>
         </select>
       </div>`
    : type === 'cafe'
      ? `<div class="form-group">
           <div class="form-label">Type de lieu</div>
           <select class="form-input" id="if-moment">
             <option value="">Indifférent</option>
             <option value="Café" ${item && item.prix_type === 'Café' ? 'selected' : ''}>☕ Café</option>
             <option value="Bar" ${item && item.prix_type === 'Bar' ? 'selected' : ''}>🍸 Bar</option>
           </select>
         </div>`
      : `<div class="form-group">
           <div class="form-label">Meilleur moment</div>
           <select class="form-input" id="if-moment">
             <option value="">Indifférent</option>
             ${MOMENTS.filter(Boolean).map(m => `<option ${item && item.prix_type === m ? 'selected' : ''}>${m}</option>`).join('')}
           </select>
         </div>`;
  
  return commonTop + `
    <div class="row-2">
      <div class="form-group">
        <div class="form-label">${prixLabel}</div>
        ${readOnly?'<div class="form-input" style="background:var(--sand);color:var(--txt2);">***€</div>':`<input class="form-input" id="if-prix" type="number" value="${n('prix')||''}" placeholder="0.00">`}
      </div>
      <div class="form-group">
        <div class="form-label">Adresse</div>
        <input class="form-input" id="if-adresse" value="${v('adresse')}" placeholder="Adresse…">
      </div>
    </div>
  
    ${adresseCnF}
    ${typeSel}
  
    <div class="form-group" style="background: rgba(255, 90, 95, 0.08); padding: 10px; border-radius: 14px; border: 1px solid rgba(255, 90, 95, 0.16); margin-bottom: 15px;">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;font-size:.82rem;color:#ff5a5f;">
        <input type="checkbox" id="if-fait" ${item && item.fait ? 'checked' : ''} style="width:18px;height:18px;"> ✅ Déjà fait / payé
      </label>
    </div>
  
    ${bottom}`;
}
function setStar(who,val){
  document.getElementById('if-'+who).value=val;
  document.getElementById('sf-'+who).querySelectorAll('.star-edit').forEach((s,i)=>s.classList.toggle('on',i<val));
}
async function saveItem() {
  if(!isEditorMode()){
  showToast('🔒 Mode lecteur');
  return;
}
    const type = document.getElementById('if-type').value;
    const id = document.getElementById('if-id').value;
    const nom = document.getElementById('if-nom')?.value || '';
    const fait = document.getElementById('if-fait')?.checked || false;
    const prix = parseFloat(document.getElementById('if-prix')?.value || 0);
    const notes = document.getElementById('if-notes')?.value || '';
    const imageUrl = document.getElementById('if-image')?.value?.trim() || '';
    const mergedNotes = [imageUrl ? `IMG:${imageUrl}` : '', notes].filter(Boolean).join(' | ');
    const matis = parseInt(document.getElementById('if-matis')?.value || 0);
    const lise = parseInt(document.getElementById('if-lise')?.value || 0);
    const adresseCn = document.getElementById('if-adresse-cn')?.value?.trim() || '';

    let payload = { type, nom, fait };

    if (type === 'transport') {
      const tzDep = document.getElementById('if-tz-dep')?.value || '🇫🇷 FR';
      const tzArr = document.getElementById('if-tz-arr')?.value || '🇨🇳 CN';
      const dayRel = document.getElementById('if-day-rel')?.value || '';
      const duree = document.getElementById('if-duree')?.value || '';

      const depAddr=document.getElementById('if-dep-addr')?.value?.trim()||'';
      const arrAddr=document.getElementById('if-arr-addr')?.value?.trim()||'';
      const depLat=document.getElementById('if-dep-lat')?.value?.trim()||'';
      const depLng=document.getElementById('if-dep-lng')?.value?.trim()||'';
      const arrLat=document.getElementById('if-arr-lat')?.value?.trim()||'';
      const arrLng=document.getElementById('if-arr-lng')?.value?.trim()||'';
      let notesTransport = `D:${tzDep} | A:${tzArr}${dayRel} | Durée: ${duree}`;
      if(depAddr)notesTransport+=` | DEP_ADDR:${depAddr}`;
      if(depLat&&depLng)notesTransport+=` | DEP_LAT:${depLat} | DEP_LNG:${depLng}`;
      if(arrAddr)notesTransport+=` | ARR_ADDR:${arrAddr}`;
      if(arrLat&&arrLng)notesTransport+=` | ARR_LAT:${arrLat} | ARR_LNG:${arrLng}`;

      payload = {
        type: 'transport',
        nom,
        adresse: document.getElementById('if-date')?.value || '',
        quartier: document.getElementById('if-dep')?.value || '',
        description: document.getElementById('if-arr')?.value || '',
        notes: notesTransport,
        prix,
        prix_type: document.getElementById('if-prix-type')?.value || '',
        matis: 0,
        lise: 0,
        fait,
  
      };
    } else if (type === 'hotel') {
      const nuits = parseInt(document.getElementById('if-nuits')?.value || 1);

      payload = {
        type: 'hotel',
        nom,
        ville: document.getElementById('if-ville')?.value || '',
        quartier: document.getElementById('if-quartier')?.value || '',
        description: document.getElementById('if-desc')?.value || '',
        adresse: document.getElementById('if-checkin')?.value || '',
        prix,
        prix_type: String(nuits),
        notes: [imageUrl ? `IMG:${imageUrl}` : '', document.getElementById('if-lien')?.value || '', notes].filter(Boolean).join(' | '),
        matis,
        lise,
        fait,
        adresse_cn: adresseCn,
        lat: parseFloat(document.getElementById('if-lat')?.value)||null,
        lng: parseFloat(document.getElementById('if-lng')?.value)||null
      };
    } else {
      payload = {
        type,
        nom,
        ville: document.getElementById('if-ville')?.value || '',
        quartier: document.getElementById('if-quartier')?.value || '',
        description: document.getElementById('if-desc')?.value || '',
        adresse: document.getElementById('if-adresse')?.value || '',
        prix,
        prix_type: document.getElementById('if-moment')?.value || '',
        notes: mergedNotes,
        matis,
        lise,
        fait,
        adresse_cn: adresseCn,
        statut: document.getElementById('if-statut')?.value || 'idee',
        priorite: document.getElementById('if-priorite')?.value || '',
        duree: document.getElementById('if-duree-est')?.value || '',
        lat: parseFloat(document.getElementById('if-lat')?.value)||null,
        lng: parseFloat(document.getElementById('if-lng')?.value)||null
      };
    }

    let savedId = id;

      if (id) {
        const { error } = await sb
          .from('items')
          .update(payload)
          .eq('id', id);
      
        if (error) {
          console.error('Erreur update items:', error);
          alert('Erreur update items : ' + error.message);
          return;
        }
      } else {
        const { data, error } = await sb
          .from('items')
          .insert(payload)
          .select('id')
          .single();
      
        if (error) {
          console.error('Erreur insert items:', error);
          alert('Erreur insert items : ' + error.message);
          return;
        }
      
        savedId = data?.id;
}

    const finalId = savedId || id;
    const currentItem = { id: finalId, type, prix, fait, nom };
    const nuitsBudget = type === 'hotel' ? parseInt(document.getElementById('if-nuits')?.value || 1) : 1;
    const existingBudget = getExistingBudgetForItem(finalId);

    if (itemShouldCountInBudget(currentItem)) {
      await syncItemBudget(finalId, type, nom, prix, nuitsBudget);
    } else if (existingBudget) {
      await sb.from('budget').delete().eq('id', existingBudget.id);
    }

    closeOverlay('item-overlay');
  }
async function syncItemBudget(itemId,type,nom,prix,nuits=1,personne='les deux'){
  if(!(parseFloat(prix)||0)) return;
  const total=type==='hotel'?prix*nuits:prix;
  const catMap={hotel:'🏨 Hôtel',activite:'🎯 Activité / Entrée',restaurant:'🍽️ Restaurant',cafe:'☕ Café / Bar',transport:'🚄 Transport'};
  const existing=D.budget.find(b=>b.item_id===itemId);
  const payload={categorie:catMap[type]||'💸 Divers',description:nom,total,source:type,item_id:itemId,personne};
  if(existing)await sb.from('budget').update(payload).eq('id',existing.id);
  else await sb.from('budget').insert(payload);
}
async function deleteItem(){
  if(!isEditorMode()){
  showToast('🔒 Mode lecteur');
  return;
}
  const id=document.getElementById('if-id').value;if(!id)return;
  await sb.from('items').delete().eq('id',id);
  const bud=D.budget.find(b=>b.item_id===id);if(bud)await sb.from('budget').delete().eq('id',bud.id);
  await sb.from('planning_slots').delete().eq('item_id',id);
  closeOverlay('item-overlay');
}

// ── PLANNING ──
const DUREE_MIN={'30min':30,'1h':60,'2h+':120};
const JOURNEE_DISPO_MIN=8*60; // 8h de temps disponible par journée

function switchPlanView(v){
  document.getElementById('tlWrap').style.display=v==='timeline'?'':'none';
  document.getElementById('calWrap').style.display=v==='cal'?'':'none';
  document.getElementById('pvs-timeline').classList.toggle('on',v==='timeline');
  document.getElementById('pvs-cal').classList.toggle('on',v==='cal');
  if(v==='cal')renderCalendar();
}

function getDayUsedMin(day){
  const slots=D.slots.filter(s=>s.planning_id===day.id);
  const items=slots.map(s=>D.items.find(x=>x.id===s.item_id)).filter(Boolean);
  return items.reduce((sum,item)=>{
    const d=item.duree||'';
    return sum+(DUREE_MIN[d]||60); // défaut 1h si pas défini
  },0);
}

function renderCalendar(){
  const wrap=document.getElementById('calWrap');
  if(!wrap)return;
  wrap.innerHTML='';

  // Trouver min/max dates
  const dates=D.planning.map(p=>p.date_voyage).filter(Boolean).sort();
  if(!dates.length){wrap.innerHTML='<div style="padding:24px;text-align:center;color:var(--txt2);">Aucun jour planifié</div>';return;}

  // Partir du 7 novembre (2 jours avant le départ)
  const start=new Date('2026-11-07T00:00:00');
  const end=new Date(dates[dates.length-1]+'T00:00:00');

  // Trouver le lundi de la semaine de départ
  const startMon=new Date(start);
  const dow=startMon.getDay()||7;
  startMon.setDate(startMon.getDate()-(dow-1));

  const todayStr=new Date().toISOString().split('T')[0];

  const h=document.createElement('div');
  h.innerHTML='<div class="cal-header"><span class="cal-wday">Lun</span><span class="cal-wday">Mar</span><span class="cal-wday">Mer</span><span class="cal-wday">Jeu</span><span class="cal-wday">Ven</span><span class="cal-wday">Sam</span><span class="cal-wday">Dim</span></div>';
  wrap.appendChild(h);

  const grid=document.createElement('div');grid.className='cal-grid';

  let cur=new Date(startMon);
  // Aller jusqu'à la fin + dimanche de la semaine de fin
  const endSun=new Date(end);
  const dowEnd=endSun.getDay()||7;
  endSun.setDate(endSun.getDate()+(7-dowEnd));

  while(cur<=endSun){
    const ds=cur.toISOString().split('T')[0];
    const day=D.planning.find(p=>p.date_voyage===ds);
    const cell=document.createElement('div');

    if(!day){
      // Jour hors voyage
      const inRange=ds>='2026-11-07'&&ds<=dates[dates.length-1];
      // Vérifier aussi si un transport part ce jour là
      const hasTransport=D.items.some(x=>x.type==='transport'&&x.adresse===ds);
      const inRangeFinal=inRange||hasTransport;
      const showCell=inRange||hasTransport;
      cell.className='cal-cell'+(showCell?' has-events':'  empty');
      const transportDots=D.items.filter(x=>x.type==='transport'&&x.adresse===ds).map(()=>'<div class="cal-dot transport"></div>').join('');
      cell.innerHTML='<div class="cal-day-num" style="'+(showCell?'':'opacity:.3;')+'">'+cur.getDate()+'</div>'
        +(transportDots?'<div class="cal-dots">'+transportDots+'</div>':'');
    }else{
      const slots=D.slots.filter(s=>s.planning_id===day.id);
      const items=slots.map(s=>D.items.find(x=>x.id===s.item_id)).filter(Boolean);
      const usedMin=getDayUsedMin(day);
      const overloaded=usedMin>JOURNEE_DISPO_MIN;
      const isToday=ds===todayStr;
      cell.className='cal-cell has-events'+(isToday?' today':'')+(overloaded?' overloaded':'');
      cell.title=day.jour_label||ds;

      // Points colorés par type
      const dots=items.slice(0,5).map(it=>'<div class="cal-dot '+it.type+'"></div>').join('');
      const transport=D.items.find(x=>x.type==='transport'&&x.adresse===ds);
      const city=[day.matin_lieu,day.aprem_lieu,day.soir_lieu].filter(Boolean).filter(x=>x!=='—')[0]||'';

      cell.innerHTML='<div class="cal-day-num">'+cur.getDate()+'</div>'
        +(overloaded?'<div class="cal-overload-badge">!</div>':'')
        +'<div class="cal-dots">'+(transport?'<div class="cal-dot transport"></div>':'')+dots+'</div>'
        +(city?'<div class="cal-cell-city">'+esc(city)+'</div>':'');

      cell.onclick=()=>{
        // Scroller vers ce jour dans la timeline
        switchPlanView('timeline');
        setTimeout(()=>{
          const el=document.querySelector(`.tl-day-card[data-id="${day.id}"]`);
          if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('open');}
        },120);
      };
    }
    grid.appendChild(cell);
    cur.setDate(cur.getDate()+1);
  }
  wrap.appendChild(grid);

  // Légende
  const leg=document.createElement('div');
  leg.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:12px 0 4px;font-size:.65rem;color:var(--txt2);';
  [['activite','#7c3aed','Activité'],['restaurant','#ea580c','Resto/Café'],['hotel','var(--accent)','Hôtel'],['transport','#0891b2','Transport']].forEach(([,color,lbl])=>{
    leg.innerHTML+='<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:'+color+';display:inline-block;"></span>'+lbl+'</span>';
  });
  leg.innerHTML+='<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#f87171;display:inline-block;"></span>Journée surchargée</span>';
  wrap.appendChild(leg);
}

function renderPlanning(){
  const wrap=document.getElementById('tlWrap');wrap.innerHTML='';
  const meteoDiv=document.createElement('div');meteoDiv.className='meteo-card';
  meteoDiv.innerHTML=`<div class="meteo-header" onclick="toggleMeteo()"><h3>🌤 Météo novembre</h3><span id="meteo-arr" style="font-size:.7rem;color:var(--txt2);">▼</span></div><div class="meteo-body" id="meteoBody" style="display:none;"></div>`;
  wrap.appendChild(meteoDiv);
  setTimeout(loadMeteo,0);

  const START_DATE='2026-11-07';
  const realDays=[...D.planning].sort((a,b)=>(a.date_voyage||'').localeCompare(b.date_voyage||''));
  const realByDate=new Map(realDays.map(day=>[day.date_voyage,day]));
  const transportDates=D.items.filter(x=>x.type==='transport'&&x.adresse).map(x=>x.adresse);
  const lastDate=[START_DATE, ...realDays.map(d=>d.date_voyage).filter(Boolean), ...transportDates].sort().slice(-1)[0] || START_DATE;

  const weekdayLabel=(dateStr)=>{
    const names=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const d=new Date(dateStr+'T00:00:00');
    return names[d.getDay()]||'';
  };

  const days=[];
  let cur=new Date(START_DATE+'T00:00:00');
  const end=new Date(lastDate+'T00:00:00');
  while(cur<=end){
    const ds=cur.toISOString().split('T')[0];
    const real=realByDate.get(ds);
    days.push(real || {id:'virtual-'+ds,date_voyage:ds,jour_label:weekdayLabel(ds),__virtual:true,matin_lieu:'',aprem_lieu:'',soir_lieu:'',notes:''});
    cur.setDate(cur.getDate()+1);
  }

  days.forEach(day=>{
    const parts=day.date_voyage.split('-');
    const dn=parts[2],mn=parseInt(parts[1]);
    const slots=day.__virtual?[]:D.slots.filter(s=>s.planning_id===day.id);
    const hotel=day.__virtual?null:D.items.find(x=>x.id===day.hotel_id&&x.type==='hotel');
    const dateVeille = new Date(new Date(day.date_voyage+'T00:00:00').getTime() - 86400000).toISOString().split('T')[0];

    const transportsDay = D.items.filter(x => {
      if (x.type !== 'transport') return false;
      const partAujourdhui = x.adresse === day.date_voyage;
      const arriveAujourdhui = x.adresse === dateVeille && x.notes && x.notes.includes('J+1');
      return partAujourdhui || arriveAujourdhui;
    }).sort((a,b)=>{
      const ha=(a.quartier||'00h00').replace('h',':');
      const hb=(b.quartier||'00h00').replace('h',':');
      return ha.localeCompare(hb);
    });

    const slotItems=slots.map(s=>({slot:s,item:D.items.find(x=>x.id===s.item_id)})).filter(x=>x.item);
    const dayTotal=slotItems.reduce((s,{item})=>s+(parseFloat(item.prix||0)),0)+transportsDay.reduce((s,t)=>s+(parseFloat(t.prix||0)),0);
    const cities=[...new Set([day.matin_lieu,day.aprem_lieu,day.soir_lieu].filter(Boolean).filter(x=>x!=='—'))].join(' → ');
    const metaChips=[];
    if(transportsDay.length)metaChips.push(transportsDay.map(t=>(t.prix_type||'').split(' ')[0]+' '+t.nom).join(', '));
    if(hotel)metaChips.push('🏨 '+hotel.nom);
    if(slotItems.length)metaChips.push(slotItems.length+' activité(s)');
    if(day.__virtual && !metaChips.length) metaChips.push('Jour tampon / transit');

    const title = esc(cities) || (transportsDay.length ? 'Transit / transport' : day.__virtual ? 'Avant départ' : 'Journée');
    const div=document.createElement('div');div.className='tl-day-card'+(day.__virtual?' tl-day-card-virtual':'');div.dataset.id=day.id;
    div.innerHTML=`
      <div class="tl-head" onclick="toggleTlDay('${day.id}')">
        <div class="tl-date-block"><div class="tl-day-num">${dn}</div><div class="tl-month">${MO[mn]}</div><div class="tl-weekday">${day.jour_label||weekdayLabel(day.date_voyage)||''}</div></div>
        <div class="tl-info">
          <div class="tl-city">${title}</div>
          <div class="tl-chips">${metaChips.map(c=>`<span class="tl-chip">${c}</span>`).join('')}</div>
        </div>
        ${!day.__virtual?`<div class="tl-drag-handle" onclick="event.stopPropagation()" id="dh-${day.id}">⠿</div>`:''}
        ${dayTotal>0?`<div class="tl-day-total">${fmtE(dayTotal)}</div>`:''}
        <div class="tl-arrow">▼</div>
      </div>
      <div class="tl-body">
        <div id="tl-timebar-${day.id}"></div>
        <div class="tl-entries" id="tl-entries-${day.id}"></div>
        ${day.__virtual
          ? `<div class="tl-edit-panel"><div class="edit-sec-label">Jour non éditable</div><div style="font-size:.75rem;color:var(--txt2);line-height:1.5;">Ce jour est affiché pour que le planning commence bien au 7 novembre, même si tu n’as pas créé de fiche planning dédiée.</div></div>`
          : `<div class="tl-edit-panel">
              <div class="edit-sec-label" style="margin-bottom:7px;">🏨 Hôtel</div>
              <select class="hotel-select" style="margin-bottom:9px;" onchange="updDay('${day.id}','hotel_id',this.value||null)">
                <option value="">Aucun hôtel</option>
                ${D.items.filter(x=>x.type==='hotel').map(h=>`<option value="${h.id}" ${day.hotel_id===h.id?'selected':''}>${esc(h.nom)} — ${esc(h.ville)}</option>`).join('')}
              </select>
              <div class="edit-sec-label">🗺 Lieux & Horaires</div>
              <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:9px;">
                ${[['🌅','matin_lieu','matin_h'],['☀️','aprem_lieu','aprem_h'],['🌙','soir_lieu','soir_h']].map(([em,lf,hf])=>`
                  <div class="time-row"><span class="time-label">${em}</span>
                    <input class="time-place" style="flex:1;" value="${esc(day[lf]||'')}" placeholder="Lieu…" onblur="updDay('${day.id}','${lf}',this.value)"/>
                    <input class="time-hour" value="${esc(day[hf]||'')}" placeholder="Heure" onblur="updDay('${day.id}','${hf}',this.value)"/>
                  </div>`).join('')}
              </div>
              <div class="edit-sec-label">Ajouter au planning</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
                <button class="slot-add-btn" style="width:auto;padding:4px 9px;" onclick="openPicker('${day.id}','activite')">＋ Activité</button>
                <button class="slot-add-btn" style="width:auto;padding:4px 9px;" onclick="openPicker('${day.id}','restaurant')">＋ Resto / Café</button>
              </div>
              <div class="edit-sec-label">Notes</div>
              <textarea class="day-note" rows="2" placeholder="Notes du jour…" onblur="updDay('${day.id}','notes',this.value)">${esc(day.notes||'')}</textarea>
            </div>`}
      </div>`;
    if(!day.__virtual){
      const dh=div.querySelector('#dh-'+day.id);
      setupDayDrag(dh,div,day.id);
    }
    wrap.appendChild(div);
    renderDayTimeline(day,transportsDay,slotItems,hotel);
  });
}

function toggleTlDay(id){document.querySelector(`.tl-day-card[data-id="${id}"]`)?.classList.toggle('open');}

function renderDayTimeline(day,transports,slotItems,hotel){
  // ── Barre temps libre ──
  const timeBarEl=document.getElementById('tl-timebar-'+day.id);
  if(timeBarEl){
    const usedMin=slotItems.reduce((s,{item})=>s+(DUREE_MIN[item.duree||'']||60),0);
    const pct=Math.min(100,Math.round(usedMin/JOURNEE_DISPO_MIN*100));
    const free=Math.max(0,JOURNEE_DISPO_MIN-usedMin);
    const freeH=free>=60?Math.floor(free/60)+'h'+(free%60?free%60+'min':''):(free+'min');
    const cls=pct>=100?'over':pct>=75?'warn':'ok';
    const icon=pct>=100?'🔴':pct>=75?'🟡':'🟢';
    const label=pct>=100?'Journée surchargée !':free===0?'Planning plein':''+freeH+' libres';
    const color=pct>=100?'#f87171':pct>=75?'#fbbf24':'#34d399';
    timeBarEl.innerHTML='<div class="day-time-bar '+cls+'">'
      +'<span class="day-time-icon">'+icon+'</span>'
      +'<span class="day-time-txt">'+label+'</span>'
      +'<div class="day-time-track"><div class="day-time-fill" style="width:'+pct+'%;background:'+color+';"></div></div>'
      +'<span style="font-size:.65rem;color:var(--txt2);font-weight:600;">'+pct+'%</span>'
      +'</div>';
  }
  const line=document.getElementById('tl-entries-'+day.id);if(!line)return;line.innerHTML='';
  const entries=[];
  transports.forEach(t=>{
    entries.push({order:'0'+(t.quartier||'00:00'),html:`<div class="tl-entry e-transport">
      <div class="tl-entry-card">
        <div class="tl-entry-top">
          <span class="tl-entry-icon">${(t.prix_type||'').split(' ')[0]||'🚄'}</span>
          <span class="tl-entry-name">${esc(t.nom)}</span>
          <span style="font-size:.65rem;color:var(--txt2);">${t.quartier?esc(t.quartier):''} ${t.description?'→ '+esc(t.description):''}</span>
        </div>
        <div class="tl-entry-sub"><b>Durée :</b> ${esc(t.notes||'—')} · <b>Prix :</b> ${fmtE(parseFloat(t.prix||0))}</div>
      </div></div>`});
  });
  const po={Matin:1,'Après-midi':2,Soir:3,Journée:4,'':5};
  slotItems.sort((a,b)=>(po[a.slot.periode]||5)-(po[b.slot.periode]||5));
  slotItems.forEach(({slot,item})=>{
    const pc={'Matin':'m','Après-midi':'a','Soir':'s','Journée':'j'}[slot.periode]||'';
    const amapQ=encodeURIComponent((item.nom||'')+(item.ville?' '+item.ville:''));
    entries.push({order:String(po[slot.periode]||5),html:`<div class="tl-entry e-${item.type}">
      <div class="tl-entry-card">
        <div class="tl-entry-top">
          <span class="tl-entry-icon">${TYPE_IC[item.type]||'📍'}</span>
          <span class="tl-entry-name">${esc(item.nom)}</span>
          ${slot.periode?`<span class="tl-periode ${pc}">${esc(slot.periode)}</span>`:''}

          <button class="tl-entry-del" onclick="removeSlot('${slot.id}')">✕</button>
        </div>
        ${item.description?`<div class="tl-entry-sub">${esc(item.description)}</div>`:''}
        ${parseFloat(item.prix||0)>0?`<div class="tl-entry-sub"><b>Prix :</b> ${fmtE(parseFloat(item.prix||0))}</div>`:''}
      </div></div>`});
  });
  if(hotel){
    entries.push({order:'9',html:`<div class="tl-entry e-hotel">
      <div class="tl-entry-card">
        <div class="tl-entry-top"><span class="tl-entry-icon">🏨</span><span class="tl-entry-name">${esc(hotel.nom)}</span><span style="font-size:.65rem;color:var(--txt2);" style="color:var(--rouge2);">Nuit</span></div>
        <div class="tl-entry-sub"><b>Ville :</b> ${esc(hotel.ville)}</div>
      </div></div>`});
  }
  if(!entries.length){line.innerHTML='<div class="tl-no-entries">Aucune activité planifiée pour ce jour</div>';return;}
  line.innerHTML=entries.sort((a,b)=>String(a.order).localeCompare(String(b.order), undefined, {numeric:true})).map(e=>`<div class="tl-entry-wrap">${e.html}</div>`).join('');
}

async function updDay(id,field,value){await sb.from('planning').update({[field]:value===''?null:value}).eq('id',id);}

// Drag days
function setupDayDrag(handle,card,dayId){
  handle.draggable=true;
  handle.addEventListener('dragstart',e=>{dayDragSrc=dayId;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.stopPropagation();});
  handle.addEventListener('dragend',()=>card.classList.remove('dragging'));
  card.addEventListener('dragover',e=>{e.preventDefault();card.classList.add('drag-over');});
  card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
  card.addEventListener('drop',async e=>{
    e.preventDefault();card.classList.remove('drag-over');
    if(dayDragSrc&&dayDragSrc!==dayId){
      const days=[...D.planning].sort((a,b)=>(a.ordre||0)-(b.ordre||0));
      const si=days.findIndex(d=>d.id===dayDragSrc),di=days.findIndex(d=>d.id===dayId);
      if(si>-1&&di>-1){const[m]=days.splice(si,1);days.splice(di,0,m);await Promise.all(days.map((d,i)=>sb.from('planning').update({ordre:i}).eq('id',d.id)));}
      dayDragSrc=null;
    }
  });
  let tt;
  handle.addEventListener('touchstart',()=>{dayDragSrc=dayId;card.style.opacity='.4';},{passive:true});
  handle.addEventListener('touchmove',e=>{
    e.preventDefault();
    const tc=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY)?.closest('.tl-day-card');
    if(tt&&tt!==tc)tt.classList.remove('drag-over');
    if(tc&&tc!==card){tt=tc;tc.classList.add('drag-over');}
  },{passive:false});
  handle.addEventListener('touchend',async()=>{
    card.style.opacity='';
    if(tt){tt.classList.remove('drag-over');const di=tt.dataset.id;
      if(di&&di!==dayId){const days=[...D.planning].sort((a,b)=>(a.ordre||0)-(b.ordre||0));
        const si=days.findIndex(d=>d.id===dayId),dii=days.findIndex(d=>d.id===di);
        if(si>-1&&dii>-1){const[m]=days.splice(si,1);days.splice(dii,0,m);await Promise.all(days.map((d,i)=>sb.from('planning').update({ordre:i}).eq('id',d.id)));}
      }
    }tt=null;dayDragSrc=null;
  });
}

// ── PICKER ──
let allPickerItems=[];

function openPicker(dayId,type){
  pickerCtx={dayId,type};
  const titles={activite:'Choisir une activité',restaurant:'Choisir un restaurant / café',cafe:'Choisir un restaurant / café'};
  document.getElementById('picker-title').textContent=titles[type]||'Choisir';
  document.getElementById('picker-periode').value='';
  document.getElementById('picker-search').value='';

  const day=D.planning.find(p=>p.id===dayId);
  const dayText=[day?.matin_lieu,day?.aprem_lieu,day?.soir_lieu].join(' ').toLowerCase();
  const matchVille=VILLES.find(v=>dayText.includes(v.toLowerCase()));
  const existIds=D.slots.filter(s=>s.planning_id===dayId).map(s=>s.item_id);

  // Pour restos et cafés : montrer les deux types ensemble
  const types=(type==='restaurant'||type==='cafe')?['restaurant','cafe']:[type];
  allPickerItems=[...D.items.filter(x=>types.includes(x.type))];
  if(matchVille)allPickerItems.sort((a,b)=>(a.ville===matchVille?-1:1)-(b.ville===matchVille?-1:1));

  renderPickerList(allPickerItems,existIds);
  openOverlay('picker-overlay');
}

function renderPickerList(items,existIds){
  if(!existIds)existIds=D.slots.filter(s=>pickerCtx&&s.planning_id===pickerCtx.dayId).map(s=>s.item_id);
  const list=document.getElementById('picker-list');list.innerHTML='';
  items.forEach(item=>{
    const sel=existIds.includes(item.id);
    const div=document.createElement('div');div.className='pick-item';div.dataset.id=item.id;div.dataset.sel=sel?'1':'0';
    const typeTag=item.type==='cafe'?'<span class="pick-type-badge c">Café</span>':item.type==='restaurant'?'<span class="pick-type-badge r">Resto</span>':'';
    div.innerHTML=`<div class="pick-chk${sel?' on':''}">${sel?'✓':''}</div>
      <div style="flex:1;min-width:0;">
        <div class="pick-name">${esc(item.nom)}${typeTag}</div>
        <div class="pick-meta-txt">${esc(item.ville)||''}${item.quartier&&item.quartier!=='À définir'?' · '+esc(item.quartier):''}${item.prix_type?' · '+esc(item.prix_type):''}</div>
      </div>`;
    div.onclick=()=>{const on=div.dataset.sel==='1';div.dataset.sel=on?'0':'1';const chk=div.querySelector('.pick-chk');chk.classList.toggle('on',!on);chk.textContent=!on?'✓':'';};
    list.appendChild(div);
  });
}

function filterPickerList(q){
  const lower=q.toLowerCase().trim();
  const filtered=lower?allPickerItems.filter(x=>(x.nom||'').toLowerCase().includes(lower)||(x.ville||'').toLowerCase().includes(lower)||(x.quartier||'').toLowerCase().includes(lower)):allPickerItems;
  renderPickerList(filtered);
}
async function confirmPicker(){
  if(!pickerCtx)return;
  const{dayId,type}=pickerCtx;
  const periode=document.getElementById('picker-periode').value;
  const sel=[...document.querySelectorAll('#picker-list .pick-item')].filter(d=>d.dataset.sel==='1').map(d=>d.dataset.id);
  const types=(type==='restaurant'||type==='cafe')?['restaurant','cafe']:[type];
  const exist=D.slots.filter(s=>s.planning_id===dayId&&D.items.find(x=>x.id===s.item_id&&types.includes(x.type)));
  const existIds=exist.map(s=>s.item_id);
  await Promise.all(exist.filter(s=>!sel.includes(s.item_id)).map(s=>sb.from('planning_slots').delete().eq('id',s.id)));
  const toAdd=sel.filter(id=>!existIds.includes(id));
  if(toAdd.length){
    await sb.from('planning_slots').insert(toAdd.map(item_id=>({planning_id:dayId,item_id,periode,ordre:0})));
    for(const itemId of toAdd){
      const item=D.items.find(x=>x.id===itemId);
      if(item&&parseFloat(item.prix||0)>0)await syncItemBudget(item.id,item.type,item.nom,parseFloat(item.prix||0), item.type==='hotel' ? parseInt(item.prix_type||1) : 1);
    }
  }
  const toRemove=exist.filter(s=>!sel.includes(s.item_id));
  for(const s of toRemove){
    const remaining=D.slots.filter(x=>x.item_id===s.item_id&&x.id!==s.id);
    if(!remaining.length){const linkedItem=D.items.find(x=>x.id===s.item_id);if(linkedItem && !linkedItem.fait){const bud=D.budget.find(b=>b.item_id===s.item_id);if(bud)await sb.from('budget').delete().eq('id',bud.id);}}
  }
  closeOverlay('picker-overlay');pickerCtx=null;
}
async function removeSlot(id){
  const slot=D.slots.find(s=>s.id===id);
  await sb.from('planning_slots').delete().eq('id',id);
  if(slot){
    const remaining=D.slots.filter(s=>s.item_id===slot.item_id&&s.id!==id);
    if(!remaining.length){const linkedItem=D.items.find(x=>x.id===slot.item_id);if(linkedItem && !linkedItem.fait){const bud=D.budget.find(b=>b.item_id===slot.item_id);if(bud)await sb.from('budget').delete().eq('id',bud.id);}}
  }
}

// ── TRANSPORTS ──
// ══ GEOCODING ══
async function geocodeItem(){
  const nom=document.getElementById('if-nom')?.value||'';
  const ville=document.getElementById('if-ville')?.value||'';
  const quartier=document.getElementById('if-quartier')?.value||'';
  const adresse=document.getElementById('if-adresse')?.value||'';
  const adresseCn=document.getElementById('if-adresse-cn')?.value||'';
  const status=document.getElementById('geocode-status');
  if(!nom&&!adresse&&!adresseCn){if(status)status.textContent='⚠️ Saisis un nom ou une adresse dabord';return;}
  if(status)status.textContent='🔍 Recherche en cours…';
  // Construire la query : priorité adresse CN > adresse FR > nom + ville
  const query=adresseCn||(adresse?(adresse+' '+ville).trim():(nom+' '+quartier+' '+ville).trim());
  try{
    const url=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=cn`;
    const res=await fetch(url,{headers:{'Accept-Language':'fr','User-Agent':'Chine2026App'}});
    const data=await res.json();
    if(data&&data.length>0){
      const r=data[0];
      const lat=parseFloat(r.lat),lng=parseFloat(r.lon);
      const latEl=document.getElementById('if-lat');
      const lngEl=document.getElementById('if-lng');
      if(latEl)latEl.value=Math.round(lat*1000000)/1000000;
      if(lngEl)lngEl.value=Math.round(lng*1000000)/1000000;
      if(status)status.innerHTML=`✅ Trouvé : <b>${esc(r.display_name.split(',').slice(0,3).join(', '))}</b>`;
    }else{
      if(status)status.textContent='❌ Lieu non trouvé — saisis les coords manuellement';
    }
  }catch(e){
    if(status)status.textContent='❌ Erreur réseau — saisis les coords manuellement';
  }
}

// ══ STATUT / PRIORITÉ / DURÉE ══
async function setStatut(itemId,statut){
  await sb.from('items').update({statut}).eq('id',itemId);
  showToast(statut==='idee'?'💡 Idée':statut==='planifie'?'📅 Planifié':'✅ Fait !');
}

async function setPriorite(itemId,priorite){
  await sb.from('items').update({priorite}).eq('id',itemId);
  showToast(priorite==='coeur'?'⭐ Coup de cœur !':priorite==='sympa'?'👍 Sympa':'🤷 Optionnel');
}

async function setDuree(itemId,duree){
  await sb.from('items').update({duree}).eq('id',itemId);
}

// ══ TERRAIN MODE ══
function toggleTerrainMode(){
  terrainMode=!terrainMode;
  const toggle=document.getElementById('terrainToggle');
  const banner=document.getElementById('terrainBanner');
  const quoi=document.getElementById('quoiWidget');
  const zone=document.getElementById('dragToPlanZone');
  if(toggle)toggle.classList.toggle('on',terrainMode);
  if(banner)banner.classList.toggle('on',terrainMode);
  if(quoi)quoi.style.display=terrainMode?'block':'none';
  if(terrainMode){refreshQuoi();}
  // Reset filter when entering terrain
  if(terrainMode){terrainFilter='tous';document.querySelectorAll('.tf-chip:not(.mode-terrain-toggle)').forEach(c=>c.classList.toggle('on',c.textContent.trim()==='Tout'));}
  renderItems('activite');
}

function setTerrainFilter(f,el){
  terrainFilter=f;
  document.querySelectorAll('.tf-chip:not(.mode-terrain-toggle)').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  renderItems('activite');
  renderItems('restaurant');
  renderItems('cafe');
}

// ══ "ON FAIT QUOI ?" ══
function refreshQuoi(){
  const list=document.getElementById('quoiList');if(!list)return;
  // Get current day city from planning
  const today=new Date();
  const todayStr=today.toISOString().split('T')[0];
  const todayPlan=D.planning.find(p=>p.date_voyage===todayStr);
  const cityHint=[todayPlan?.matin_lieu,todayPlan?.aprem_lieu,todayPlan?.soir_lieu].filter(Boolean).join(' ').toLowerCase();
  const matchVille=VILLES.find(v=>cityHint.includes(v.toLowerCase()))||null;

  let candidates=D.items.filter(x=>
    (x.type==='activite'||x.type==='restaurant'||x.type==='cafe')&&
    getItemStatut(x)!=='fait'&&
    getItemStatut(x)!=='planifie'
  );

  // Boost by city proximity
  if(matchVille)candidates.sort((a,b)=>(a.ville===matchVille?-1:1)-(b.ville===matchVille?-1:1));
  // Then by priorité
  const prioOrder={coeur:0,sympa:1,optionnel:2};
  candidates.sort((a,b)=>(prioOrder[getItemPriorite(a)]||1)-(prioOrder[getItemPriorite(b)]||1));

  const top=candidates.slice(0,4);
  if(!top.length){list.innerHTML='<div class="quoi-empty">🎉 Toutes les idées traitées !</div>';return;}
  list.innerHTML='';
  top.forEach(item=>{
    const duree=getItemDuree(item);
    const prio={coeur:'⭐',sympa:'👍',optionnel:'🤷'}[getItemPriorite(item)]||'';
    const d=document.createElement('div');d.className='quoi-item';
    d.innerHTML=`<div class="quoi-item-ic">${TYPE_IC[item.type]||'📍'}</div>
      <div class="quoi-item-body">
        <div class="quoi-item-name">${esc(item.nom)}</div>
        <div class="quoi-item-meta">${esc(item.ville||'')}${item.quartier&&item.quartier!=='À définir'?' · '+esc(item.quartier):''}${duree?' · ⏱ '+esc(duree):''}</div>
      </div>
      <span class="quoi-prio">${prio}</span>`;
    d.onclick=()=>openItemSheet(item.type,item);
    list.appendChild(d);
  });
}

// ══ DRAG TO PLANNING ══
async function handleDragToPlan(e){
  e.preventDefault();
  const zone=document.getElementById('dragToPlanZone');
  if(zone){zone.classList.remove('drag-over');zone.classList.remove('active');}
  if(!dragItemId)return;

  // Find today's planning day or first available
  const today=new Date().toISOString().split('T')[0];
  let targetDay=D.planning.find(p=>p.date_voyage===today)||[...D.planning].sort((a,b)=>(a.date_voyage||'').localeCompare(b.date_voyage||''))[0];
  if(!targetDay){showToast('❌ Aucun jour dans le planning');dragItemId=null;return;}

  // Add to planning_slots
  const alreadyIn=D.slots.find(s=>s.planning_id===targetDay.id&&s.item_id===dragItemId);
  if(!alreadyIn){
    await sb.from('planning_slots').insert({planning_id:targetDay.id,item_id:dragItemId,periode:'',ordre:0});
    // Auto set statut to planifie
    await sb.from('items').update({statut:'planifie'}).eq('id',dragItemId);
    showToast('📅 Ajouté au planning du '+targetDay.date_voyage);
  } else {
    showToast('Déjà dans ce jour !');
  }
  dragItemId=null;
}

function renderTransports() {
  const cont = document.getElementById('trTimeline');
  cont.innerHTML = '';

  // Tri amélioré : Date (adresse) puis Heure (quartier)
  const transports = [...D.items.filter(x => x.type === 'transport')].sort((a, b) => {
    const dateA = a.adresse || '9999-12-31';
    const dateB = b.adresse || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const heureA = (a.quartier || '00h00').replace('h', ':');
    const heureB = (b.quartier || '00h00').replace('h', ':');
    return heureA.localeCompare(heureB);
  });

  if (!transports.length) {
    cont.innerHTML = '<div class="empty"><div class="empty-ic">🚄</div>Aucun transport</div>';
    return;
  }

  transports.forEach((t, i) => {
    const ico = (t.prix_type || '').split(' ')[0] || '🚄';
    const bgMap = { Vol: 'rgba(41,128,185,.22)', Train: 'rgba(39,174,96,.22)', Bus: 'rgba(243,156,18,.22)' };
    const bgKey = Object.keys(bgMap).find(k => (t.prix_type || '').includes(k)) || 'Vol';
    
    // Extraction des fuseaux et de la durée depuis les notes
    // Format attendu : "D:🇫🇷 FR | A:🇨🇳 CN (J+1) | Durée: 11h50"
    const notesRaw = t.notes || "";
    const parts = notesRaw.split('|');
    const tzDep = parts[0] ? parts[0].replace('D:', '').trim() : "";
    const tzArr = parts[1] ? parts[1].replace('A:', '').trim() : "";
    const duree = parts[2] ? parts[2].replace('Durée:', '').trim() : "";
    const imgUrl = notesRaw.includes('IMG:') ? notesRaw.split('IMG:')[1].split('|')[0] : null;
    const d = document.createElement('div');
    d.className = 'tr-item';
    d.innerHTML = `
      <div class="tr-left">
        <div class="tr-circle" style="background:${bgMap[bgKey]};">${ico}</div>
        ${i < transports.length - 1 ? '<div class="tr-line"></div>' : ''}
      </div>
      <div class="tr-body">
        <div class="tr-route">${esc(t.nom)}</div>
        <div class="tr-tags">
          ${t.adresse ? `<span class="tr-tag">📅 ${esc(t.adresse)}</span>` : ''}
          <span class="tr-tag">🛫 ${esc(t.quartier)} <small style="opacity:0.8;">${tzDep}</small></span>
          ${t.description ? `<span class="tr-tag">🛬 ${esc(t.description)} <small style="opacity:0.8;">${tzArr}</small></span>` : ''}
          <span class="tr-price">${fmtE(parseFloat(t.prix || 0))}</span>
          ${imgUrl ? `<button class="qa-btn" onclick="window.open('${imgUrl}', '_blank')" style="margin-top:5px; padding:4px 8px; font-size:0.6rem;">🖼️ Voir la preuve</button>` : ''}
        </div>
        <div class="tr-detail">
          ${duree ? `⏱ Durée : ${esc(duree)}` : ''}
          ${t.fait 
            ? '<span style="font-size: 0.55rem; color: #2ecc71; background: rgba(46, 204, 113, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid #2ecc71;">CONFIRMÉ</span>' 
            : '<span style="font-size: 0.55rem; color: #e74c3c; background: rgba(231, 76, 60, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid #e74c3c;">À RÉSERVER</span>'}
        </div>
      </div>`;
    
    d.onclick = () => openItemSheet('transport', t);
    cont.appendChild(d);
  });
}
// ── CHECKLIST ──
function renderChecklist(){
  renderCL('cl-depart','depart');
  renderCL('cl-surplace','surplace');
}
function renderCL(elId,cat){
  const el=document.getElementById(elId);if(!el)return;el.innerHTML='';
  D.checklist.filter(c=>c.categorie===cat).sort((a,b)=>String(a.id).localeCompare(String(b.id))).forEach(item=>{
    const d=document.createElement('div');d.className='cl-item'+(item.done?' done':'');
    const clRO=!isEditorMode();
    d.innerHTML=`<input type="checkbox" class="cl-cb" ${item.done?'checked':''} ${clRO?'disabled':''} onchange="toggleCL('${item.id}',this.checked,this)">
      <span class="cl-lbl">${esc(item.label)}</span>
      <button class="cl-del" onclick="deleteCL('${item.id}')">✕</button>`;
    el.appendChild(d);
  });
}
async function toggleCL(id,done,cb){cb.closest('.cl-item').className='cl-item'+(done?' done':'');await sb.from('checklist').update({done}).eq('id',id);}
async function deleteCL(id){if(confirm('Supprimer cette tâche ?'))await sb.from('checklist').delete().eq('id',id);}
async function addCL(cat){
  const label=prompt('Nouvelle tâche :');if(!label)return;
  await sb.from('checklist').insert({label,categorie:cat,done:false});
}

// ── PACKING ──
function renderPacking(){
  const cont=document.getElementById('packingCont');cont.innerHTML='';
  const savedPacking=JSON.parse(localStorage.getItem('packing')||'null')||PACK_DEFAULT;
  savedPacking.forEach((cat,ci)=>{
    const done=cat.items.filter(i=>i.d).length;
    const total=cat.items.length;
    const div=document.createElement('div');div.className='pack-category';
    div.innerHTML=`<div class="pack-cat-header" onclick="togglePackCat(${ci})">
      <h3>${cat.cat}</h3>
      <span class="pack-cat-progress">${done}/${total}</span>
      <div class="pack-prog-bar"><div class="pack-prog-fill" style="width:${total?Math.round(done/total*100):0}%;"></div></div>
    </div>
    <div class="cl-section" id="pack-cat-${ci}" style="display:flex;flex-direction:column;"></div>`;
    cont.appendChild(div);
    const wrap=div.querySelector('#pack-cat-'+ci);
    cat.items.forEach((item,ii)=>{
      const d=document.createElement('div');d.className='cl-item'+(item.d?' done':'');
      d.innerHTML=`<input type="checkbox" class="cl-cb" ${item.d?'checked':''} onchange="togglePack(${ci},${ii},this.checked)">
        <span class="cl-lbl">${esc(item.l)}</span>
        <button class="cl-del" onclick="deletePack(${ci},${ii})">✕</button>`;
      wrap.appendChild(d);
    });
  });
}
function togglePackCat(ci){const el=document.getElementById('pack-cat-'+ci);el.style.display=el.style.display==='none'?'flex':'none';}
function togglePack(ci,ii,done){
  const p=JSON.parse(localStorage.getItem('packing')||'null')||PACK_DEFAULT;
  if(p[ci]&&p[ci].items[ii])p[ci].items[ii].d=done;
  localStorage.setItem('packing',JSON.stringify(p));renderPacking();
}
function deletePack(ci,ii){
  const p=JSON.parse(localStorage.getItem('packing')||'null')||PACK_DEFAULT;
  if(p[ci])p[ci].items.splice(ii,1);
  localStorage.setItem('packing',JSON.stringify(p));renderPacking();
}
function addPackItem(){
  const label=prompt('Nom de l\'article :');if(!label)return;
  const cats=JSON.parse(localStorage.getItem('packing')||'null')||PACK_DEFAULT;
  const catNames=cats.map((c,i)=>i+': '+c.cat).join('\n');
  const ci=parseInt(prompt('Numéro de catégorie :\n'+catNames)||'0');
  if(cats[ci]){cats[ci].items.push({l:label,d:false});localStorage.setItem('packing',JSON.stringify(cats));renderPacking();}
}

// ── NOTES ──
function renderNotes(){
  const cont=document.getElementById('cont-notes');cont.innerHTML='';
  const canEdit=isEditorMode();
  D.notes.sort((a,b)=>String(a.id).localeCompare(String(b.id))).forEach(note=>{
    const d=document.createElement('div');d.className='note-card';
    d.innerHTML=`<div class="note-title-row">
      <input class="note-title-inp" value="${esc(note.titre||'')}" placeholder="Titre…"
        ${canEdit?`onblur="sb.from('notes').update({titre:this.value}).eq('id','${note.id}')"`:' readonly'}
        style="${canEdit?'':'background:transparent;cursor:default;color:var(--txt);'}">
      ${canEdit?`<button class="note-del-btn" onclick="deleteNote('${note.id}')" title="Supprimer">🗑</button>`:''}
    </div>
    <textarea class="note-body-inp" rows="4" placeholder="Contenu…"
      ${canEdit?`onblur="sb.from('notes').update({corps:this.value}).eq('id','${note.id}')"`:' readonly'}
      style="${canEdit?'':'cursor:default;'}">${esc(note.corps||'')}</textarea>`;
    cont.appendChild(d);
  });
}
async function deleteNote(id){
  if(!isEditorMode())return;
  if(!confirm('Supprimer cette note ?'))return;
  await sb.from('notes').delete().eq('id',id);
  showToast('🗑 Note supprimée');
}
async function addNote(){
  if(!isEditorMode()){showToast('🔒 Mode lecteur');return;}
  await sb.from('notes').insert({titre:'Nouvelle note',corps:''});
}

// ── PHRASES ──
function renderPhrases(){
  const cont = document.getElementById('phrasesCont');
  if(!cont || cont.children.length) return;

  PHRASES.forEach((section, si) => {
    const card = document.createElement('div');
    card.className = 'phrase-section';

    card.innerHTML = `
      <div class="phrase-cat-header" onclick="togglePhraseCat(${si})">
        <div class="phrase-cat-title">${esc(section.cat)}</div>
        <div id="pa-${si}" style="font-size:.8rem;color:#999;">▼</div>
      </div>

      <div class="phrase-rows ${si === 0 ? 'open' : ''}" id="pl-${si}">
        ${section.phrases.map(p => `
          <div class="phrase-row">
            <div class="phrase-fr">${esc(p.fr)}</div>

            <div class="phrase-zh">
              <div class="phrase-main" onclick="copyPhrase('${String(p.zh).replace(/'/g, "\\'")}')">
                <div class="phrase-char">${esc(p.zh)}</div>
                <div class="phrase-pin">${esc(p.pin)}</div>
              </div>

              <button class="phrase-audio" onclick="speakChinese('${String(p.zh).replace(/'/g, "\\'")}')">🔊</button>
            </div>
          </div>
        `).join('')}

        <div class="phrase-hint">Touchez le chinois pour copier · 🔊 pour écouter</div>
      </div>
    `;

    cont.appendChild(card);
  });
}
function togglePhraseCat(si){
  const pl=document.getElementById('pl-'+si);
  const arr=document.getElementById('pa-'+si);
  pl.classList.toggle('open');arr.textContent=pl.classList.contains('open')?'▲':'▼';
}
function copyPhrase(zh){
  navigator.clipboard?.writeText(zh).then(()=>{
    const t=document.createElement('div');
    t.className='toast';
    t.textContent='Copié : '+zh;document.body.appendChild(t);setTimeout(()=>t.remove(),1800);
  });
}

// ── GOOGLE CALENDAR EXPORT ──
function exportPlanningPDF(){
  const days=[...D.planning].sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  const styles=`
    <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Helvetica Neue',Arial,sans-serif;}
    body{background:#fff;color:#222;padding:24px;}
    h1{font-size:22px;font-weight:700;margin-bottom:4px;color:#e85d5d;}
    .subtitle{font-size:11px;color:#888;margin-bottom:24px;}
    .day{break-inside:avoid;page-break-inside:avoid;margin-bottom:20px;border:1px solid #eee;border-radius:10px;overflow:hidden;}
    .day-head{display:flex;align-items:center;gap:0;background:#e85d5d;}
    .day-date{background:#c94040;color:#fff;padding:10px 14px;text-align:center;min-width:52px;}
    .day-num{font-size:24px;font-weight:700;line-height:1;}
    .day-month{font-size:9px;text-transform:uppercase;opacity:.8;}
    .day-info{flex:1;padding:10px 14px;background:#e85d5d;color:#fff;}
    .day-city{font-size:14px;font-weight:700;}
    .day-total{font-size:11px;opacity:.8;margin-top:2px;}
    .day-body{padding:12px 14px;}
    .section{margin-bottom:8px;}
    .section-title{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;margin-bottom:5px;}
    .periods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;}
    .period{background:#f9f9f9;border-radius:6px;padding:7px 9px;}
    .period-icon{font-size:12px;}
    .period-place{font-size:11px;font-weight:600;margin-top:2px;}
    .activity{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f0f0;}
    .activity:last-child{border-bottom:none;}
    .act-type{font-size:14px;}
    .act-name{flex:1;font-size:11px;font-weight:600;}
    .act-prix{font-size:10px;color:#888;}
    .hotel-block{background:#fff4f1;border:1px solid #fdd;border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;margin-bottom:6px;}
    .hotel-icon{font-size:16px;}
    .hotel-name{font-size:11px;font-weight:700;flex:1;}
    .hotel-city{font-size:10px;color:#888;}
    .note-block{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:7px 10px;font-size:10px;color:#92400e;margin-top:6px;}
    .transport-block{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:7px 10px;margin-bottom:6px;}
    .tr-route{font-size:11px;font-weight:700;}
    .tr-meta{font-size:10px;color:#888;margin-top:2px;}
    @page{margin:1cm;size:A4;}
    </style>`;

  let body=`${styles}<h1>🏮 Chine 2026 — Planning</h1><div class="subtitle">Matis &amp; Lise · 09 → 22 novembre 2026 · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>`;

  days.forEach(day=>{
    const parts=day.date_voyage.split('-');
    const dn=parts[2],mn=parseInt(parts[1]);
    const months=['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const slots=D.slots.filter(s=>s.planning_id===day.id);
    const slotItems=slots.map(s=>({slot:s,item:D.items.find(x=>x.id===s.item_id)})).filter(x=>x.item);
    const hotel=D.items.find(x=>x.id===day.hotel_id);
    const transports=D.items.filter(x=>x.type==='transport'&&x.adresse===day.date_voyage);
    const cities=[...(new Set([day.matin_lieu,day.aprem_lieu,day.soir_lieu].filter(Boolean).filter(x=>x!=='—')))].join(' → ')||'Journée';
    const dayTotal=slotItems.reduce((s,{item})=>s+(parseFloat(item.prix||0)),0)+transports.reduce((s,t)=>s+(parseFloat(t.prix||0)),0);

    body+=`<div class="day"><div class="day-head"><div class="day-date"><div class="day-num">${dn}</div><div class="day-month">${months[mn]}</div></div><div class="day-info"><div class="day-city">${cities}</div><div class="day-total">${dayTotal>0?fmtE(dayTotal)+' estimé':''}</div></div></div><div class="day-body">`;

    // Transports du jour
    if(transports.length)transports.forEach(t=>{body+=`<div class="transport-block"><div class="tr-route">${t.prix_type||'🚄'} ${t.nom}</div><div class="tr-meta">${t.quartier||''}${t.description?' → '+t.description:''}${t.notes?' · '+t.notes:''}</div></div>`;});

    // Hôtel
    if(hotel)body+=`<div class="hotel-block"><span class="hotel-icon">🏨</span><div><div class="hotel-name">${hotel.nom}</div><div class="hotel-city">${hotel.ville||''}</div></div></div>`;

    // Lieux & horaires
    if(day.matin_lieu||day.aprem_lieu||day.soir_lieu){
      body+=`<div class="periods"><div class="period"><div class="period-icon">🌅</div><div class="period-place">${day.matin_lieu||'—'}${day.matin_h?' · '+day.matin_h:''}</div></div><div class="period"><div class="period-icon">☀️</div><div class="period-place">${day.aprem_lieu||'—'}${day.aprem_h?' · '+day.aprem_h:''}</div></div><div class="period"><div class="period-icon">🌙</div><div class="period-place">${day.soir_lieu||'—'}${day.soir_h?' · '+day.soir_h:''}</div></div></div>`;
    }

    // Activités planifiées
    if(slotItems.length){
      const po={Matin:0,'Déjeuner':1,'Après-midi':2,'Dîner':3,Soir:4,Journée:5,'':6};
      slotItems.sort((a,b)=>(po[a.slot.periode]??6)-(po[b.slot.periode]??6));
      body+=`<div class="section"><div class="section-title">Activités</div>`;
      slotItems.forEach(({slot,item})=>{
        const prix=parseFloat(item.prix||0);
        body+=`<div class="activity"><span class="act-type">${{activite:'🎯',restaurant:'🍜',cafe:'☕',hotel:'🏨'}[item.type]||'📍'}</span><span class="act-name">${item.nom}${slot.periode?' · '+slot.periode:''}</span><span class="act-prix">${prix>0?fmtE(prix):''}</span></div>`;
      });
      body+=`</div>`;
    }

    if(day.notes)body+=`<div class="note-block">📝 ${day.notes}</div>`;
    body+=`</div></div>`;
  });

  // Budget résumé
  let depM=0,depL=0;
  D.budget.forEach(r=>{const t=parseFloat(r.total||0);const w=(r.personne||'les deux').toLowerCase();if(w==='matis')depM+=t;else if(w==='lise')depL+=t;else{depM+=t/2;depL+=t/2;}});
  body+=`<div style="margin-top:24px;padding:14px;background:#fff4f1;border-radius:10px;border:1px solid #fdd;"><h2 style="font-size:13px;font-weight:700;margin-bottom:10px;color:#e85d5d;">💰 Résumé Budget</h2><table style="width:100%;font-size:11px;border-collapse:collapse;"><tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Total dépensé</td><td style="text-align:right;font-weight:700;padding:4px 8px;border-bottom:1px solid #eee;">${fmtE(depM+depL)}</td></tr><tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Matis</td><td style="text-align:right;font-weight:700;padding:4px 8px;border-bottom:1px solid #eee;">${fmtE(depM)}</td></tr><tr><td style="padding:4px 8px;">Lise</td><td style="text-align:right;font-weight:700;padding:4px 8px;">${fmtE(depL)}</td></tr></table></div>`;

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Chine 2026 — Planning</title></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

function exportGoogleCal(){
  const days=[...D.planning].sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  let ical='BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Chine2026//FR\n';
  days.forEach(day=>{
    const d=day.date_voyage.replace(/-/g,'');
    const title=[...new Set([day.matin_lieu,day.aprem_lieu,day.soir_lieu].filter(Boolean).filter(x=>x!=='—'))].join(' → ')||'Chine 2026';
    const slots=D.slots.filter(s=>s.planning_id===day.id);
    const slotNames=slots.map(s=>{const item=D.items.find(x=>x.id===s.item_id);return item?item.nom:'';}).filter(Boolean);
    const hotel=D.items.find(x=>x.id===day.hotel_id);
    let desc='';
    if(slotNames.length)desc+='Activités: '+slotNames.join(', ')+'\\n';
    if(hotel)desc+='Hôtel: '+hotel.nom+'\\n';
    if(day.notes)desc+=day.notes;
    const uid=d+'-'+Math.random().toString(36).substr(2,6);
    ical+=`BEGIN:VEVENT\nUID:${uid}@chine2026\nDTSTART;VALUE=DATE:${d}\nDTEND;VALUE=DATE:${d}\nSUMMARY:🏮 ${title}\nDESCRIPTION:${desc}\nEND:VEVENT\n`;
  });
  ical+='END:VCALENDAR';
  const blob=new Blob([ical],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='chine2026.ics';a.click();
  URL.revokeObjectURL(url);
  // Toast
  const t=document.createElement('div');
  t.className='toast';
  t.textContent='📅 Fichier .ics téléchargé — importer dans Google Calendar';
  document.body.appendChild(t);setTimeout(()=>t.remove(),3000);
}

// ── UTILS ──
function esc(v){if(!v&&v!==0)return'';return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtE(n){
  if(!isEditorMode())return '***€';
  return Math.round(n||0).toLocaleString('fr-FR')+' €';
}
window.addEventListener('scroll',()=>{const b=document.getElementById('st-btn');if(b)b.classList.toggle('vis',window.scrollY>200);},{passive:true});

// ── RESTO/CAFE tab switch ──
function switchRCTab(t){
  ['restaurant','cafe'].forEach(x=>{
    document.getElementById('rc-'+x).style.display=x===t?'block':'none';
    document.getElementById('rctab-'+x).classList.toggle('on',x===t);
  });
}

// ── QUICK NAV helper ──
function goTabByName(name){
  // Mapping tab → bouton nav
  const tabBtnMap={
    budget:'nb-budget',planning:'nb-planning',activites:'nb-activites',
    carte:'nb-carte',chat:'nb-chat',
    restaurants:'nd-restaurants',hotels:'nd-hotels',transport:'nd-transport',
    checklist:'nd-checklist',notes:'nd-notes',phrases:'nd-phrases',
    stats:'nd-stats',galerie:'nd-galerie',pratique:'nd-pratique'
  };
  const btn=document.getElementById(tabBtnMap[name]);
  if(btn)goTab(name,btn);
}

// ── STATS ──
function renderStats(){
  const cont = document.getElementById('statsCont');
  if(!cont) return;
  cont.innerHTML = '';

  const today = new Date();
  const depart = new Date('2026-11-08');
  const retour = new Date('2026-11-22');
  const daysTotal = 15;
  const daysBefore = Math.max(0, Math.ceil((depart - today) / 86400000));
  const inTrip = today >= depart && today <= retour;
  const tripDay = inTrip ? Math.floor((today - depart) / 86400000) + 1 : 0;

  const items = Array.isArray(D.items) ? D.items : [];
  const slots = Array.isArray(D.slots) ? D.slots : [];
  const budgetRows = Array.isArray(D.budget) ? D.budget : [];
  const checklist = Array.isArray(D.checklist) ? D.checklist : [];

  const activites = items.filter(x => x.type === 'activite');
  const restos = items.filter(x => x.type === 'restaurant');
  const cafes = items.filter(x => x.type === 'cafe');
  const hotels = items.filter(x => x.type === 'hotel');
  const transports = items.filter(x => x.type === 'transport');

  const doneItems = items.filter(x => x.fait).length;
  const doneActs = activites.filter(x => x.fait).length;
  const doneRestos = restos.filter(x => x.fait).length;
  const reservedHotels = hotels.filter(x => x.fait).length;
  const doneTransports = transports.filter(x => x.fait).length;

  const villes = [...new Set(items.map(x => (x.ville || '').trim()).filter(Boolean))];

  let depMatis = 0, depLise = 0;
  budgetRows.forEach(r => {
    const t = parseFloat(r.total || 0) || 0;
    const who = (r.personne || 'les deux').toLowerCase();
    if (who === 'matis') depMatis += t;
    else if (who === 'lise') depLise += t;
    else {
      depMatis += t / 2;
      depLise += t / 2;
    }
  });

  const depTotal = depMatis + depLise;
  const budgetTotal = budgetPP * 2;
  const restant = budgetTotal - depTotal;
  const usagePct = budgetTotal > 0 ? Math.min(100, Math.round((depTotal / budgetTotal) * 100)) : 0;
  const resteParJour = daysTotal > 0 ? Math.round(restant / daysTotal) : 0;

  const clTotal = checklist.length;
  const clDone = checklist.filter(x => x.done).length;
  const clPct = clTotal ? Math.round((clDone / clTotal) * 100) : 0;

  const totalLieux = activites.length + restos.length + cafes.length + hotels.length;
  const totalPlanned = slots.length;

  const byCity = {};
  items.forEach(it => {
    const v = (it.ville || '').trim();
    if (!v) return;
    byCity[v] = (byCity[v] || 0) + 1;
  });
  const topCityEntry = Object.entries(byCity).sort((a,b)=>b[1]-a[1])[0];
  const topCity = topCityEntry ? topCityEntry[0] : '—';
  const topCityCount = topCityEntry ? topCityEntry[1] : 0;

  const byTypeBudget = {
    hotel: 0,
    transport: 0,
    food: 0,
    activite: 0,
    divers: 0
  };

  budgetRows.forEach(r => {
    const total = parseFloat(r.total || 0) || 0;
    const cat = (r.categorie || r.cat || '').toLowerCase();
    if (cat.includes('hôtel') || cat.includes('hotel')) byTypeBudget.hotel += total;
    else if (cat.includes('train') || cat.includes('vol') || cat.includes('taxi') || cat.includes('bus')) byTypeBudget.transport += total;
    else if (cat.includes('restaurant') || cat.includes('café') || cat.includes('cafe') || cat.includes('bar')) byTypeBudget.food += total;
    else if (cat.includes('activité') || cat.includes('activite') || cat.includes('entrée') || cat.includes('spectacle')) byTypeBudget.activite += total;
    else byTypeBudget.divers += total;
  });

  const topBudgetEntry = Object.entries(byTypeBudget).sort((a,b)=>b[1]-a[1])[0];
  const topBudgetLabelMap = {
    hotel: 'Hôtels',
    transport: 'Transports',
    food: 'Restauration',
    activite: 'Activités',
    divers: 'Divers'
  };
  const topBudgetLabel = topBudgetEntry ? topBudgetLabelMap[topBudgetEntry[0]] : '—';
  const topBudgetValue = topBudgetEntry ? topBudgetEntry[1] : 0;

  const cardsTop = [
    { value: daysBefore > 0 ? `${daysBefore}j` : inTrip ? `Jour ${tripDay}` : 'Terminé', label: 'Temps' },
    { value: `${depTotal.toFixed(0)}€`, label: 'Engagé' },
    { value: `${villes.length}`, label: 'Villes' },
    { value: `${clPct}%`, label: 'Checklist' }
  ];

  renderBudgetChart();
  cont.innerHTML=''; // reset avant score
  renderVoyageScore(cont);
  cont.innerHTML += `
    <div class="stat-grid">
      ${cardsTop.map(c => `
        <div class="stat-card">
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      `).join('')}
    </div>

    <div class="stats-section">
      <div class="ss-title">📌 Vue globale</div>
      <div class="stats-list">
        <div class="stats-row"><span>Lieux enregistrés</span><b>${totalLieux}</b></div>
        <div class="stats-row"><span>Items planifiés</span><b>${totalPlanned}</b></div>
        <div class="stats-row"><span>Éléments marqués faits</span><b>${doneItems}</b></div>
        <div class="stats-row"><span>Ville la plus dense</span><b>${esc(topCity)}${topCityCount ? ` · ${topCityCount}` : ''}</b></div>
      </div>
    </div>

    <div class="stats-section">
      <div class="ss-title">💰 Budget</div>
      <div class="stats-list">
        <div class="stats-row"><span>Budget total</span><b>${fmtE(budgetTotal)}</b></div>
        <div class="stats-row"><span>Dépensé</span><b>${fmtE(depTotal)}</b></div>
        <div class="stats-row"><span>Restant</span><b>${fmtE(restant)}</b></div>
        <div class="stats-row"><span>Utilisation</span><b>${usagePct}%</b></div>
        <div class="stats-row"><span>Reste / jour</span><b>${fmtE(resteParJour)}</b></div>
        <div class="stats-row"><span>Poste principal</span><b>${topBudgetLabel} · ${fmtE(topBudgetValue)}</b></div>
      </div>
    </div>

    <div class="stats-section">
      <div class="ss-title">🧭 Répartition du voyage</div>
      <div class="stats-list">
        <div class="stats-row"><span>Activités</span><b>${activites.length} / faites ${doneActs}</b></div>
        <div class="stats-row"><span>Restaurants</span><b>${restos.length} / faits ${doneRestos}</b></div>
        <div class="stats-row"><span>Cafés & bars</span><b>${cafes.length}</b></div>
        <div class="stats-row"><span>Hôtels</span><b>${hotels.length} / réservés ${reservedHotels}</b></div>
        <div class="stats-row"><span>Transports</span><b>${transports.length} / faits ${doneTransports}</b></div>
      </div>
    </div>

    <div class="stats-section">
      <div class="ss-title">🧳 Préparation</div>
      <div class="stats-list">
        <div class="stats-row"><span>Checklist terminée</span><b>${clDone}/${clTotal}</b></div>
        <div class="stats-row"><span>Progression checklist</span><b>${clPct}%</b></div>
        <div class="stats-row"><span>Budget Matis</span><b>${fmtE(depMatis)}</b></div>
        <div class="stats-row"><span>Budget Lise</span><b>${fmtE(depLise)}</b></div>
      </div>
    </div>
  `;
}
// ══════════════════════════════════════════════════════════
// CARTE — Leaflet + GPS + filtres + navigation Amap
// ══════════════════════════════════════════════════════════
let mapInst=null;
let mapMarkers=[];
let meMarker=null;
let meCircle=null;
let myPos=null; // {lat,lng,acc}
let mapFilter='all';
let watchId=null;
let mapLayerIdx=0;

// Coordonnées par ville (pour placer les marqueurs sans lat/lng exact)
const VILLE_COORDS={
  'Shanghai':[31.2304,121.4737],
  'Chongqing':[29.5630,106.5516],
  'Chengdu':[30.5723,104.0665],
  'Karst de Wulong':[29.3568,107.7560],
  'Furong':[28.9822,109.6753],
  'Zhangjiajie':[29.1248,110.4795],
};

const TYPE_COLOR={activite:'#7c3aed',restaurant:'#ea580c',cafe:'#0891b2',hotel:'#e85d5d'};
const TYPE_EMOJI={activite:'🎯',restaurant:'🍜',cafe:'☕',hotel:'🏨'};

function getItemCoords(item){
  if(item.lat&&item.lng)return[parseFloat(item.lat),parseFloat(item.lng)];
  // Pour les transports : utiliser les coords DEP_LAT/DEP_LNG si disponibles
  if(item.type==='transport'&&item.notes){
    const latM=item.notes.match(/DEP_LAT:([\d.,-]+)/);
    const lngM=item.notes.match(/DEP_LNG:([\d.,-]+)/);
    if(latM&&lngM)return[parseFloat(latM[1]),parseFloat(lngM[1])];
  }
  const base=VILLE_COORDS[item.ville||''];
  if(!base)return null;
  const seed=String(item.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const jitter=(s,r)=>((s*9301+49297)%233280/233280-.5)*r;
  return[base[0]+jitter(seed,0.012),base[1]+jitter(seed*7,0.012)];
}

// Coords arrivée pour les transports (2ème marqueur)
function getTransportArrCoords(item){
  if(item.type!=='transport'||!item.notes)return null;
  const latM=item.notes.match(/ARR_LAT:([\d.,-]+)/);
  const lngM=item.notes.match(/ARR_LNG:([\d.,-]+)/);
  if(latM&&lngM)return[parseFloat(latM[1]),parseFloat(lngM[1])];
  return null;
}

function buildMarkerIcon(type,isMe=false){
  const color=isMe?'#3b82f6':(TYPE_COLOR[type]||'#888');
  const emoji=isMe?'📍':(TYPE_EMOJI[type]||'📍');
  return L.divIcon({
    className:'',
    html:`<div style="
      width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${color};display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 14px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.8);
    "><span style="transform:rotate(45deg);font-size:1rem;line-height:1;">${emoji}</span></div>`,
    iconSize:[34,34],iconAnchor:[17,34],popupAnchor:[0,-36]
  });
}

function buildMeIcon(){
  return L.divIcon({
    className:'',
    html:`<div style="
      width:22px;height:22px;border-radius:50%;background:#3b82f6;
      border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.3),0 4px 12px rgba(0,0,0,.2);
    "></div>`,
    iconSize:[22,22],iconAnchor:[11,11]
  });
}

function initMap(){
  if(mapInst){mapInst.invalidateSize();renderMapMarkers();return;}
  const mapEl=document.getElementById('map');
  if(!mapEl)return;

  // Init carte centrée sur Shanghai par défaut
  mapInst=L.map('map',{zoomControl:false,attributionControl:false}).setView([31.2,121.47],11);

  // CartoDB Voyager — pas de restriction referer, fonctionne partout
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
    subdomains:'abcd',maxZoom:19,attribution:'© OpenStreetMap © CARTO'
  }).addTo(mapInst);

  // Attribution discrète
  L.control.attribution({position:'bottomleft',prefix:false}).addTo(mapInst);

  // Zoom controls personnalisés
  L.control.zoom({position:'topright'}).addTo(mapInst);

  renderMapMarkers();

  // Start GPS watch automatically
  startGPS();
}

const MAP_LAYERS=[
  {name:'Carte',url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',opts:{subdomains:'abcd',maxZoom:19}},
  {name:'Sombre',url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',opts:{subdomains:'abcd',maxZoom:19}},
  {name:'Satellite',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',opts:{maxZoom:19}},
];
let currentLayer=null;
function cycleMapLayer(){
  if(!mapInst)return;
  mapLayerIdx=(mapLayerIdx+1)%MAP_LAYERS.length;
  if(currentLayer)mapInst.removeLayer(currentLayer);
  const l=MAP_LAYERS[mapLayerIdx];
  currentLayer=L.tileLayer(l.url,l.opts||{maxZoom:19}).addTo(mapInst);
  showToast('🗺️ '+l.name);
}

function renderMapMarkers(){
  if(!mapInst)return;
  // Clear old markers
  mapMarkers.forEach(m=>m.remove());
  mapMarkers=[];

  const types=['activite','restaurant','cafe','hotel'];
  const items=D.items.filter(x=>types.includes(x.type));

  items.forEach(item=>{
    const coords=getItemCoords(item);
    if(!coords)return;

    // Filtre
    if(mapFilter!=='all'&&mapFilter!=='proche'&&mapFilter!=='planifie'){
      if(item.type!==mapFilter)return;
    }
    if(mapFilter==='planifie'&&getItemStatut(item)!=='planifie')return;
    if(mapFilter==='proche'&&myPos){
      const dist=getDistKm(myPos.lat,myPos.lng,coords[0],coords[1]);
      if(dist>2)return;
    }
    if(mapFilter==='proche500'&&myPos){
      const dist=getDistKm(myPos.lat,myPos.lng,coords[0],coords[1]);
      if(dist>0.5)return;
    }

    // Distance depuis ma position
  const distKm=getDistFromMe(item);
  const distBadge=distKm!==null?(distKm<0.5?`<span class="proche-badge">📍 ${Math.round(distKm*1000)}m</span>`:distKm<2?`<span class="proche-badge" style="background:#f0fdf4;color:#166534;">📍 ${Math.round(distKm*10)/10}km</span>`:''):'';

  const statut=getItemStatut(item);
    const statutLabel={idee:'💡 Idée',planifie:'📅 Planifié',fait:'✅ Fait'}[statut]||'💡 Idée';
    const dist=myPos?Math.round(getDistKm(myPos.lat,myPos.lng,coords[0],coords[1])*1000)+'m':null;
    const prix=parseFloat(item.prix||0);

    const marker=L.marker(coords,{icon:buildMarkerIcon(item.type)});

    const popupHtml=`<div class="map-popup">
      <div class="mp-type">${TYPE_EMOJI[item.type]||'📍'} ${esc(item.type?.toUpperCase()||'')}</div>
      <div class="mp-name">${esc(item.nom)}</div>
      <div class="mp-meta">${esc(item.ville||'')}${item.quartier&&item.quartier!=='À définir'?' · '+esc(item.quartier):''}${dist?' · 📍 '+dist:''}${!(item.lat&&item.lng)?'<span style="color:#f59e0b;font-size:.6rem;"> ⚠️ approx.</span>':''}</div>
      <span class="mp-statut ${statut}">${statutLabel}</span>
      ${prix>0?`<div class="mp-meta">💰 ${fmtE(prix)}</div>`:''}
      <div class="mp-actions">
        <button class="mp-btn" onclick="event.stopPropagation();changeStatutFromMap('${item.id}')">✏️ Statut</button>
        <button class="mp-btn nav" onclick="event.stopPropagation();navigateToItem(${JSON.stringify({nom:item.nom,lat:coords[0],lng:coords[1],adresse_cn:item.adresse_cn||''}).replace(/"/g,'&quot;')})">🧭 Y aller</button>
      </div>
    </div>`;

    marker.bindPopup(popupHtml,{maxWidth:240,closeButton:true});
    marker.addTo(mapInst);
    mapMarkers.push(marker);

    // Pour les transports : ajouter aussi le marqueur d'arrivée + ligne
    if(item.type==='transport'){
      const arrCoords=getTransportArrCoords(item);
      const arrAddr=item.notes?(item.notes.match(/ARR_ADDR:([^|]+)/)||['',''])[1].trim():'';
      if(arrCoords){
        const arrMarker=L.marker(arrCoords,{icon:buildMarkerIcon('transport')});
        const arrPayload = JSON.stringify({ nom: arrAddr || item.nom, lat: arrCoords[0], lng: arrCoords[1] }).replace(/"/g,'&quot;');
        const arrPopup='<div class="map-popup"><div class="mp-type">🏁 ARRIVÉE</div><div class="mp-name">'+(arrAddr||esc(item.nom))+'</div><div class="mp-meta">'+esc(item.nom)+'</div><div class="mp-actions"><button class="mp-btn nav" onclick="navigateToItem(JSON.parse(this.dataset.payload))" data-payload="'+arrPayload+'">🧭 Y aller</button></div></div>';
        arrMarker.bindPopup(arrPopup,{maxWidth:240});
        arrMarker.addTo(mapInst);
        mapMarkers.push(arrMarker);
        // Ligne entre départ et arrivée
        const line=L.polyline([coords,arrCoords],{color:'#0891b2',weight:2,dashArray:'6,4',opacity:0.6});
        line.addTo(mapInst);
        mapMarkers.push(line);
      }
    }
  });

  // "Proches de moi" dans la barre filtre activités aussi
  updateProcheBadges();
  // Clustering basique : compter par ville et afficher bulle si zoom<11
  if(mapInst&&mapInst.getZoom()<11){
    const byCityCoords={};
    mapMarkers.forEach(m=>{
      const ll=m.getLatLng();
      const cityKey=Math.round(ll.lat*10)/10+','+Math.round(ll.lng*10)/10;
      if(!byCityCoords[cityKey])byCityCoords[cityKey]={lat:ll.lat,lng:ll.lng,count:0};
      byCityCoords[cityKey].count++;
      if(byCityCoords[cityKey].count>1)m.setOpacity(0);
    });
    Object.values(byCityCoords).filter(c=>c.count>1).forEach(c=>{
      const cl=L.marker([c.lat,c.lng],{icon:L.divIcon({
        className:'',
        html:'<div style="background:var(--accent);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.25);">'+c.count+'</div>',
        iconSize:[28,28],iconAnchor:[14,14]
      })});
      cl.addTo(mapInst);mapMarkers.push(cl);
    });
  }
}

function toggleMapFilter(f,el){
  mapFilter=f;
  document.querySelectorAll('.map-f-chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  renderMapMarkers();
}

function fitAllMarkers(){
  if(!mapInst)return;
  if(mapMarkers.length===0){mapInst.setView([31.2,121.47],11);return;}
  const group=L.featureGroup(mapMarkers);
  mapInst.fitBounds(group.getBounds().pad(0.15));
}
