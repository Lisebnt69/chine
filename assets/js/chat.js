// ── CHAT MEDIA ──
function openCamera(){
  if(!isEditorMode()){showToast('👁️ Lecture seule');return;}
  document.getElementById('chatCameraInput').click();
}
function openSnapCamera(){
  if(!isEditorMode()){showToast('👁️ Lecture seule');return;}
  document.getElementById('chatSnapInput').click();
}

function viewSnap(sid, e){
  if(e)e.stopPropagation();
  const wrap=document.getElementById(sid);
  if(!wrap)return;
  wrap.classList.add('revealed');
  // Afficher le bouton Garder seulement après avoir vu
  const saveBtn=document.getElementById('save_'+sid);
  if(saveBtn)saveBtn.style.display='inline-flex';
  // Masquer le bouton Voir
  const viewBtn=wrap.querySelector('.snap-btn.view');
  if(viewBtn)viewBtn.style.display='none';
  const img=wrap.querySelector('.snap-img');
  if(img){
    img.onclick=function(){
      if(document.fullscreenEnabled)img.requestFullscreen().catch(()=>{});
    };
  }
  // Supprimer de Supabase après 10s si pas sauvegardé
  setTimeout(async()=>{
    if(!wrap||wrap.dataset.saved)return;
    // Re-flouter visuellement
    wrap.classList.remove('revealed');
    wrap.querySelector('.snap-overlay')&&(wrap.querySelector('.snap-overlay').innerHTML='<span style="font-size:1.3rem;">💨</span><span class="snap-label" style="color:#fff;">Photo expirée</span>');
    // Supprimer de Supabase
    const msgEl=wrap.closest('[data-msg-id]');
    const msgId=msgEl?.dataset.msgId;
    if(msgId&&!msgId.startsWith('temp_')){
      await sb.from('chat_messages').delete().eq('id',msgId);
      // Supprimer du DOM après 1.5s
      setTimeout(()=>msgEl?.remove(), 1500);
    }
  },10000);
}

async function saveSnap(sid, msgId, e){
  if(e)e.stopPropagation();
  const wrap=document.getElementById(sid);
  if(!wrap)return;
  const img=wrap.querySelector('.snap-img');
  if(!img)return;
  const src=img.src;
  wrap.dataset.saved='1';
  wrap.classList.add('revealed');
  // Convertir SNAP: → IMG: dans Supabase (rend la photo permanente)
  if(msgId&&!msgId.startsWith('temp_')){
    await sb.from('chat_messages').update({content:'IMG:'+src}).eq('id',msgId);
    showToast('💾 Photo gardée dans le chat !');
    // Mettre à jour le DOM
    const msgEl=document.querySelector('[data-msg-id="'+msgId+'"]');
    if(msgEl){
      msgEl.dataset.msgContent='IMG:'+src;
      const bubble=msgEl.querySelector('.chat-bubble');
      if(bubble)bubble.innerHTML='<img class="chat-media-img" src="'+src+'" onclick="this.requestFullscreen&&this.requestFullscreen()">';
    }
  }else{
    // Pas d'id Supabase — juste afficher
    showToast('📸 Photo visible — non sauvegardée en base');
  }
}
async function sendSnapMedia(input){
  const file=input.files[0];
  if(!file)return;
  input.value='';
  showToast('⏳ Chargement…');
  try{
    const dataUrl=await compressImage(file,1000,0.82);
    openSnapEditor(dataUrl);
  }catch(e){showToast('❌ Erreur : '+e.message);}
}

