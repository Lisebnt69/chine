(function(){
  const THEME_KEY = 'china_theme_mode';
  const tripStart = '2026-11-07';
  const tripEnd = '2026-11-22';

  function getStoredMode(){
    return localStorage.getItem(THEME_KEY) || 'auto';
  }

  function resolveDark(mode){
    const prefersDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    if(mode === 'dark') return true;
    if(mode === 'light') return false;
    return !!prefersDark;
  }

  function applyTheme(mode){
    const finalMode = mode || getStoredMode();
    const dark = resolveDark(finalMode);

    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('theme-dark', dark);
    document.body.dataset.theme = dark ? 'dark' : 'light';

    localStorage.setItem(THEME_KEY, finalMode);

    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta){
      meta.setAttribute('content', dark ? '#0b1220' : '#e85d5d');
    }

    const sel = document.getElementById('themeSelect');
    if(sel) sel.value = finalMode;
  }

  function fmtDateFR(dateStr){
    try{
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
        day:'numeric',
        month:'long',
        year:'numeric'
      });
    }catch(e){
      return dateStr;
    }
  }

  function getCountdownData(){
    const start = new Date(tripStart + 'T00:00:00');
    const end = new Date(tripEnd + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msPerDay = 86400000;

    const daysBefore = Math.ceil((start - today) / msPerDay);
    const inTrip = today >= start && today <= end;
    const nights = Math.round((end - start) / msPerDay);

    let label = '';
    if(inTrip){
      const tripDay = Math.floor((today - start) / msPerDay) + 1;
      label = `Jour ${tripDay}`;
    }else if(daysBefore >= 0){
      label = `J-${daysBefore}`;
    }else{
      label = 'Voyage terminé';
    }

    const items = (typeof D !== 'undefined' && D.items) ? D.items : [];
    const hotelCount = items.filter(x => x.type === 'hotel').length;
    const transportCount = items.filter(x => x.type === 'transport').length;

    return {
      label,
      nights,
      hotelCount,
      transportCount
    };
  }

  function addCountdownCard(){
    const tab = document.getElementById('tab-budget');
    if(!tab) return;

    const existing = document.getElementById('countdownCard');
    const data = getCountdownData();

    const html = `
      <div class="countdown-top">
        <div>
          <div class="bh-label" style="color:var(--txt2);margin:0">Compte à rebours voyage</div>
          <div class="countdown-big">${data.label}</div>
          <div class="countdown-sub">Départ le ${fmtDateFR(tripStart)} · Retour le ${fmtDateFR(tripEnd)}</div>
        </div>
        <button class="feature-btn" style="max-width:140px;padding:10px 12px" onclick="window.openFeatureHub()">🌙 Affichage</button>
      </div>
      <div class="countdown-mini">
        <div><b>${data.nights}</b><span class="countdown-sub">nuits</span></div>
        <div><b>${data.hotelCount}</b><span class="countdown-sub">hôtels</span></div>
        <div><b>${data.transportCount}</b><span class="countdown-sub">transports</span></div>
      </div>
    `;

    if(existing){
      existing.innerHTML = html;
      return;
    }

    const card = document.createElement('div');
    card.id = 'countdownCard';
    card.className = 'countdown-card';
    card.innerHTML = html;

    const hero =
      tab.querySelector('.budget-alert-bar') ||
      tab.querySelector('.budget-hero') ||
      tab.querySelector('.ph');

    if(hero) hero.insertAdjacentElement('beforebegin', card);
    else tab.prepend(card);
  }

  function buildFeatureUI(){
    if(document.getElementById('featureFab')) return;

    const fab = document.createElement('button');
    fab.id = 'featureFab';
    fab.className = 'feature-fab';
    fab.innerHTML = '🌙';
    fab.title = 'Affichage';
    fab.onclick = () => openFeatureHub();
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.id = 'featureOverlay';
    overlay.className = 'feature-overlay';
    overlay.innerHTML = `
      <div class="feature-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Affichage</div>

        <div class="feature-sec">
          <div class="feature-title">Mode couleur</div>
          <select id="themeSelect" class="theme-select">
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
            <option value="auto">Auto système</option>
          </select>
          <div class="feature-help">
            Le mode sombre recolore vraiment l’app via les variables globales.
          </div>
        </div>

        <button class="btn-cancel" onclick="window.closeFeatureHub()">Fermer</button>
      </div>
    `;

    overlay.addEventListener('click', e => {
      if(e.target === overlay) closeFeatureHub();
    });

    document.body.appendChild(overlay);

    const themeSelect = document.getElementById('themeSelect');
    if(themeSelect){
      themeSelect.addEventListener('change', e => applyTheme(e.target.value));
    }
  }

  function patchRender(){
    if(typeof renderAll !== 'function' || renderAll.__featuresPatched) return false;

    const orig = renderAll;
    window.renderAll = function(){
      const result = orig.apply(this, arguments);
      setTimeout(() => {
        addCountdownCard();
      }, 0);
      return result;
    };
    window.renderAll.__featuresPatched = true;
    return true;
  }

  function boot(){
    buildFeatureUI();
    applyTheme();
    addCountdownCard();
  }

  window.openFeatureHub = function(){
    buildFeatureUI();
    applyTheme();
    document.getElementById('featureOverlay')?.classList.add('on');
  };

  window.closeFeatureHub = function(){
    document.getElementById('featureOverlay')?.classList.remove('on');
  };

  document.addEventListener('DOMContentLoaded', () => {
    buildFeatureUI();
    applyTheme();
    addCountdownCard();

    const media = window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

    if(media && media.addEventListener){
      media.addEventListener('change', () => {
        if(getStoredMode() === 'auto'){
          applyTheme('auto');
        }
      });
    }

    let tries = 0;
    const it = setInterval(() => {
      tries++;
      patchRender();
      boot();
      if(typeof renderAll === 'function' || tries > 60){
        clearInterval(it);
      }
    }, 400);
  });
})();
