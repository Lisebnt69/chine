// ══ GRAPHIQUE BUDGET PAR JOUR ══
function renderBudgetChart(){
  const cont=document.getElementById('budgetChartCont');
  if(!cont)return;
  cont.innerHTML='';

  // ── Graphique par catégorie ──
  const byCat={};
  D.budget.forEach(r=>{
    const cat=(r.categorie||'Divers').replace(/^[^\s]+ /,'');
    byCat[cat]=(byCat[cat]||0)+parseFloat(r.total||0);
  });
  const catEntries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,7);

  // ── Graphique chronologique par jour de voyage ──
  // Les jours du voyage : 09/11 → 22/11
  const tripStart=new Date('2026-11-09');
  const byDay={};
  // Associer chaque dépense budget à un jour via item_id → item.date ou created_at
  D.budget.forEach(r=>{
    // Chercher la date via l'item lié
    const item=r.item_id?D.items.find(x=>x.id===r.item_id):null;
    let dateStr=null;
    if(item&&item.adresse&&item.adresse.match(/^\d{4}-\d{2}-\d{2}$/))dateStr=item.adresse;
    if(!dateStr){
      // Fallback : jour courant ou J1
      dateStr=new Date().toISOString().split('T')[0];
    }
    byDay[dateStr]=(byDay[dateStr]||0)+parseFloat(r.total||0);
  });

  const dayEntries=Object.entries(byDay).sort(([a],[b])=>a.localeCompare(b)).slice(0,14);
  const maxDay=dayEntries.length?Math.max(...dayEntries.map(e=>e[1])):0;

  let html='<div class="budget-chart-wrap">';

  // Switcher cat / jour
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    +'<div class="budget-chart-title" style="margin:0;">💰 Dépenses</div>'
    +'<div style="display:flex;gap:4px;">'
    +'<button id="bcSwitchCat" class="pvs-btn on" style="padding:4px 10px;font-size:.64rem;" data-mode="cat" onclick="switchBudgetChart(this.dataset.mode)">Par type</button>'
    +'<button id="bcSwitchDay" class="pvs-btn" style="padding:4px 10px;font-size:.64rem;" data-mode="day" onclick="switchBudgetChart(this.dataset.mode)">Par jour</button>'
    +'</div></div>';

  // Bars catégorie
  if(catEntries.length){
    const maxCat=Math.max(...catEntries.map(e=>e[1]));
    html+='<div id="bcCat"><div class="budget-chart-bars">'
      +catEntries.map(([cat,val])=>{
        const h=maxCat>0?Math.round((val/maxCat)*72):2;
        return '<div class="bc-bar-wrap"><div class="bc-val">'+Math.round(val)+'€</div>'
          +'<div class="bc-bar" style="height:'+h+'px;"></div>'
          +'<div class="bc-label">'+cat.slice(0,7)+'</div></div>';
      }).join('')
      +'</div></div>';
  }

  // Bars par jour
  if(dayEntries.length&&maxDay>0){
    html+='<div id="bcDay" style="display:none;"><div class="budget-chart-bars">'
      +dayEntries.map(([date,val])=>{
        const h=Math.round((val/maxDay)*72)||2;
        const parts=date.split('-');const lbl=parts[2]+'/'+parts[1];
        return '<div class="bc-bar-wrap"><div class="bc-val">'+Math.round(val)+'€</div>'
          +'<div class="bc-bar" style="height:'+h+'px;background:linear-gradient(180deg,#60a5fa,#3b82f6);"></div>'
          +'<div class="bc-label">'+lbl+'</div></div>';
      }).join('')
      +'</div></div>';
  }

  html+='</div>';
  cont.innerHTML=html;
}

function switchBudgetChart(mode){
  document.getElementById('bcCat').style.display=mode==='cat'?'':'none';
  const d=document.getElementById('bcDay');if(d)d.style.display=mode==='day'?'':'none';
  document.getElementById('bcSwitchCat').classList.toggle('on',mode==='cat');
  document.getElementById('bcSwitchDay').classList.toggle('on',mode==='day');
}