// ── ÉDITEUR SNAP ──
function openSnapEditor(dataUrl){
  const old=document.getElementById('snapEditor');if(old)old.remove();
  const editor=document.createElement('div');
  editor.id='snapEditor';
  editor.className='snap-editor';

  const colors=['#ffffff','#000000','#f87171','#fbbf24','#34d399','#60a5fa'];
  let activeColor='#ffffff';
  let annotations=[];
  let selectedIdx=-1;
  let dragging=false;
  let dragOffX=0,dragOffY=0;
  let baseImg=null;

  const colorBtns=colors.map(c=>'<div class="snap-color'+(c===activeColor?' active':'')+'" data-color="'+c+'" style="background:'+c+';'+(c==='#ffffff'?'border:1px solid rgba(255,255,255,.4);':'')+'" onclick="snapEditorColor(this)"></div>').join('');

  editor.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,.9);">'
    +'<button class="snap-editor-btn cancel" data-close="snapEditor" onclick="closeSheet(this.dataset.close)">✕</button>'
    +'<span style="color:#fff;font-size:.8rem;font-weight:600;">✍️ Écrire sur la photo</span>'
    +'<button class="snap-editor-btn send" id="snapSendBtn">Envoyer ↑</button>'
    +'</div>'
    +'<div class="snap-editor-canvas-wrap" id="snapCanvasWrap"><canvas id="snapCanvas" style="touch-action:none;"></canvas></div>'
    +'<div style="padding:8px 14px;background:rgba(0,0,0,.9);">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
    +colorBtns
    +'<input type="range" id="snapFontSize" min="14" max="72" value="30" style="flex:1;accent-color:#e85d5d;" oninput="snapEditorResize()">'
    +'<button style="background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:.75rem;cursor:pointer;" onclick="snapEditorUndo()">↩</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px;">'
    +'<input class="snap-editor-input" id="snapText" placeholder="Tape le texte puis place-le sur la photo…">'
    +'<button class="snap-editor-btn send" onclick="snapEditorAddCenter()" style="padding:9px 12px;white-space:nowrap;">＋ Ajouter</button>'
    +'</div>'
    +'<div style="color:rgba(255,255,255,.5);font-size:.65rem;margin-top:5px;">👆 Tape sur la photo pour placer · Glisse pour déplacer</div>'
    +'</div>';

  document.body.appendChild(editor);
  window._snapAnnotations=annotations;
  window._snapColor=activeColor;

  const canvas=document.getElementById('snapCanvas');

  const loadImg=new Image();
  loadImg.onload=function(){
    baseImg=loadImg;
    const maxW=window.innerWidth;
    const maxH=window.innerHeight-180;
    let w=loadImg.width,h=loadImg.height;
    const r=Math.min(maxW/w,maxH/h,1);
    canvas.width=Math.round(w*r);canvas.height=Math.round(h*r);
    canvas.dataset.origSrc=dataUrl;
    redrawSnapCanvas(baseImg,annotations);
  };
  loadImg.src=dataUrl;

  // ── Tap : placer le texte ou sélectionner existant ──
  function getPos(e){
    const rect=canvas.getBoundingClientRect();
    const t=e.touches?e.touches[0]:e;
    return{x:t.clientX-rect.left,y:t.clientY-rect.top};
  }
  function hitTest(p){
    for(let i=annotations.length-1;i>=0;i--){
      const a=annotations[i];
      const sz=a.size||30;
      const w=a.text.length*sz*0.55;
      if(p.x>a.x-8&&p.x<a.x+w+8&&p.y>a.y-sz-4&&p.y<a.y+8)return i;
    }return -1;
  }

  function onStart(e){
    e.preventDefault();
    const p=getPos(e);
    const hit=hitTest(p);
    if(hit>=0){
      selectedIdx=hit;dragging=true;
      dragOffX=p.x-annotations[hit].x;dragOffY=p.y-annotations[hit].y;
    }else{
      // Nouveau texte
      const txt=(document.getElementById('snapText')?.value||'').trim();
      if(!txt){showToast('Écris du texte dabord');return;}
      const size=parseInt(document.getElementById('snapFontSize')?.value||30);
      annotations.push({text:txt,x:p.x,y:p.y,color:window._snapColor||'#fff',size});
      selectedIdx=annotations.length-1;
      document.getElementById('snapText').value='';
      redrawSnapCanvas(baseImg,annotations,selectedIdx);
    }
  }
  function onMove(e){
    if(!dragging||selectedIdx<0)return;
    e.preventDefault();
    const p=getPos(e);
    annotations[selectedIdx].x=p.x-dragOffX;
    annotations[selectedIdx].y=p.y-dragOffY;
    redrawSnapCanvas(baseImg,annotations,selectedIdx);
  }
  function onEnd(){dragging=false;}

  canvas.addEventListener('mousedown',onStart);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onEnd);
  canvas.addEventListener('touchstart',onStart,{passive:false});
  canvas.addEventListener('touchmove',onMove,{passive:false});
  canvas.addEventListener('touchend',onEnd);

  window._snapBaseImg=loadImg;
  window._snapAnnotations=annotations;

  // Envoyer
  document.getElementById('snapSendBtn').onclick=async function(){
    const finalDataUrl=canvas.toDataURL('image/jpeg',0.82);
    editor.remove();
    showToast('⏳ Envoi…');
    const snapContent='SNAP:'+finalDataUrl;
    const tempMsg={id:'temp_'+Date.now(),author:currentUser,content:snapContent,created_at:new Date().toISOString()};
    appendChatMsg(tempMsg,true);scrollChat();
    try{await sb.from('chat_messages').insert({author:currentUser,content:snapContent});}
    catch(e){showToast('❌ Erreur envoi');}
  };
}

function snapEditorColor(el){
  window._snapColor=el.dataset.color;
  document.querySelectorAll('.snap-color').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  // Changer couleur du texte sélectionné
  const ann=window._snapAnnotations;
  if(!ann)return;
  redrawSnapCanvas(window._snapBaseImg,ann);
}

function snapEditorResize(){
  const ann=window._snapAnnotations;
  if(!ann||ann.length===0)return;
  const size=parseInt(document.getElementById('snapFontSize')?.value||30);
  // Resize le dernier texte ajouté
  ann[ann.length-1].size=size;
  redrawSnapCanvas(window._snapBaseImg,ann);
}

