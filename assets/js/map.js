// ══ GPS ══
function startGPS(){
  if(!navigator.geolocation){showToast('❌ GPS non disponible');return;}
  const banner=document.getElementById('gpsBanner');
  const txt=document.getElementById('gpsTxt');
  const acc=document.getElementById('gpsAcc');
  if(banner)banner.classList.add('on');
  if(txt)txt.textContent='Recherche GPS…';

  watchId=navigator.geolocation.watchPosition(
    pos=>{
      myPos={lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy};
      const accM=Math.round(myPos.acc);
      if(txt)txt.textContent='Position trouvée';
      if(acc)acc.textContent='± '+accM+'m';
      if(banner)setTimeout(()=>banner.classList.remove('on'),3000);
      updateMeOnMap();
      updateProcheBadges();
      renderMapMarkers();
    },
    err=>{
      if(txt)txt.textContent='GPS indisponible';
      if(acc)acc.textContent=err.message;
      setTimeout(()=>{if(banner)banner.classList.remove('on');},2500);
    },
    {enableHighAccuracy:true,timeout:15000,maximumAge:10000}
  );
}

function updateMeOnMap(){
  if(!mapInst||!myPos)return;
  const pos=[myPos.lat,myPos.lng];
  if(meMarker){meMarker.setLatLng(pos);}
  else{meMarker=L.marker(pos,{icon:buildMeIcon(),zIndexOffset:1000}).addTo(mapInst);meMarker.bindPopup('<div style="padding:8px;font-size:.82rem;font-weight:600;">📍 Vous êtes ici<br><span style="font-size:.68rem;color:#888;">± '+Math.round(myPos.acc)+'m</span></div>');}
  if(meCircle){meCircle.setLatLng(pos).setRadius(myPos.acc);}
  else{meCircle=L.circle(pos,{radius:myPos.acc,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:.08,weight:1.5}).addTo(mapInst);}
}

function centerOnMe(){
  if(!myPos){startGPS();showToast('📍 Recherche GPS…');return;}
  if(!mapInst)return;
  mapInst.setView([myPos.lat,myPos.lng],15,{animate:true});
  const btn=document.getElementById('gpsBtn');
  if(btn){btn.classList.add('active');setTimeout(()=>btn.classList.remove('active'),1200);}
}

function getDistKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function updateProcheBadges(){
  // Met à jour le filtre "proche" dans renderItems si GPS dispo
  if(!myPos)return;
  // Rafraîchit les cartes pour afficher la distance
  // (on re-render silencieusement si l'onglet activités est visible)
  const act=document.getElementById('tab-activites');
  if(act&&act.classList.contains('on')){
    ['activite','restaurant','cafe'].forEach(t=>renderItems(t));
  }
}

// ══ NAVIGATION VERS UN LIEU ══
function navigateToItem(data){
  // data = {nom, lat, lng, adresse_cn}
  let d;
  try{d=typeof data==='string'?JSON.parse(data):data;}catch(e){return;}
  const lat=d.lat,lng=d.lng;
  const nom=d.nom||'';
  const adresseCn=d.adresse_cn||'';

  // Priority: Amap deeplink (works in China)
  // Format: https://uri.amap.com/navigation?to=lng,lat,name
  const amapNav=`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(nom)}&mode=walking&src=chine2026`;

  // Fallback: Amap web search
  const amapSearch=adresseCn
    ?`https://www.amap.com/search?query=${encodeURIComponent(adresseCn)}`
    :`https://www.amap.com/search?query=${encodeURIComponent(nom)}`;

  // Show choice
  showNavChoice(nom,amapNav,amapSearch,lat,lng);
}