// ══ SCORE VOYAGE ══
function renderVoyageScore(cont){
  const acts=D.items.filter(x=>x.type==='activite');
  const done=acts.filter(x=>getItemStatut(x)==='fait').length;
  const total=acts.length||1;
  const pct=Math.round(done/total*100);
  const transOk=D.items.filter(x=>x.type==='transport'&&x.fait).length;
  const hotelsOk=D.items.filter(x=>x.type==='hotel'&&x.fait).length;
  // Km approximatifs selon villes visitées
  const KM_VILLES={'Shanghai':0,'Chongqing':1450,'Chengdu':1700,'Karst de Wulong':1500,'Furong':1200,'Zhangjiajie':1050};
  const villesTouched=[...new Set(D.items.map(x=>x.ville).filter(Boolean))];
  const kmTotal=villesTouched.reduce((s,v)=>s+(KM_VILLES[v]||0),0);
  const scorePct=Math.round((done*2+transOk+hotelsOk)/(total*2+3+2)*100);
  cont.insertAdjacentHTML('afterbegin','<div class="voyage-score">'
    +'<div class="vs-title">Score voyage</div>'
    +'<div class="vs-score">'+scorePct+'<span style="font-size:1rem;opacity:.6;">%</span></div>'
    +'<div class="vs-sub">'+done+'/'+total+' activités · ~'+kmTotal.toLocaleString('fr-FR')+'km parcourus · '
    +transOk+' transport'+( transOk>1?'s':'')+' faits</div>'
    +'<div class="vs-progress"><div class="vs-progress-fill" style="width:'+scorePct+'%;"></div></div>'
    +'</div>');
}