function snapEditorUndo(){
  const ann=window._snapAnnotations;
  if(!ann||!ann.length)return;
  ann.pop();
  redrawSnapCanvas(window._snapBaseImg,ann);
}

function snapEditorAddCenter(){
  const canvas=document.getElementById('snapCanvas');
  const ann=window._snapAnnotations;
  if(!canvas||!ann)return;
  const txt=(document.getElementById('snapText')?.value||'').trim();
  if(!txt){showToast('Écris du texte dabord');return;}
  const size=parseInt(document.getElementById('snapFontSize')?.value||30);
  ann.push({text:txt,x:canvas.width/2-txt.length*size*0.28,y:canvas.height/2,color:window._snapColor||'#fff',size});
  document.getElementById('snapText').value='';
  redrawSnapCanvas(window._snapBaseImg,ann,ann.length-1);
}

function redrawSnapCanvas(img,annotations){
  const canvas=document.getElementById('snapCanvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  annotations.forEach(a=>{
    ctx.font='bold '+a.size+'px sans-serif';
    ctx.fillStyle=a.color;
    ctx.strokeStyle='rgba(0,0,0,.5)';
    ctx.lineWidth=3;
    ctx.strokeText(a.text,a.x,a.y);
    ctx.fillText(a.text,a.x,a.y);
  });
}

function addSnapText(){
  const canvas=document.getElementById('snapCanvas');
  if(!canvas)return;
  const txt=document.getElementById('snapText')?.value?.trim();
  if(!txt)return;
  const size=parseInt(document.getElementById('snapFontSize')?.value||32);
  // Placer au centre par défaut
  const ann={text:txt,x:canvas.width/2-txt.length*size*.3,y:canvas.height/2,color:window._snapColor||'#ffffff',size};
  const src=canvas.dataset.origSrc;
  const img=new Image();
  img.onload=function(){
    if(!canvas._annotations)canvas._annotations=[];
    canvas._annotations.push(ann);
    redrawSnapCanvas(img,canvas._annotations);
  };
  img.src=src;
  document.getElementById('snapText').value='';
}

function selectSnapColor(el){
  window._snapColor=el.dataset.color;
  document.querySelectorAll('.snap-color').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
}
function openGallery(){
  if(!isEditorMode()){showToast('👁️ Lecture seule');return;}
  document.getElementById('chatFileInput').click();
}

async function geocodeTransportPoint(which){
  const nameEl=document.getElementById('if-'+which+'-addr');
  const latEl=document.getElementById('if-'+which+'-lat');
  const lngEl=document.getElementById('if-'+which+'-lng');
  const status=document.getElementById('geocode-transport-status');
  const name=(nameEl?.value||'').trim();
  if(!name){if(status)status.textContent='Saisis dabord le nom du lieu';return;}
  if(status)status.textContent='🔍 Recherche…';
  try{
    const url='https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(name)+'&format=json&limit=1';
    const res=await fetch(url,{headers:{'Accept-Language':'fr','User-Agent':'Chine2026'}});
    const data=await res.json();
    if(data&&data.length>0){
      const r=data[0];
      if(latEl)latEl.value=Math.round(parseFloat(r.lat)*1000000)/1000000;
      if(lngEl)lngEl.value=Math.round(parseFloat(r.lon)*1000000)/1000000;
      if(status)status.innerHTML='✅ <b>'+esc(r.display_name.split(',').slice(0,2).join(', '))+'</b>';
    }else{
      if(status)status.textContent='❌ Non trouvé — saisis les coords manuellement';
    }
  }catch(e){if(status)status.textContent='❌ Erreur réseau';}
}

// Compresse une image via Canvas — retourne une Promise<dataUrl>
function compressImage(file, maxW=1200, quality=0.75){
  return new Promise((resolve)=>{
    // Vidéos : pas de compression canvas possible, on retourne tel quel
    if(file.type.startsWith('video/')){
      const r=new FileReader();
      r.onload=e=>resolve(e.target.result);
      r.readAsDataURL(file);
      return;
    }
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let {width:w,height:h}=img;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>{
      // Fallback FileReader si canvas échoue
      const r=new FileReader();
      r.onload=e=>resolve(e.target.result);
      r.readAsDataURL(file);
    };
    img.src=url;
  });
}

async function sendMedia(input){
  const file=input.files[0];
  if(!file||!currentUser)return;
  input.value='';
  showToast('⏳ Compression…');
  try{
    const isVideo=file.type.startsWith('video/');
    // Compression : max 1200px, qualité 75% pour photos
    // Vidéos : max 8Mo accepté (format natif)
    const maxSize=isVideo?8*1024*1024:999999999;
    if(isVideo&&file.size>maxSize){showToast('❌ Vidéo trop lourde (max 8Mo)');return;}
    const dataUrl=await compressImage(file,1200,0.75);
    const content_val=isVideo?'VIDEO:'+dataUrl:'IMG:'+dataUrl;
    const tempMsg={id:'temp_'+Date.now(),author:currentUser,content:content_val,created_at:new Date().toISOString()};
    appendChatMsg(tempMsg,true);scrollChat();
    await sb.from('chat_messages').insert({author:currentUser,content:content_val});
  }catch(e){showToast('❌ Erreur envoi : '+e.message);}
}

