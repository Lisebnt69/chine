(function(){
  const THEME_KEY='china_theme_mode';
  const tripStart='2026-11-09';
  const tripEnd='2026-11-22';

  function applyTheme(mode){
    const m=mode||localStorage.getItem(THEME_KEY)||'light';
    const prefersDark=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = m==='dark' || (m==='auto' && prefersDark);
    document.body.classList.toggle('theme-dark', !!dark);
    document.body.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY,m);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', dark ? '#0f1418' : '#e85d5d');
    const sel=document.getElementById('themeSelect');
    if(sel) sel.value=m;
  }

  function fmtDateFR(dateStr){
    try{return new Date(dateStr+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});}catch{return dateStr;}
  }

  function addCountdownCard(){
    const tab=document.getElementById('tab-budget');
    if(!tab || document.getElementById('countdownCard')) return;
    const start=new Date(tripStart+'T00:00:00');
    const end=new Date(tripEnd+'T00:00:00');
    const now=new Date();
    const msPerDay=86400000;
    const d=Math.ceil((start - new Date(now.getFullYear(), now.getMonth(), now.getDate()))/msPerDay);
    const nights=Math.round((end-start)/msPerDay);
    const card=document.createElement('div');
    card.id='countdownCard';
    card.className='countdown-card';
    card.innerHTML=`
      <div class="countdown-top">
        <div>
          <div class="bh-label" style="color:var(--txt2);margin:0">Compte à rebours voyage</div>
          <div class="countdown-big">${d>=0?`J-${d}`:`En voyage`}</div>
          <div class="countdown-sub">Départ le ${fmtDateFR(tripStart)} · Retour le ${fmtDateFR(tripEnd)}</div>
        </div>
        <button class="feature-btn" style="max-width:140px;padding:10px 12px" onclick="window.openFeatureHub()">🌙 Affichage</button>
      </div>
      <div class="countdown-mini">
        <div><b>${nights}</b><span class="countdown-sub">nuits</span></div>
        <div><b>${typeof D!=='undefined'&&D.items?D.items.filter(x=>x.type==='hotel').length:0}</b><span class="countdown-sub">hôtels</span></div>
        <div><b>${typeof D!=='undefined'&&D.items?D.items.filter(x=>x.type==='transport').length:0}</b><span class="countdown-sub">transports</span></div>
      </div>`;
    const hero=tab.querySelector('.budget-alert-bar') || tab.querySelector('.budget-hero') || tab.querySelector('.ph');
    if(hero) hero.insertAdjacentElement('beforebegin', card); else tab.prepend(card);
  }

  function buildFeatureUI(){
    if(document.getElementById('featureFab')) return;
    const fab=document.createElement('button');
    fab.id='featureFab';
    fab.className='feature-fab';
    fab.innerHTML='🌙';
    fab.title='Affichage';
    fab.onclick=()=>openFeatureHub();
    document.body.appendChild(fab);

    const overlay=document.createElement('div');
    overlay.id='featureOverlay';
    overlay.className='feature-overlay';
    overlay.innerHTML=`<div class="feature-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Affichage</div>
      <div class="feature-sec">
        <div class="feature-title">Mode couleur</div>
        <select id="themeSelect" class="theme-select">
          <option value="light">Clair</option>
          <option value="dark">Sombre</option>
          <option value="auto">Auto système</option>
        </select>
        <div class="feature-help">Le mode sombre a été refait pour vraiment recolorer l’app au lieu de juste changer deux variables.</div>
      </div>
      <button class="btn-cancel" onclick="window.closeFeatureHub()">Fermer</button>
    </div>`;
    overlay.addEventListener('click',e=>{ if(e.target===overlay) closeFeatureHub(); });
    document.body.appendChild(overlay);
    document.getElementById('themeSelect').addEventListener('change',e=>applyTheme(e.target.value));
  }

  function patchRender(){
    if(typeof renderAll!=='function' || renderAll.__featuresPatched) return false;
    const orig=renderAll;
    window.renderAll=function(){
      const r=orig.apply(this,arguments);
      setTimeout(()=>{ addCountdownCard(); },0);
      return r;
    };
    window.renderAll.__featuresPatched=true;
    return true;
  }

  function boot(){
    buildFeatureUI();
    applyTheme();
    addCountdownCard();
  }

  window.openFeatureHub=function(){
    buildFeatureUI();
    applyTheme();
    document.getElementById('featureOverlay')?.classList.add('on');
  };
  window.closeFeatureHub=function(){
    document.getElementById('featureOverlay')?.classList.remove('on');
  };

  document.addEventListener('DOMContentLoaded',()=>{
    applyTheme();
    buildFeatureUI();
    const media=window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if(media && media.addEventListener){
      media.addEventListener('change',()=>{ if((localStorage.getItem(THEME_KEY)||'light')==='auto') applyTheme('auto'); });
    }
    let tries=0;
    const it=setInterval(()=>{
      tries++;
      patchRender();
      boot();
      if(typeof renderAll==='function' || tries>60) clearInterval(it);
    },500);
  });
})();