// ══ PRATIQUE CHINE ══
function renderPratique(){
  const cont=document.getElementById('pratiqueCont');
  if(!cont||cont.dataset.rendered)return;
  cont.dataset.rendered='1';

  // VPN checklist
  const vpnItems=['Telecharger VPN avant depart (ExpressVPN / NordVPN)','Activer le VPN des atterrissage','Verifier connexion : google.com accessible ?','Installer WeChat + Alipay avant de partir','Telecharger Google Maps offline Chine','Sauvegarder contacts urgence hors-ligne'];
  const vpnKey='vpn_checks';
  let vpnDone=JSON.parse(localStorage.getItem(vpnKey)||'{}');

  const sections=[
    {icon:'🔒',title:'Checklist VPN & Apps',content:()=>{
      const d=document.createElement('div');
      vpnItems.forEach((item,i)=>{
        const row=document.createElement('div');row.className='vpn-item';
        row.innerHTML='<input type="checkbox" class="vpn-cb" id="vpn_'+i+'"'+(vpnDone[i]?' checked':'')+'>'
          +'<label class="vpn-label" for="vpn_'+i+'">'+item+'</label>';
        row.querySelector('input').onchange=function(){vpnDone[i]=this.checked;localStorage.setItem(vpnKey,JSON.stringify(vpnDone));};
        d.appendChild(row);
      });
      return d;
    }},
    {icon:'🚨',title:'Numeros urgence',content:()=>{
      const nums=[
        ['110','Police','Equipe SAMU'],['119','Pompiers','Incendie'],['120','SAMU','Urgences médicales'],
        ['122','Route','Accidents de la route'],['12320','Santé','Infos sanitaires'],['999','Ambulance','Dans certaines villes'],
      ];
      const d=document.createElement('div');
      nums.forEach(([num,name,desc])=>{
        d.innerHTML+='<div class="urgence-row"><div class="urgence-num">'+num+'</div><div class="urgence-info"><div class="urgence-name">'+name+'</div><div class="urgence-desc">'+desc+'</div></div>'
          +'<a href="tel:'+num+'" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:.72rem;font-weight:600;text-decoration:none;">📞</a></div>';
      });
      return d;
    }},
    {icon:'💸',title:'WeChat Pay & Alipay',content:()=>{
      const d=document.createElement('div');
      d.innerHTML='<div class="qr-grid">'
        +'<div class="qr-card"><div class="qr-code">💚</div><div class="qr-label">WeChat Pay</div><div style="font-size:.62rem;color:var(--txt2);margin-top:3px;">Scanner pour recevoir</div></div>'
        +'<div class="qr-card"><div class="qr-code">💙</div><div class="qr-label">Alipay</div><div style="font-size:.62rem;color:var(--txt2);margin-top:3px;">Scanner pour recevoir</div></div>'
        +'</div><div style="font-size:.7rem;color:var(--txt2);margin-top:10px;line-height:1.5;">💡 Linkez une carte bancaire internationale avant de partir. WeChat Pay et Alipay acceptent désormais les cartes Visa/Mastercard étrangères.</div>';
      return d;
    }},
    {icon:'🌐',title:'Applis indispensables',content:()=>{
      const apps=[
        ['🗺️','Amap (高德地图)','Navigation GPS en Chine'],['🚇','Metro Shanghai','Plan du métro offline'],
        ['🍜','Meituan','Commande de nourriture'],['🚖','DiDi','VTC (Uber chinois)'],
        ['💬','WeChat','Messagerie + paiements'],['🔒','VPN','Accès Google, Instagram…'],
      ];
      const d=document.createElement('div');
      d.innerHTML=apps.map(([ic,name,desc])=>'<div class="urgence-row"><div style="font-size:1.2rem;min-width:32px;text-align:center;">'+ic+'</div>'
        +'<div class="urgence-info"><div class="urgence-name">'+name+'</div><div class="urgence-desc">'+desc+'</div></div></div>').join('');
      return d;
    }},
    {icon:'💊',title:'Pharmacies & Santé',content:()=>{
      const d=document.createElement('div');
      d.innerHTML='<div style="font-size:.8rem;line-height:1.7;color:var(--txt);">'
        +'🏥 <b>Hôpitaux internationaux :</b><br>'
        +'• Shanghai : Huashan Hospital International (021-5288-9999)<br>'
        +'• Chongqing : Southwest Hospital (023-6875-5000)<br>'
        +'• Chengdu : West China Hospital (028-8542-2114)<br><br>'
        +'💊 <b>Médicaments à emporter :</b> Imodium, Smecta, Doliprane, antihistaminiques, pansements, crème solaire.<br><br>'
        +'🚿 <b>Eau :</b> Ne jamais boire l\'eau du robinet. Acheter de leau en bouteille partout.</div>';
      return d;
    }},
  ];

  sections.forEach((sec,i)=>{
    const div=document.createElement('div');div.className='pratique-section';
    const head=document.createElement('div');head.className='pratique-head';
    head.innerHTML='<span class="pratique-icon">'+sec.icon+'</span><span class="pratique-title">'+sec.title+'</span><span class="pratique-arr" id="parr_'+i+'">▼</span>';
    const body=document.createElement('div');body.className='pratique-body';
    const built=sec.content();
    if(typeof built==='string')body.innerHTML=built;
    else body.appendChild(built);
    head.onclick=()=>{body.classList.toggle('open');document.getElementById('parr_'+i).style.transform=body.classList.contains('open')?'rotate(180deg)':'';};
    div.appendChild(head);div.appendChild(body);
    cont.appendChild(div);
  });
}

// ══ RAPPEL J-1 TRANSPORT ══
function checkTransportRappels(){
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr=tomorrow.toISOString().split('T')[0];
  const transports=D.items.filter(x=>x.type==='transport'&&x.adresse===tomorrowStr&&!x.fait);
  if(!transports.length)return;
  // Demander permission notification
  const shown=localStorage.getItem('rappel_'+tomorrowStr);
  if(shown)return;
  localStorage.setItem('rappel_'+tomorrowStr,'1');
  transports.forEach(t=>{
    showToast('⚠️ Demain : '+t.nom+' ('+( t.prix_type||'transport')+')',5000);
  });
  // Notification native si permission accordée
  if('Notification' in window&&Notification.permission==='granted'){
    transports.forEach(t=>{
      new Notification('🚄 Rappel voyage',{body:'Demain : '+t.nom,icon:'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏮</text></svg>'});
    });
  }else if('Notification' in window&&Notification.permission!=='denied'){
    Notification.requestPermission().then(p=>{
      if(p==='granted')checkTransportRappels();
    });
  }
}