function showNavChoice(nom,amapNav,amapSearch,lat,lng){
  // Remove existing
  const old=document.getElementById('navChoiceSheet');
  if(old)old.remove();

  const sheet=document.createElement('div');
  sheet.id='navChoiceSheet';
  sheet.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:flex-end;backdrop-filter:blur(4px);animation:fadeIn .2s ease;';
  sheet.innerHTML=`<div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:0 20px calc(20px + env(safe-area-inset-bottom));animation:slideUp .28s cubic-bezier(.4,0,.2,1);box-shadow:0 -18px 48px rgba(92,56,36,.18);">
    <div style="width:36px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 18px;"></div>
    <div style="font-size:1rem;font-weight:700;color:#231815;margin-bottom:4px;">🧭 Naviguer vers</div>
    <div style="font-size:.8rem;color:#6b5b53;margin-bottom:18px;">${esc(nom)}</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <a href="${amapNav}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:14px;background:linear-gradient(135deg,#e85d5d,#f59b7a);border-radius:14px;color:#fff;text-decoration:none;font-weight:600;font-size:.88rem;">
        <span style="font-size:1.3rem;">🧭</span>
        <div><div>Ouvrir dans Amap</div><div style="font-size:.68rem;opacity:.8;">Navigation GPS en temps réel</div></div>
      </a>
      <a href="${amapSearch}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:14px;background:#f7efe8;border:1.5px solid #eedfd3;border-radius:14px;color:#231815;text-decoration:none;font-weight:600;font-size:.88rem;">
        <span style="font-size:1.3rem;">🔍</span>
        <div><div>Rechercher sur Amap</div><div style="font-size:.68rem;color:#6b5b53;">Web — affiche l'adresse</div></div>
      </a>
      <a href="https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w" target="_blank" style="display:flex;align-items:center;gap:12px;padding:14px;background:#f0f8ff;border:1.5px solid #dbeafe;border-radius:14px;color:#1d4ed8;text-decoration:none;font-weight:600;font-size:.88rem;">
        <span style="font-size:1.3rem;">🍎</span>
        <div><div>Apple Plans</div><div style="font-size:.68rem;color:#3b82f6;">Fallback si Amap indispo</div></div>
      </a>
    </div>
    <button onclick="document.getElementById('navChoiceSheet').remove()" style="width:100%;margin-top:10px;padding:12px;background:#f7efe8;border:none;border-radius:12px;font-family:inherit;font-size:.86rem;color:#6b5b53;cursor:pointer;">Annuler</button>
  </div>`;
  sheet.onclick=e=>{if(e.target===sheet)sheet.remove();};
  document.body.appendChild(sheet);
}

async function changeStatutFromMap(itemId){
  const item=D.items.find(x=>x.id===itemId);
  if(!item)return;
  const current=getItemStatut(item);
  const next={idee:'planifie',planifie:'fait',fait:'idee'}[current]||'idee';
  await setStatut(itemId,next);
  setTimeout(()=>renderMapMarkers(),600);
}

// Filtre proche dans renderItems — ajout badge distance
function getDistFromMe(item){
  if(!myPos)return null;
  const coords=getItemCoords(item);
  if(!coords)return null;
  return getDistKm(myPos.lat,myPos.lng,coords[0],coords[1]);
}

// ══════════════════════════════════════════════════════════
// CHAT — Messages Supabase realtime + Bot IA locale
// ══════════════════════════════════════════════════════════
let chatInited=false;
let chatSub=null;
const deletedMsgIds=new Set(); // IDs supprimés localement

let chatPollInterval=null;
let lastChatCreatedAt=null;

document.addEventListener('click', e=>{
  const btn=e.target.closest('.chat-poll-opt-btn');
  if(btn){votePoll(btn.dataset.pollId, parseInt(btn.dataset.optIdx));}
});

async function initChat(){
  // Vider le badge
  const badge=document.getElementById('chatBadge');
  if(badge){badge.textContent='0';badge.style.display='none';}
  if(chatInited)return;
  chatInited=true;
  await loadChatHistory();

  // Lancer le polling immédiatement (fiable sur GitHub Pages)
  startChatPolling();

  // Tenter aussi le realtime pour plus de réactivité
  try{
    chatSub=sb.channel('chat-rt-'+Date.now())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},
        payload=>{if(payload.new){appendChatMsg(payload.new);scrollChat();}})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_messages'},
        payload=>{if(payload.new){updateChatMsg(payload.new);scrollChat();}})
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'chat_messages'},
        payload=>{if(payload.old?.id)removeChatMsg(payload.old.id);})
      .subscribe();
  }catch(e){}
}