// ── SONDAGE ──
function openPollSheet(){
  if(!isEditorMode()){showToast('👁️ Lecture seule');return;}
  const old=document.getElementById('pollSheet');if(old)old.remove();
  const sheet=document.createElement('div');sheet.id='pollSheet';
  sheet.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:flex-end;backdrop-filter:blur(4px);';
  sheet.innerHTML=`<div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:0 20px calc(20px + env(safe-area-inset-bottom));animation:slideUp .25s ease;box-shadow:0 -18px 48px rgba(92,56,36,.18);">
    <div style="width:36px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 18px;"></div>
    <div style="font-size:1rem;font-weight:700;margin-bottom:14px;">📊 Créer un sondage</div>
    <div style="margin-bottom:10px;"><div style="font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:5px;">Question</div>
      <input id="pollQ" class="form-input" placeholder="Votre question…"></div>
    <div style="margin-bottom:10px;"><div style="font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:5px;">Option 1</div><input id="pollO1" class="form-input" placeholder="Option 1…"></div>
    <div style="margin-bottom:10px;"><div style="font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:5px;">Option 2</div><input id="pollO2" class="form-input" placeholder="Option 2…"></div>
    <div style="margin-bottom:10px;"><div style="font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin-bottom:5px;">Option 3 (optionnel)</div><input id="pollO3" class="form-input" placeholder="Option 3…"></div>
    <button style="width:100%;padding:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:none;border-radius:12px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:var(--font);margin-top:4px;" onclick="sendPoll()">Envoyer le sondage</button>
    <button style="width:100%;padding:11px;background:var(--bg);border:none;border-radius:12px;font-size:.84rem;color:var(--txt2);cursor:pointer;font-family:var(--font);margin-top:6px;" onclick="document.getElementById('pollSheet').remove()">Annuler</button>
  </div>`;
  sheet.onclick=e=>{if(e.target===sheet)sheet.remove();};
  document.body.appendChild(sheet);
  setTimeout(()=>document.getElementById('pollQ')?.focus(),100);
}

async function sendPoll(){
  const q=document.getElementById('pollQ')?.value?.trim();
  const o1=document.getElementById('pollO1')?.value?.trim();
  const o2=document.getElementById('pollO2')?.value?.trim();
  const o3=document.getElementById('pollO3')?.value?.trim();
  if(!q||!o1||!o2){showToast('❌ Question et 2 options minimum');return;}
  const opts=[o1,o2,o3].filter(Boolean);
  const pollData=JSON.stringify({type:'poll',question:q,options:opts,votes:{}});
  document.getElementById('pollSheet')?.remove();
  const tempMsg={id:'temp_'+Date.now(),author:currentUser,content:`POLL:${pollData}`,created_at:new Date().toISOString()};
  appendChatMsg(tempMsg,true);scrollChat();
  try{await sb.from('chat_messages').insert({author:currentUser,content:`POLL:${pollData}`});}
  catch(e){showToast('❌ Erreur sondage');}
}

async function votePoll(msgId,optIdx){
  if(!msgId||msgId==='undefined'){showToast('❌ ID manquant');return;}
  // Récupérer le msg depuis le DOM d'abord (plus rapide)
  const el=document.querySelector('[data-msg-id="'+msgId+'"]');
  const rawContent=el?el.dataset.msgContent:'';
  let poll;
  if(rawContent&&rawContent.startsWith('POLL:')){
    poll=JSON.parse(rawContent.slice(5));
  }else{
    // Fallback Supabase
    const {data}=await sb.from('chat_messages').select('content').eq('id',msgId).single();
    if(!data)return;
    poll=JSON.parse(data.content.slice(5));
  }
  poll.votes=poll.votes||{};
  poll.votes[currentUser]=optIdx;
  const newContent='POLL:'+JSON.stringify(poll);
  // Update UI immédiatement
  if(el)el.dataset.msgContent=newContent;
  updateChatMsg({id:msgId,content:newContent});
  // Puis Supabase
  await sb.from('chat_messages').update({content:newContent}).eq('id',msgId);
  showToast('✅ Vote enregistré !');
}

// ── EDIT / DELETE LAST MSG ──
async function deleteMsg(id){
  if(!id||!isEditorMode())return;
  if(!confirm('Supprimer ce message ?'))return;
  await sb.from('chat_messages').delete().eq('id',id);
  removeChatMsg(id);
  showToast('🗑 Message supprimé');
}

async function editMsg(id,currentText){
  if(!id||!isEditorMode())return;
  const decoded=currentText.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  const newText=prompt('Modifier le message :',decoded);
  if(!newText||newText===decoded)return;
  await sb.from('chat_messages').update({content:newText+' ✏️'}).eq('id',id);
  showToast('✏️ Message modifié');
}