function parseWidgetTimeToMinutes(value, fallback){
  const txt=String(value||'').trim();
  if(!txt) return fallback;
  const m=txt.match(/(\d{1,2})\s*[h:](\d{0,2})/i);
  if(m) return Math.min(23,parseInt(m[1],10))*60 + Math.min(59,parseInt(m[2]||'0',10));
  const n=txt.match(/\b(\d{1,2})\b/);
  if(n) return Math.min(23,parseInt(n[1],10))*60;
  return fallback;
}

function widgetIsoStamp(dateStr, minutes){
  if(!dateStr) return '';
  const h=String(Math.floor((minutes||0)/60)).padStart(2,'0');
  const m=String((minutes||0)%60).padStart(2,'0');
  return `${dateStr}T${h}:${m}:00`;
}

function getActivityWidgetMinutes(day, slot){
  const p=slot && slot.periode || '';
  if(p==='Matin') return parseWidgetTimeToMinutes(day.matin_h, 9*60);
  if(p==='Après-midi') return parseWidgetTimeToMinutes(day.aprem_h, 14*60);
  if(p==='Soir') return parseWidgetTimeToMinutes(day.soir_h, 19*60);
  if(p==='Journée') return parseWidgetTimeToMinutes(day.matin_h, 9*60);
  return 12*60;
}

function updateNextStep() {
  const now = new Date();
  const todayStr = now.toLocaleDateString('sv-SE');
  const container = document.getElementById('nextStepWidget');
  if (!container) return;

  const candidates=[];

  D.items
    .filter(x=>x.type==='transport' && !x.fait)
    .forEach(x=>{
      let date=x.adresse||'';
      if(!date){
        const slot=D.slots.find(s=>s.item_id===x.id);
        if(slot){
          const day=D.planning.find(p=>p.id===slot.planning_id);
          if(day) date=day.date_voyage||'';
        }
      }
      if(!date) return;
      const minutes=parseWidgetTimeToMinutes(x.quartier, 8*60);
      const iso=widgetIsoStamp(date, minutes);
      candidates.push({
        kind:'transport',
        date,
        iso,
        minutes,
        item:x,
        title:x.nom,
        icon:(x.prix_type||'').split(' ')[0]||'🚄',
        sub:esc(x.quartier||'')+(x.description?' → '+esc(x.description):''),
        tab:'transport'
      });
    });

  D.planning.forEach(day=>{
    if(!day.date_voyage || day.date_voyage<todayStr) return;
    D.slots
      .filter(s=>s.planning_id===day.id)
      .forEach(slot=>{
        const item=D.items.find(x=>x.id===slot.item_id);
        if(!item || item.fait) return;
        if(!['activite','restaurant','cafe'].includes(item.type)) return;
        const minutes=getActivityWidgetMinutes(day, slot);
        candidates.push({
          kind:'activite',
          date:day.date_voyage,
          iso:widgetIsoStamp(day.date_voyage, minutes),
          minutes,
          item,
          title:item.nom,
          icon:TYPE_IC[item.type]||'🎯',
          sub:esc(item.ville||'')+(item.quartier?' · '+esc(item.quartier):''),
          tab:'activites'
        });
      });
  });

  const nowIso = now.toISOString();
  const sorted=[...candidates].sort((a,b)=>a.iso!==b.iso ? a.iso.localeCompare(b.iso) : a.title.localeCompare(b.title));
  const next = sorted.find(x=>x.iso >= nowIso || x.date > todayStr) || sorted[0];

  if(!next){ container.style.display='none'; return; }

  const tomorrow=new Date(now.getTime()+86400000).toLocaleDateString('sv-SE');
  const hh=String(Math.floor((next.minutes||0)/60)).padStart(2,'0');
  const mm=String((next.minutes||0)%60).padStart(2,'0');
  const when=next.date===todayStr?'🚀 Aujourd\'hui':next.date===tomorrow?'⏰ Demain':'📅 '+(next.date||'').split('-').reverse().slice(0,2).join('/');
  const tag=`${when} · ${hh}h${mm}`;

  container.style.display='block';
  container.innerHTML=`<div class="widget-mini" onclick="goTabByName('${next.tab}')">
    <div class="widget-icon">${next.icon}</div>
    <div class="widget-body">
      <div class="widget-tag">${tag}</div>
      <div class="widget-title">${esc(next.title)}</div>
      <div class="widget-sub">${next.sub}</div>
    </div>
    <div class="widget-go" onclick="event.stopPropagation();window.open('https://www.amap.com/search?query=${encodeURIComponent(next.title)}','_blank')">🗺️</div>
  </div>`;
}
  function speakChinese(text) {
  if (!('speechSynthesis' in window)) {
    alert("Désolé, votre téléphone ne supporte pas la synthèse vocale.");
    return;
  }
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = 'zh-CN'; // Force la langue en Chinois Mandarin
  msg.rate = 0.8;    // Un peu plus lent pour bien comprendre
  window.speechSynthesis.speak(msg);
}
document.addEventListener('DOMContentLoaded', () => {
  // S'assurer que le login screen est caché si on a un user
  const loginScr = document.getElementById('loginScreen');
  if(!currentUser){
    if(loginScr) loginScr.classList.remove('hidden');
    document.getElementById('loader').style.display='none';
  } else {
    // Utilisateur déjà en localStorage → cacher le login screen immédiatement
    if(loginScr) loginScr.classList.add('hidden');
    editorUnlocked = (currentUser !== 'visiteur') && localStorage.getItem('chine_editor') === '1';
    init()
      .then(() => {
        updateEditorUI();
        updateProfilUI();
        const u = USERS[currentUser];
        if(u && currentUser !== 'visiteur') showToast(u.emoji + ' Re-bonjour ' + u.name + ' !');
        checkTransportRappels();
      })
      .catch(err => {
        console.error(err);
        const msg = document.getElementById('loader-msg');
        if(msg) msg.textContent = 'Erreur : ' + (err?.message || err);
      });
  }
});