async function loadChatHistory(){
  try{
    const {data,error}=await sb.from('chat_messages').select('*').order('created_at',{ascending:true}).limit(80);
    const msgs=document.getElementById('chatMessages');
    if(msgs)msgs.innerHTML='';
    if(error){showChatError();return;}
    if(data){
      const now=Date.now();
      data.forEach(m=>{
        // Ignorer les SNAP éphémères non sauvegardés (contenu SNAP: = pas encore converti en IMG:)
        // Un snap non sauvegardé après 10min = on ne le réaffiche pas
        if(m.content&&m.content.startsWith('SNAP:')){
          const age=(now-new Date(m.created_at).getTime())/1000;
          if(age>600)return; // >10min : ne pas recharger
        }
        appendChatMsg(m,false);
      });
      if(data.length>0)lastChatCreatedAt=data[data.length-1].created_at;
    }
    scrollChat();
  }catch(e){showChatError();}
}

function showChatError(){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  msgs.innerHTML=`<div style="text-align:center;padding:24px 16px;">
    <div style="font-size:2rem;margin-bottom:10px;">⚠️</div>
    <div style="font-size:.84rem;font-weight:600;color:var(--txt);margin-bottom:6px;">Table chat_messages manquante</div>
    <div style="font-size:.74rem;color:var(--txt2);line-height:1.5;">Crée la table dans Supabase SQL Editor :<br><code style="background:var(--sand);padding:4px 8px;border-radius:6px;font-size:.7rem;">create table chat_messages (id uuid default gen_random_uuid() primary key, author text not null, content text not null, created_at timestamptz default now());</code><br><br>Active aussi le <b>Realtime</b> sur cette table dans Database → Replication.</div>
  </div>`;
}

function startChatPolling(){
  if(chatPollInterval)return;
  chatPollInterval=setInterval(async()=>{
    try{
      const{data}=await sb.from('chat_messages')
        .select('*').order('created_at',{ascending:true})
        .gte('created_at', new Date(Date.now()-8000).toISOString())
        .limit(30);
      if(!data||!data.length)return;
      const now3=Date.now();
      data.forEach(m=>{
        // Ignorer IDs supprimés localement
        if(deletedMsgIds.has(String(m.id)))return;
        // Ignorer snaps expirés (>10min)
        if(m.content&&m.content.startsWith('SNAP:')){
          const age=(now3-new Date(m.created_at).getTime())/1000;
          if(age>600)return;
        }
        const existing=document.querySelector(`[data-msg-id="${m.id}"]`);
        if(!existing)appendChatMsg(m);
      });
      scrollChat();
    }catch(e){}
  }, 2500);
}

function removeChatMsg(id){
  document.querySelector(`[data-msg-id="${id}"]`)?.remove();
  if(D.chatMsgs)D.chatMsgs=D.chatMsgs.filter(m=>m.id!==id);
  deletedMsgIds.add(String(id)); // Mémoriser pour ne pas réafficher
}