function deleteMsgById(msgId){
  if(!isEditorMode())return;
  if(!msgId||msgId.startsWith('temp_')){showToast('Impossible');return;}
  const old=document.getElementById('deleteMsgSheet');if(old)old.remove();
  const sheet=document.createElement('div');
  sheet.id='deleteMsgSheet';
  sheet.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3001;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px);animation:fadeIn .15s ease;';
  sheet.innerHTML='<div style="width:100%;max-width:320px;background:#fff;border-radius:22px;padding:24px 20px;box-shadow:0 24px 60px rgba(92,56,36,.2);text-align:center;">'
    +'<div style="font-size:2rem;margin-bottom:10px;">🗑️</div>'
    +'<div style="font-size:.95rem;font-weight:700;color:#231815;margin-bottom:6px;">Supprimer ce message ?</div>'
    +'<div style="font-size:.78rem;color:#6b5b53;margin-bottom:20px;">Cette action est irréversible.</div>'
    +'<div style="display:flex;gap:8px;">'
    +'<button data-close="deleteMsgSheet" onclick="closeSheet(this.dataset.close)" style="flex:1;padding:12px;background:#f7efe8;border:none;border-radius:12px;font-family:inherit;font-size:.86rem;color:#6b5b53;cursor:pointer;font-weight:500;">Annuler</button>'
    +'<button data-did="'+msgId+'" onclick="confirmDeleteMsg(this.dataset.did)" style="flex:1;padding:12px;background:#e85d5d;color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:.86rem;font-weight:600;cursor:pointer;">Supprimer</button>'
    +'</div></div>';
  sheet.onclick=function(e){if(e.target===sheet)sheet.remove();};
  document.body.appendChild(sheet);
}

async function confirmDeleteMsg(msgId){
  document.getElementById('deleteMsgSheet')?.remove();
  // Supprimer du DOM immédiatement + mémoriser
  removeChatMsg(msgId);
  showToast('🗑 Message supprimé');
  const res=await sb.from('chat_messages').delete().eq('id',msgId);
  if(res.error)showToast('❌ '+res.error.message);
}
async function editMsgById(msgId){
  if(!isEditorMode())return;
  if(!msgId||msgId.startsWith('temp_')){showToast('Impossible');return;}
  const el=document.querySelector('[data-msg-id="'+msgId+'"]');
  const b=el?.querySelector('.chat-bubble');
  const currentText=(b?.textContent||'').replace(' ✏️','').trim();
  const old=document.getElementById('editMsgSheet');if(old)old.remove();
  const sheet=document.createElement('div');
  sheet.id='editMsgSheet';
  sheet.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3001;display:flex;align-items:flex-end;backdrop-filter:blur(4px);animation:fadeIn .15s ease;';
  const safeText=currentText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  sheet.innerHTML='<div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:0 20px calc(16px + env(safe-area-inset-bottom));animation:slideUp .22s ease;box-shadow:0 -18px 48px rgba(92,56,36,.18);">'
    +'<div style="width:36px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 16px;"></div>'
    +'<div style="font-size:.9rem;font-weight:700;color:#231815;margin-bottom:12px;">✏️ Modifier le message</div>'
    +'<textarea id="editMsgInput" style="width:100%;border:1.5px solid #eedfd3;border-radius:12px;padding:11px 14px;font-family:inherit;font-size:.88rem;color:#231815;resize:none;line-height:1.5;min-height:80px;background:#fff;outline:none;" rows="3">'+safeText+'</textarea>'
    +'<div style="display:flex;gap:8px;margin-top:10px;">'
    +'<button data-close="editMsgSheet" onclick="closeSheet(this.dataset.close)" style="flex:1;padding:12px;background:#f7efe8;border:none;border-radius:12px;font-family:inherit;font-size:.86rem;color:#6b5b53;cursor:pointer;">Annuler</button>'
    +'<button data-eid="'+msgId+'" onclick="confirmEditMsg(this.dataset.eid)" style="flex:1;padding:12px;background:linear-gradient(135deg,#e85d5d,#f59b7a);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:.86rem;font-weight:600;cursor:pointer;">Enregistrer</button>'
    +'</div></div>';
  sheet.onclick=function(e){if(e.target===sheet)sheet.remove();};
  document.body.appendChild(sheet);
  setTimeout(function(){var inp=document.getElementById('editMsgInput');if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}},100);
}