// ── LOGIN ──
function loginAs(who){
  const u = USERS[who];
  if(!u) return;

  // Visiteur = accès direct en lecture seule
  if(who === 'visiteur'){
    currentUser = 'visiteur';
    localStorage.setItem('chine_user', 'visiteur');
    localStorage.removeItem('chine_editor'); // visiteur jamais éditeur
    sessionStorage.removeItem('editor_unlocked');
    closeLoginModal();
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('loader').style.display = 'flex';

    init()
      .then(() => {
        updateEditorUI();
        updateProfilUI();
        showWelcome();
      })
      .catch(err => {
        const m = document.getElementById('loader-msg');
        if(m) m.textContent = 'Erreur : ' + (err?.message || err);
      });
    return;
  }

  // Matis / Lise = popup mot de passe
  openLoginModal(who, u.name);
}

function updateProfilUI(){
  if(!currentUser) return;
  const u = USERS[currentUser];
  if(!u) return;

  const isVisitor = currentUser === 'visiteur';
  const pill = document.getElementById('profilPill');
  const av = document.getElementById('profilAv');
  const name = document.getElementById('profilName');
  const settBtn = document.getElementById('settingsBtn');
  const vBanner = document.getElementById('visitorBanner');
  const visitorSettingsBlock = document.getElementById('visitorSettingsBlock');
  const memberSettingsBlock = document.getElementById('memberSettingsBlock');
  const settingsUserMode = document.getElementById('settingsUserMode');
  const chatBtn = document.getElementById('chatBtn');
  const chatTab = document.getElementById('tab-chat');

  document.body.classList.toggle('visitor-mode', isVisitor);

  if(isVisitor){
    if(pill) pill.style.display = 'none';
    if(settBtn) settBtn.style.display = 'flex';
    if(vBanner) vBanner.classList.add('on');
    if(visitorSettingsBlock) visitorSettingsBlock.style.display = 'block';
    if(memberSettingsBlock) memberSettingsBlock.style.display = 'none';
    if(settingsUserMode){
      settingsUserMode.textContent = '👁️ Visiteur · lecture seule';
      settingsUserMode.style.color = 'var(--accent)';
    }
    if(chatBtn) chatBtn.style.display = 'none';
    if(chatTab) chatTab.style.display = 'none';
    if(document.getElementById('tab-chat')?.classList.contains('on')){
      const firstBtn = document.querySelector('.nav .nb');
      goTab('budget', firstBtn);
    }
    updateEditorUI();
  } else {
    if(pill){
      pill.style.display = 'flex';
      if(av){
        av.className = 'profil-mini-av ' + u.av;
        av.textContent = u.emoji;
      }
      if(name) name.textContent = u.name;
    }
    if(settBtn) settBtn.style.display = 'none';
    if(vBanner) vBanner.classList.remove('on');
    if(visitorSettingsBlock) visitorSettingsBlock.style.display = 'none';
    if(memberSettingsBlock) memberSettingsBlock.style.display = 'block';
    if(settingsUserMode){
      settingsUserMode.textContent = '✏️ Compte éditeur';
      settingsUserMode.style.color = 'var(--green)';
    }
    if(chatBtn) chatBtn.style.display = '';
    if(chatTab) chatTab.style.display = '';
  }

  const avSettings = document.getElementById('settingsUserAv');
  const nm = document.getElementById('settingsUserName');
  if(avSettings){
    avSettings.textContent = u.emoji;
    avSettings.style.background = u.bg;
  }
  if(nm) nm.textContent = u.name;
}