function updateChatMsg(msg){
  const el=document.querySelector(`[data-msg-id="${msg.id}"]`);
  if(!el)return;
  el.dataset.msgContent=msg.content;
  const bubble=el.querySelector('.chat-bubble');
  if(!bubble)return;

  let displayContent=msg.content||'';
  let reacts={};
  const rsep=displayContent.lastIndexOf('||REACT:');
  if(rsep>=0){
    try{reacts=JSON.parse(displayContent.slice(rsep+8));}catch(e){}
    displayContent=displayContent.slice(0,rsep);
  }

  // Re-render bulle
  if(displayContent.startsWith('POLL:')){
    try{
      const poll=JSON.parse(displayContent.slice(5));
      const totalVotes=Object.keys(poll.votes||{}).length;
      const myVote=poll.votes?.[currentUser];
      const tv2=Object.values(poll.votes||{}).length;
      const mv2=(poll.votes||{})[currentUser];
      bubble.innerHTML='<div style="min-width:200px;">'
        +'<div style="font-weight:700;font-size:.84rem;margin-bottom:10px;">📊 '+esc(poll.question)+'</div>'
        +poll.options.map((opt,i)=>{
          const cnt=Object.values(poll.votes||{}).filter(v=>v===i).length;
          const pct=tv2?Math.round(cnt/tv2*100):0;
          const voted=mv2===i;
          return '<div data-poll-id="'+String(msg.id||'')+'" data-opt-idx="'+i+'" class="chat-poll-opt-btn" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;border:1.5px solid '+(voted?'#e85d5d':'#eedfd3')+';background:'+(voted?'#fff0e8':'#f9f9f9')+';margin-bottom:5px;cursor:pointer;font-size:.8rem;font-weight:'+(voted?'700':'400')+';">'
            +'<span style="flex:1;">'+esc(opt)+'</span>'
            +'<div style="width:60px;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#e85d5d;border-radius:2px;"></div></div>'
            +'<span style="font-size:.62rem;color:#6b5b53;min-width:24px;text-align:right;">'+pct+'%</span>'
            +'</div>';
        }).join('')
        +'<div style="font-size:.6rem;color:var(--txt3);margin-top:4px;">'+tv2+' vote'+(tv2>1?'s':'')+'</div>'
        +'</div>';
    }catch(e){}
  }else if(displayContent.startsWith('SNAP:')){
    const src=displayContent.slice(5);
    bubble.innerHTML=`<img class="chat-media-img" src="${src}" onclick="this.requestFullscreen&&this.requestFullscreen()">`;
  }else if(displayContent.startsWith('IMG:')){
    const src=displayContent.slice(4);
    bubble.innerHTML=`<img class="chat-media-img" src="${src}" onclick="this.requestFullscreen&&this.requestFullscreen()">`;
  }else if(displayContent.startsWith('VIDEO:')){
    const src=displayContent.slice(6);
    bubble.innerHTML=`<video class="chat-media-video" src="${src}" controls playsinline></video>`;
  }else{
    bubble.innerHTML=esc(displayContent).replace(/\n/g,'<br>');
  }

  if(msg.id)renderReactions(el,reacts,msg.id);
}