async function confirmEditMsg(msgId){
  const inp=document.getElementById('editMsgInput');
  const newText=(inp?inp.value:'').trim();
  if(!newText)return;
  document.getElementById('editMsgSheet').remove();
  const final=newText+' ✏️';
  const res=await sb.from('chat_messages').update({content:final}).eq('id',msgId);
  if(!res.error){
    const el=document.querySelector('[data-msg-id="'+msgId+'"]');
    const b=el?el.querySelector('.chat-bubble'):null;
    if(b)b.innerHTML=final.replace(/\n/g,'<br>');
    showToast('✏️ Message modifié');
  }else showToast('❌ '+res.error.message);
}
async function deleteLastMsg(){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  const myEls=[...msgs.querySelectorAll('.chat-msg.me')];
  const last=myEls[myEls.length-1];
  if(last)await deleteMsgById(last.dataset.msgId);
}
async function editLastMsg(){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  const myEls=[...msgs.querySelectorAll('.chat-msg.me')].filter(el=>!el.querySelector('img,video,.chat-poll'));
  const last=myEls[myEls.length-1];
  if(last){const b=last.querySelector('.chat-bubble');await editMsgById(last.dataset.msgId,b?.textContent||'');}
}
async function askBot(question){
  if(!currentUser){showToast("Connecte-toi d'abord");return;}
  goTabByName('chat');
  await initChat();
  // Afficher message de l'user
  const inp=document.getElementById('chatInp');
  if(inp){inp.value=question;sendChat();}
}

function showBotTyping(){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  const d=document.createElement('div');d.className='chat-msg bot';d.id='bot-typing';
  d.innerHTML='<div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(d);scrollChat();
}
function hideBotTyping(){document.getElementById('bot-typing')?.remove();}

function addBotMessage(text){
  const msgs=document.getElementById('chatMessages');
  if(!msgs)return;
  const d=document.createElement('div');d.className='chat-msg bot';
  d.innerHTML=`<div class="chat-sender"><div class="chat-sender-av" style="background:#1e293b;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6rem;">🤖</div><span class="chat-sender-name" style="color:#64748b;">Assistant</span></div><div class="chat-bubble">${esc(text)}</div>`;
  msgs.appendChild(d);scrollChat();
}

// ── BOT IA LOCALE ──
function generateBotReply(question){
  const q=question.toLowerCase();

  // Budget
  if(q.includes('budget')||q.includes('argent')||q.includes('dépens')||q.includes('rest')){
    let depM=0,depL=0;
    D.budget.forEach(r=>{const t=parseFloat(r.total||0);const w=(r.personne||'les deux').toLowerCase();if(w==='matis')depM+=t;else if(w==='lise')depL+=t;else{depM+=t/2;depL+=t/2;}});
    const tot=depM+depL;const bud=budgetPP*2;
    return `💰 Budget (2 pers.) : ${fmtE(bud)}\nDépensé : ${fmtE(tot)} (${Math.round(tot/bud*100)}%)\nRestant : ${fmtE(bud-tot)}\n\n👤 Matis : ${fmtE(depM)} (reste ${fmtE(budgetPP-depM)})\n👤 Lise : ${fmtE(depL)} (reste ${fmtE(budgetPP-depL)})`;
  }

  // Planning demain / aujourd'hui
  if(q.includes('demain')||q.includes('aujourd')||q.includes('planning')){
    const today=new Date();const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
    const target=q.includes('demain')?tomorrow:today;
    const dateStr=target.toISOString().split('T')[0];
    const day=D.planning.find(p=>p.date_voyage===dateStr);
    if(!day)return `📅 Aucun jour planifié pour le ${dateStr}.`;
    const slots=D.slots.filter(s=>s.planning_id===day.id);
    const acts=slots.map(s=>D.items.find(x=>x.id===s.item_id)).filter(Boolean);
    const hotel=D.items.find(x=>x.id===day.hotel_id);
    let reply=`📅 ${dateStr}\n`;
    if(day.matin_lieu)reply+=`🌅 Matin : ${day.matin_lieu}\n`;
    if(day.aprem_lieu)reply+=`☀️ Aprem : ${day.aprem_lieu}\n`;
    if(day.soir_lieu)reply+=`🌙 Soir : ${day.soir_lieu}\n`;
    if(acts.length)reply+=`\n🎯 Activités : ${acts.map(a=>a.nom).join(', ')}`;
    if(hotel)reply+=`\n🏨 Hôtel : ${hotel.nom}`;
    return reply||'Journée vide pour linstant.';
  }

  // Activités non faites
  if(q.includes('activ')||q.includes('faire')||q.includes('idée')){
    const ville=q.includes('shanghai')?'Shanghai':q.includes('chongqing')?'Chongqing':q.includes('chengdu')?'Chengdu':q.includes('zhangjiajie')?'Zhangjiajie':null;
    let items=D.items.filter(x=>x.type==='activite'&&!x.fait);
    if(ville)items=items.filter(x=>x.ville===ville);
    const top=items.sort((a,b)=>((b.matis||0)+(b.lise||0))-((a.matis||0)+(a.lise||0))).slice(0,5);
    if(!top.length)return `🎉 Toutes les activités${ville?' à '+ville:''} ont été faites !`;
    return `🎯 Top activités${ville?' à '+ville:''} :\n`+top.map((a,i)=>`${i+1}. ${a.nom} (${a.ville||'?'})`).join('\n');
  }

  // Restos
  if(q.includes('resto')||q.includes('manger')||q.includes('restaurant')){
    const top=D.items.filter(x=>x.type==='restaurant'&&!x.fait)
      .sort((a,b)=>((b.matis||0)+(b.lise||0))-((a.matis||0)+(a.lise||0))).slice(0,5);
    if(!top.length)return '🎉 Tous les restos ont été faits !';
    return '🍜 Meilleurs restos non encore faits :\n'+top.map((r,i)=>`${i+1}. ${r.nom} — ${r.ville||'?'}`).join('\n');
  }

  // Transport
  if(q.includes('transport')||q.includes('train')||q.includes('vol')||q.includes('avion')){
    const upcoming=D.items.filter(x=>x.type==='transport'&&!x.fait).sort((a,b)=>(a.adresse||'').localeCompare(b.adresse||''));
    if(!upcoming.length)return '✅ Tous les transports sont faits !';
    return '🚄 Prochains transports :\n'+upcoming.slice(0,4).map(t=>`${t.adresse||'?'} — ${t.nom} (${t.prix_type||'?'})`).join('\n');
  }

  // Checklist
  if(q.includes('check')||q.includes('liste')||q.includes('prépar')){
    const done=D.checklist.filter(x=>x.done).length;const tot=D.checklist.length;
    const remaining=D.checklist.filter(x=>!x.done).slice(0,5);
    return `✅ Checklist : ${done}/${tot} (${tot?Math.round(done/tot*100):0}%)\n${remaining.length?'\n⏳ Reste : '+remaining.map(x=>x.label).join(', '):'\n🎉 Tout est prêt !'}`;
  }

  // Hôtels
  if(q.includes('hôtel')||q.includes('hotel')||q.includes('nuit')||q.includes('dormir')){
    const hotels=D.items.filter(x=>x.type==='hotel');
    if(!hotels.length)return '🏨 Aucun hôtel enregistré.';
    return '🏨 Hôtels :\n'+hotels.map(h=>`${h.nom} — ${h.ville||'?'} ${h.fait?'✅':'⏳'}`).join('\n');
  }

  // Météo
  if(q.includes('météo')||q.includes('temps')||q.includes('température')){
    return '🌤 Météo novembre en Chine :\n🏙️ Shanghai : 10–18°C, nuageux\n🌆 Chongqing : 10–16°C, nuageux\n🐼 Chengdu : 9–15°C, brumeux\n🏞️ Zhangjiajie : 6–13°C, brume magnifique\n🌸 Furong : 8–14°C';
  }

  // Salutations
  if(q.includes('bonjour')||q.includes('salut')||q.includes('coucou')||q.includes('hello')){
    const u=USERS[currentUser];
    return `${u.emoji} Bonjour ${u.name} ! Comment puis-je t'aider ? Tu peux me poser des questions sur le budget, le planning, les activités, ou les restos.`;
  }

  // Défaut
  const tips=['budget','planning','activités','restos','hôtels','transports','checklist'];
  return `Je ne suis pas sûr de comprendre ta question 🤔\nEssaie de me demander sur : ${tips.join(', ')}.\n\nTu peux aussi utiliser les boutons rapides ci-dessus !`;
}