function showWelcome(){
  const u = USERS[currentUser];
  if(!u) return;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  showToast(u.emoji + ' ' + greet + ' ' + u.name + ' !');

  if(typeof addBotMessage === 'function'){
    setTimeout(() => {
      addBotMessage(`${u.emoji} ${greet} ${u.name} ! Je suis ton assistant de voyage. Pose-moi une question sur le planning, le budget, ou les activités.`);
    }, 800);
  }
}

function logout(){
  currentUser = null;
  localStorage.removeItem('chine_user');
  localStorage.removeItem('chine_editor');
  location.reload();
}

async function changePin(){
  if(!currentUser || currentUser === 'visiteur'){
    showToast('Non connecté');
    return;
  }

  const old = document.getElementById('pp-pin-old')?.value || '';
  const nw = document.getElementById('pp-pin-new')?.value || '';
  const cf = document.getElementById('pp-pin-confirm')?.value || '';

  const { data, error: readError } = await sb
    .from('user_pins')
    .select('pin')
    .eq('user_key', currentUser)
    .single();

  if(readError || !data){
    showToast('❌ Impossible de lire le mot de passe actuel');
    return;
  }

  if(old !== data.pin){
    showToast('❌ MDP actuel incorrect');
    return;
  }

  if(!nw || nw.length < 4){
    showToast('❌ Nouveau MDP trop court (min 4 car.)');
    return;
  }

  if(nw !== cf){
    showToast('❌ Les deux MDP ne correspondent pas');
    return;
  }

  const { error } = await sb
    .from('user_pins')
    .upsert({
      user_key: currentUser,
      pin: nw,
      updated_at: new Date().toISOString()
    });

  if(error){
    showToast('❌ Erreur BDD : ' + error.message);
    return;
  }

  showToast('✅ Mot de passe changé !');

  ['pp-pin-old','pp-pin-new','pp-pin-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

async function submitLogin(){
  const entered = document.getElementById('loginPassword')?.value || '';
  const who = loginTargetUser;

  if(!who) return;

  const { data, error } = await sb
    .from('user_pins')
    .select('pin')
    .eq('user_key', who)
    .single();

  if(error || !data){
    alert('❌ Erreur récupération mot de passe');
    return;
  }

  if(entered !== data.pin){
    alert('❌ Mot de passe incorrect');
    return;
  }

  currentUser = who;
  localStorage.setItem('chine_user', who);
  localStorage.setItem('chine_editor', '1'); // Session éditeur

  closeLoginModal();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('loader').style.display = 'flex';

  init()
    .then(() => {
      updateEditorUI();
      updateProfilUI();
      showWelcome();
    })
    .catch(err => {
      const m = document.getElementById('loader-msg');
      if(m) m.textContent = 'Erreur : ' + (err?.message || err);
    });
}

const loginPasswordEl = document.getElementById('loginPassword');
if(loginPasswordEl){
  loginPasswordEl.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      submitLogin();
    }
  });
}