function appendChatMsg(msg,animate=true){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  // Éviter doublons (temp vs réel)
  if(msg.id&&!msg.id.startsWith('temp_')){
    const existing=msgs.querySelector(`[data-msg-id="${msg.id}"]`);
    if(existing)return;
    // Remplacer éventuel temp
    const temps=msgs.querySelectorAll('[data-msg-id^="temp_"]');
    temps.forEach(t=>{if(t.dataset.msgContent===msg.content)t.remove();});
  }
  if(!D.chatMsgs)D.chatMsgs=[];
  if(msg.id&&!D.chatMsgs.find(m=>m.id===msg.id))D.chatMsgs.push(msg);

  const isMe=msg.author===currentUser;
  const isBot=msg.author==='bot';
  const u=isBot?null:USERS[msg.author];
  const content=msg.content||'';

  const d=document.createElement('div');
  d.className='chat-msg '+(isBot?'bot':isMe?'me':'other');
  d.dataset.msgId=msg.id||'';
  d.dataset.msgContent=content;
  if(animate)d.style.animationDelay='0s';

  let displayContent=content;
  let initialReacts={};
  const rsep=content.lastIndexOf('||REACT:');
  if(rsep>=0){
    displayContent=content.slice(0,rsep);
    try{initialReacts=JSON.parse(content.slice(rsep+8));}catch(e){initialReacts={};}
  }

  const time=msg.created_at?new Date(msg.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
  const senderHtml=(!isMe&&!isBot&&u)?`<div class="chat-sender"><div class="chat-sender-av ${u.av}">${u.emoji}</div><span class="chat-sender-name">${u.name}</span></div>`:'';
  const botHtml=isBot?`<div class="chat-sender"><div class="chat-sender-av" style="background:#1e293b;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6rem;">🤖</div><span class="chat-sender-name" style="color:#64748b;">Assistant</span></div>`:'';

  let bubbleInner='';
  if(displayContent.startsWith('SNAP:')){
    const src=displayContent.slice(5);
    const sid='snap_'+(msg.id||Date.now());
    const isSender=isMe; // l'envoyeur ne peut pas ouvrir son propre snap
    if(isSender){
      // Envoyeur : juste "En attente que l'autre ouvre"
      bubbleInner='<div class="snap-wrap" id="'+sid+'">'
        +'<img class="snap-img" src="'+src+'" style="filter:blur(16px) brightness(.5);">'
        +'<div class="snap-overlay">'
        +'<span style="font-size:1.3rem;">📸</span>'
        +'<span class="snap-label">Photo envoyée</span>'
        +'<span style="font-size:.6rem;color:rgba(255,255,255,.7);margin-top:2px;">En attente En attente...</span>'
        +'</div>'
        +'</div>';
    }else{
      // Destinataire : peut voir + garder
      bubbleInner='<div style="display:inline-block;">'
        +'<div class="snap-wrap" id="'+sid+'">'
        +'<img class="snap-img" src="'+src+'">'
        +'<div class="snap-overlay">'
        +'<span style="font-size:1.5rem;">📸</span>'
        +'<span class="snap-label">Photo</span>'
        +'<div class="snap-actions">'
        +'<button class="snap-btn view" data-snap-sid="'+sid+'" onclick="viewSnap(this.dataset.snapSid,event)">👁 Voir</button>'
        +'</div>'
        +'</div>'
        +'</div>'
        // bouton Garder HORS overlay — visible après ouverture
        +'<button class="snap-btn save" id="save_'+sid+'" data-snap-sid="'+sid+'" data-snap-mid="'+String(msg.id||'')+'" onclick="saveSnap(this.dataset.snapSid,this.dataset.snapMid,event)" style="display:none;margin-top:6px;width:100%;">💾 Garder dans le chat</button>'
        +'</div>';
    }
  }else if(displayContent.startsWith('IMG:')){
    const src=displayContent.slice(4);
    bubbleInner=`<img class="chat-media-img" src="${src}" onclick="this.requestFullscreen&&this.requestFullscreen()">`;
  }else if(displayContent.startsWith('VIDEO:')){
    const src=displayContent.slice(6);
    bubbleInner=`<video class="chat-media-video" src="${src}" controls playsinline></video>`;
  }else if(displayContent.startsWith('POLL:')){
    try{
      const poll=JSON.parse(displayContent.slice(5));
      const totalVotes=Object.values(poll.votes||{}).length;
      const myVote=(poll.votes||{})[currentUser];
      const optsHtml=poll.options.map((opt,i)=>{
        const cnt=Object.values(poll.votes||{}).filter(v=>v===i).length;
        const pct=totalVotes?Math.round(cnt/totalVotes*100):0;
        const voted=myVote===i;
        return '<div data-poll-id="'+String(msg.id||'')+'" data-opt-idx="'+i+'" class="chat-poll-opt-btn"'
          +' style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;'
          +'border:1.5px solid '+(voted?'#e85d5d':'#eedfd3')+';'
          +'background:'+(voted?'#fff0e8':'#f9f9f9')+';'
          +'margin-bottom:5px;cursor:pointer;font-size:.8rem;font-weight:'+(voted?'700':'400')+';">'
          +'<span style="flex:1;">'+esc(opt)+'</span>'
          +'<div style="width:60px;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">'
          +'<div style="height:100%;width:'+pct+'%;background:#e85d5d;border-radius:2px;"></div></div>'
          +'<span style="font-size:.62rem;color:#6b5b53;min-width:24px;text-align:right;">'+pct+'%</span>'
          +'</div>';
      }).join('');
      bubbleInner='<div style="min-width:200px;">'
        +'<div style="font-weight:700;font-size:.84rem;margin-bottom:10px;">📊 '+esc(poll.question)+'</div>'
        +optsHtml
        +'<div style="font-size:.6rem;color:var(--txt3);margin-top:4px;">'+totalVotes+' vote'+(totalVotes>1?'s':'')+'</div>'
        +'</div>';
    }catch(e){bubbleInner=esc(content);}
  }else{
    bubbleInner=esc(displayContent||content).replace(/\n/g,'<br>');
  }

  const msgId=msg.id&&!msg.id.startsWith('temp_')?msg.id:null;
  const isTextMsg=!displayContent.startsWith('IMG:')&&!displayContent.startsWith('VIDEO:')&&!displayContent.startsWith('SNAP:')&&!displayContent.startsWith('POLL:');
  const actionsHtml=isEditorMode()&&msgId?`<div class="chat-msg-actions" style="position:relative;">${isTextMsg&&isMe?`<button class="chat-act-btn" onclick="editMsgById('${msgId}')">✏️</button>`:''}<button class="chat-act-btn" onclick="showReactionPicker('${msgId}',this)">😊</button>${isMe?`<button class="chat-act-btn" style="color:#e85d5d;" onclick="deleteMsgById('${msgId}')">🗑</button>`:''}</div>`:'';

  const isPoll=displayContent.startsWith('POLL:');
  const bubbleClass='chat-bubble'+(isPoll?' chat-bubble-poll':'');
  d.innerHTML=`${senderHtml}${botHtml}<div class="${bubbleClass}">${bubbleInner}</div><div class="chat-meta ${isMe?'me':''}">${time}</div>${actionsHtml}`;
  msgs.appendChild(d);
  // Rendre les réactions existantes
  if(Object.keys(initialReacts).length&&msgId)renderReactions(d,initialReacts,msgId);
  // Badge notification si chat pas visible et message pas de nous
  if(!isMe&&!isBot){
    const chatTab=document.getElementById('tab-chat');
    if(!chatTab||!chatTab.classList.contains('on')){
      const badge=document.getElementById('chatBadge');
      if(badge){
        const cur=parseInt(badge.textContent||'0')||0;
        badge.textContent=cur+1;
        badge.style.display='flex';
      }
    }
  }
}

function scrollChat(){
  const msgs=document.getElementById('chatMessages');
  if(msgs)setTimeout(()=>msgs.scrollTo({top:msgs.scrollHeight,behavior:'smooth'}),80);
}

async function sendChat(){
  const inp=document.getElementById('chatInp');
  const text=(inp?.value||'').trim();
  if(!text||!currentUser){
    if(!currentUser)showToast("Connecte-toi d'abord");
    return;
  }
  inp.value='';inp.style.height='';

  // Envoyer dans Supabase — l'affichage arrive via realtime ou polling
  try{
    const{error}=await sb.from('chat_messages').insert({author:currentUser,content:text});
    if(error){showToast('❌ Erreur envoi — '+error.message);return;}
  }catch(e){showToast('❌ Erreur réseau');return;}

  // Bot — uniquement si message commence par @bot ou /bot
  const botMsg=text.trim();
  const isCallBot=botMsg.startsWith('@bot')||botMsg.startsWith('/bot');
  if(isCallBot){
    const question=botMsg.replace(/^(@bot|\/bot)\s*/i,'').trim()||'Aide';
    showBotTyping();
    setTimeout(async()=>{
      const reply=generateBotReply(question);
      hideBotTyping();
      try{await sb.from('chat_messages').insert({author:'bot',content:reply});}catch(e){}
    },900+Math.random()*600);
  }
}