// ══ GALERIE PHOTO ══
// Clés privées en localStorage : 'galerie_private_<hash>'
function getPhotoKey(src){ return 'gp_'+btoa(src.slice(0,40)).replace(/[^a-zA-Z0-9]/g,'').slice(0,16); }
function isPhotoPrivate(src){ return localStorage.getItem(getPhotoKey(src))==='1'; }
function togglePhotoPrivacy(src){
  const k=getPhotoKey(src);
  const isPriv=localStorage.getItem(k)==='1';
  localStorage.setItem(k,isPriv?'0':'1');
  renderGalerie();
  showToast(isPriv?'🌐 Photo visible par tous':'🔒 Photo privée');
}

function renderGalerie(){
  const cont=document.getElementById('galerieCont');
  if(!cont)return;
  const canEdit=isEditorMode();
  const photos=[];
  // Photos du chat
  document.querySelectorAll('[data-msg-id]').forEach(el=>{
    const c=el.dataset.msgContent||'';
    if(c.startsWith('IMG:')){
      const src=c.slice(4);
      const priv=isPhotoPrivate(src);
      if(!canEdit&&priv)return; // visiteur ne voit pas les photos privées
      const author=el.querySelector('.chat-sender-name')?.textContent||'';
      const msgId=el.dataset.msgId||'';
      photos.push({src,label:author||'Photo',type:'chat',priv,msgId});
    }
  });
  if(!photos.length){
    cont.innerHTML='<div class="gallery-empty">📷 Aucune photo<br><span style="font-size:.72rem;">Les photos envoyées dans le chat apparaîtront ici</span></div>';
    return;
  }
  const grid=document.createElement('div');grid.className='gallery-grid';
  photos.forEach(p=>{
    const div=document.createElement('div');div.className='gallery-item';
    div.innerHTML='<img src="'+p.src+'" loading="lazy" alt="'+esc(p.label)+'">'
      +'<div class="gallery-badge">'+esc(p.label.slice(0,10))+'</div>'
      +(p.priv?'<div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,.6);color:#fff;font-size:.55rem;padding:1px 5px;border-radius:4px;">🔒</div>':'')
      +(canEdit?'<div class="gallery-privacy-btn" style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,.55);color:#fff;font-size:.65rem;padding:2px 6px;border-radius:6px;cursor:pointer;">'+(p.priv?'🔒':'🌐')+'</div>':'');
    div.querySelector('img')?.addEventListener('click',()=>{
      const img=div.querySelector('img');
      if(img&&document.fullscreenEnabled)img.requestFullscreen().catch(()=>{});
    });
    // fix toggle using full src
    if(canEdit){
      const btn=div.querySelector('.gallery-privacy-btn');
      if(btn)btn.onclick=e=>{e.stopPropagation();togglePhotoPrivacy(p.src);};
    }
    grid.appendChild(div);
  });
  cont.innerHTML='';
  if(canEdit){
    const banner=document.createElement('div');
    banner.style.cssText='margin:0 16px 10px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;font-size:.72rem;color:#92400e;display:flex;align-items:center;gap:8px;';
    banner.innerHTML='<span style="font-size:1rem;">🔒</span><span><b>Contrôle de visibilité</b> — Appuie sur 🌐/🔒 pour rendre une photo privée ou publique. Les visiteurs ne voient pas les photos 🔒.</span>';
    cont.appendChild(banner);
  }
  const info=document.createElement('div');
  info.style.cssText='padding:0 16px 6px;font-size:.72rem;color:var(--txt2);';
  info.textContent=photos.length+' photo'+(photos.length>1?'s':'')+' · tap pour agrandir';
  cont.appendChild(info);
  cont.appendChild(grid);
}

// ══ RÉACTIONS EMOJI ══
const REACTIONS=['❤️','😂','🔥','👍','😮','😢'];
function showReactionPicker(msgId,btn){
  // Fermer tout picker existant
  document.querySelectorAll('.reaction-picker').forEach(p=>p.remove());
  const picker=document.createElement('div');picker.className='reaction-picker';
  REACTIONS.forEach(emoji=>{
    const s=document.createElement('span');s.textContent=emoji;
    s.onclick=e=>{e.stopPropagation();addReaction(msgId,emoji);picker.remove();};
    picker.appendChild(s);
  });
  btn.parentElement.style.position='relative';
  btn.parentElement.appendChild(picker);
  setTimeout(()=>document.addEventListener('click',()=>picker.remove(),{once:true}),10);
}
async function addReaction(msgId,emoji){
  if(!msgId||msgId.startsWith('temp_'))return;
  const{data}=await sb.from('chat_messages').select('content').eq('id',msgId).single();
  if(!data)return;
  let content_v=data.content;
  // Stocker les réactions en suffixe : "texte||REACT:{"matis":"❤️","lise":"👍"}"
  let base=content_v,reactStr='';
  const sep=content_v.lastIndexOf('||REACT:');
  if(sep>=0){base=content_v.slice(0,sep);reactStr=content_v.slice(sep+8);}
  let reacts={};
  try{reacts=JSON.parse(reactStr||'{}');}catch(e){}
  if(reacts[currentUser]===emoji)delete reacts[currentUser];
  else reacts[currentUser]=emoji;
  const newContent=base+(Object.keys(reacts).length?'||REACT:'+JSON.stringify(reacts):'');
  await sb.from('chat_messages').update({content:newContent}).eq('id',msgId);
  // Update DOM immédiat
  const el=document.querySelector('[data-msg-id="'+msgId+'"]');
  if(el){el.dataset.msgContent=newContent;renderReactions(el,reacts,msgId);}
}
function renderReactions(msgEl,reacts,msgId){
  let row=msgEl.querySelector('.chat-reactions');
  if(!row){
    row=document.createElement('div');row.className='chat-reactions';
    const meta=msgEl.querySelector('.chat-meta');
    if(meta)meta.parentNode.insertBefore(row,meta.nextSibling);
    else msgEl.appendChild(row);
  }
  const counts={};
  Object.entries(reacts).forEach(([user,emoji])=>{counts[emoji]=(counts[emoji]||[]);counts[emoji].push(user);});
  row.innerHTML='';
  Object.entries(counts).forEach(([emoji,users])=>{
    const pill=document.createElement('button');
    pill.type='button';
    pill.className='reaction-pill'+(users.includes(currentUser||'')?' mine':'');
    pill.title=users.join(', ');
    pill.setAttribute('aria-label',emoji+' '+users.length+' réaction'+(users.length>1?'s':''));
    pill.innerHTML='<span class="emoji">'+emoji+'</span><span class="count">'+users.length+'</span>';
    pill.onclick=()=>addReaction(msgId,emoji);
    row.appendChild(pill);
  });
  if(!Object.keys(counts).length)row.innerHTML='';
}
