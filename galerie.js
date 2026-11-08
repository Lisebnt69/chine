/* ═══════════════════════════════════════════════════════════════
   Galerie : albums de photos pour la famille.

   - Matis et Lise choisissent PLUSIEURS photos d'un coup : elles forment un album (un « lot »).
   - Chaque photo est publique ou privée, au choix, avant l'envoi puis à tout moment.
   - Le visiteur (la famille) ne reçoit que les photos publiques.
   - Table `photos` (supabase/migrations/20261108000000_photos.sql). La grille ne charge que les vignettes,
     la photo entière est chargée à l'ouverture.
   Dépend de index.html : sb, currentUser, isEditorMode, showToast, esc, compressImage.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var photos = [];        // vignettes visibles pour moi : {id, created_at, auteur, lot, album, prive, mini}
  var envoi = null;       // brouillon d'envoi : {files, prive:[bool], busy}
  var vue = null;
  var filtre = '';        // ville filtrée dans la galerie ('' = toutes)
  var villeEnvoi = '';    // ville choisie dans la feuille d'envoi         // visionneuse : {liste, i}

  function editeur() { return isEditorMode(); }
  function q(id) { return document.getElementById(id); }

  /* ── Lecture ── */
  async function charger() {
    var req = sb.from('photos').select('id,created_at,auteur,lot,album,ville,prive,mini').order('created_at', { ascending: false }).limit(400);
    if (!editeur()) req = req.eq('prive', false);
    var r = await req;
    if (r.error) throw r.error;
    photos = r.data || [];
  }

  function albums() {
    var map = {}, ordre = [];
    photos.forEach(function (p) {
      if (!map[p.lot]) { map[p.lot] = { lot: p.lot, album: p.album, ville: p.ville, date: p.created_at, items: [] }; ordre.push(map[p.lot]); }
      map[p.lot].items.push(p);
    });
    ordre.forEach(function (a) { a.items.sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; }); });
    return ordre;
  }

  function titre(a) {
    if (a.album) return a.album;
    if (a.ville) return a.ville;
    var d = new Date(a.date);
    return 'Photos du ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  /* ── Page galerie ── */
  window.renderGalerie = async function () {
    var cont = q('galerieCont');
    if (!cont) return;
    if (!photos.length) cont.innerHTML = '<div class="gal-vide">Chargement…</div>';
    try { await charger(); }
    catch (e) {
      cont.innerHTML = '<div class="gal-vide">📷 La galerie n\'est pas encore prête.<br><span>Il manque la table <b>photos</b> dans Supabase (migration 20261108000000_photos.sql).</span></div>';
      return;
    }
    var html = '';
    if (editeur()) {
      html += '<div class="gal-actions"><button type="button" class="gal-add" data-g="ajouter">＋ Ajouter des photos</button>'
        + '<span>Choisis-en plusieurs d\'un coup : elles forment un album.</span></div>';
    }
    var tous = albums();
    var villes = [];
    tous.forEach(function (a) { if (a.ville && villes.indexOf(a.ville) < 0) villes.push(a.ville); });
    if (filtre && villes.indexOf(filtre) < 0) filtre = '';
    if (villes.length) {
      html += '<div class="gal-villes"><button type="button" class="gal-chip' + (!filtre ? ' on' : '') + '" data-g="ville" data-v="">Toutes</button>';
      villes.forEach(function (v) { html += '<button type="button" class="gal-chip' + (filtre === v ? ' on' : '') + '" data-g="ville" data-v="' + esc(v) + '">📍 ' + esc(v) + '</button>'; });
      html += '</div>';
    }
    var liste = tous.filter(function (a) { return !filtre || a.ville === filtre; });
    if (!liste.length) {
      html += '<div class="gal-vide">📷 Aucune photo pour l\'instant.<br><span>'
        + (editeur() ? 'Ajoute les premières avec le bouton ci-dessus.' : 'Matis et Lise en partageront bientôt.') + '</span></div>';
    }
    liste.forEach(function (a) {
      var nbPriv = a.items.filter(function (p) { return p.prive; }).length;
      html += '<section class="gal-album"><header><div><h2>' + esc(titre(a)) + '</h2><p>'
        + (a.ville && titre(a) !== a.ville ? '📍 ' + esc(a.ville) + ' · ' : '') + a.items.length + ' photo' + (a.items.length > 1 ? 's' : '')
        + (editeur() && nbPriv ? ' · ' + nbPriv + ' privée' + (nbPriv > 1 ? 's' : '') : '') + '</p></div>';
      if (editeur()) {
        html += '<button type="button" class="gal-lien" data-g="tout" data-lot="' + esc(a.lot) + '" data-prive="' + (nbPriv < a.items.length ? 1 : 0) + '">'
          + (nbPriv < a.items.length ? '🔒 Tout privé' : '🌐 Tout public') + '</button>';
      }
      html += '</header><div class="gallery-grid">';
      a.items.forEach(function (p) {
        html += '<div class="gallery-item" data-g="voir" data-id="' + esc(p.id) + '"><img src="' + p.mini + '" loading="lazy" alt="Photo">'
          + (editeur() ? '<button type="button" class="gal-lock' + (p.prive ? ' priv' : '') + '" data-g="bascule" data-id="' + esc(p.id)
            + '" aria-label="' + (p.prive ? 'Privée : la rendre publique' : 'Publique : la rendre privée') + '">' + (p.prive ? '🔒' : '🌐') + '</button>' : '')
          + '</div>';
      });
      html += '</div></section>';
    });
    cont.innerHTML = html;
  };

  /* ── Ajout de plusieurs photos ── */
  window.openGallery = function () {
    if (!editeur()) { showToast('👁️ Lecture seule'); return; }
    if (typeof goTabByName === 'function') goTabByName('galerie');
    ajouter();
  };

  function ajouter() {
    if (!editeur()) return;
    var inp = q('galFiles');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'galFiles'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
      inp.addEventListener('change', function () { choisies(inp); });
      document.body.appendChild(inp);
    }
    inp.click();
  }

  function choisies(inp) {
    var files = Array.prototype.filter.call(inp.files || [], function (f) { return /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name); });
    inp.value = '';
    if (!files.length) return;
    if (files.length > 40) { showToast('📷 40 photos max par album, les 40 premières sont gardées'); files = files.slice(0, 40); }
    villeEnvoi = filtre || '';
    envoi = { files: files, prive: files.map(function () { return false; }), busy: false, urls: files.map(function (f) { return URL.createObjectURL(f); }) };
    feuille();
  }

  function feuille() {
    var old = q('galSheet'); if (old) old.remove();
    var n = envoi.files.length, nbPriv = envoi.prive.filter(Boolean).length;
    var s = document.createElement('div'); s.id = 'galSheet'; s.className = 'gal-sheet';
    var h = '<div class="gal-sheet-in"><div class="gal-poignee"></div>'
      + '<h3>' + n + ' photo' + (n > 1 ? 's' : '') + ' à ajouter</h3>'
      + '<input class="form-input" id="galTitre" maxlength="60" placeholder="Titre de l\'album (facultatif) : Jour 3, Le Bund…">'
      + '<div class="gal-villes gal-choix"><span>📍 Ville</span>' + (typeof VILLES !== 'undefined' ? VILLES : []).concat(['Autre']).map(function (v) {
          var val = v === 'Autre' ? '' : v;
          return '<button type="button" class="gal-chip' + ((v === 'Autre' ? villeEnvoi === '' : villeEnvoi === v) ? ' on' : '') + '" data-g="env-ville" data-v="' + esc(val) + '">' + esc(v) + '</button>';
        }).join('') + '</div>'
      + '<div class="gal-barre"><span>Touche une photo pour la passer en <b>🔒 privée</b> ou <b>🌐 publique</b>.</span>'
      + '<button type="button" class="gal-lien" data-g="env-tout">' + (nbPriv < n ? '🔒 Tout privé' : '🌐 Tout public') + '</button></div>'
      + '<div class="gal-prev">';
    envoi.urls.forEach(function (u, i) {
      h += '<button type="button" class="gal-prev-it' + (envoi.prive[i] ? ' priv' : '') + '" data-g="env-bascule" data-i="' + i + '" aria-label="Photo ' + (i + 1) + (envoi.prive[i] ? ', privée' : ', publique') + '">'
        + '<img src="' + u + '" alt=""><span>' + (envoi.prive[i] ? '🔒' : '🌐') + '</span></button>';
    });
    h += '</div><div class="gal-resume">' + (n - nbPriv) + ' publique' + (n - nbPriv > 1 ? 's' : '') + ' · ' + nbPriv + ' privée' + (nbPriv > 1 ? 's' : '') + '</div>'
      + '<button type="button" class="gal-go" id="galGo" data-g="env-go">Publier l\'album</button>'
      + '<button type="button" class="gal-annuler" data-g="env-annuler">Annuler</button></div>';
    s.innerHTML = h;
    document.body.appendChild(s);
  }

  function fermerFeuille() {
    if (envoi) envoi.urls.forEach(function (u) { URL.revokeObjectURL(u); });
    envoi = null;
    var s = q('galSheet'); if (s) s.remove();
  }

  async function publier() {
    if (!envoi || envoi.busy) return;
    envoi.busy = true;
    var titreAlbum = (q('galTitre') && q('galTitre').value.trim()) || null;
    var lot = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    var go = q('galGo'), n = envoi.files.length, ok = 0, rate = 0;
    var base = Date.now();
    for (var i = 0; i < n; i++) {
      if (go) { go.disabled = true; go.textContent = 'Envoi ' + (i + 1) + ' / ' + n + '…'; }
      try {
        var grande = await compressImage(envoi.files[i], 1400, 0.78);
        var mini = await compressImage(envoi.files[i], 400, 0.7);
        var r = await sb.from('photos').insert({
          auteur: currentUser, lot: lot, album: titreAlbum, ville: villeEnvoi || null, prive: envoi.prive[i], mini: mini, image: grande,
          created_at: new Date(base + i).toISOString() // garde l'ordre choisi dans l'album
        });
        if (r.error) throw r.error;
        ok++;
      } catch (e) { rate++; }
    }
    fermerFeuille();
    showToast(rate ? '⚠️ ' + ok + ' envoyée' + (ok > 1 ? 's' : '') + ', ' + rate + ' en échec' : '✅ ' + ok + ' photo' + (ok > 1 ? 's' : '') + ' ajoutée' + (ok > 1 ? 's' : ''));
    renderGalerie();
  }

  /* ── Confidentialité ── */
  async function fixer(ids, prive) {
    var r = await sb.from('photos').update({ prive: prive }).in('id', ids);
    if (r.error) { showToast('❌ Impossible de changer la visibilité'); return false; }
    photos.forEach(function (p) { if (ids.indexOf(p.id) >= 0) p.prive = prive; });
    return true;
  }

  async function bascule(id) {
    var p = photos.find(function (x) { return x.id === id; });
    if (!p) return;
    if (await fixer([id], !p.prive)) { showToast(p.prive ? '🔒 Photo privée' : '🌐 Photo visible par la famille'); renderGalerie(); majVue(); }
  }

  /* ── Visionneuse ── */
  function voir(id) {
    var liste = photos.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    var lot = (photos.find(function (p) { return p.id === id; }) || {}).lot;
    liste = photos.filter(function (p) { return p.lot === lot; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    vue = { liste: liste, i: Math.max(0, liste.findIndex(function (p) { return p.id === id; })), x: null };
    var v = document.createElement('div'); v.id = 'galVue'; v.className = 'gal-vue';
    v.innerHTML = '<div class="gal-vue-top"><span id="galVueN"></span><div>'
      + (editeur() ? '<button type="button" data-g="v-lock" id="galVueLock"></button><button type="button" data-g="v-suppr" aria-label="Supprimer">🗑️</button>' : '')
      + '<button type="button" data-g="v-fermer" aria-label="Fermer">✕</button></div></div>'
      + '<button type="button" class="gal-nav g" data-g="v-prec" aria-label="Précédente">‹</button>'
      + '<img id="galVueImg" alt="Photo">'
      + '<button type="button" class="gal-nav d" data-g="v-suiv" aria-label="Suivante">›</button>';
    v.addEventListener('touchstart', function (e) { vue && (vue.x = e.touches[0].clientX); }, { passive: true });
    v.addEventListener('touchend', function (e) {
      if (!vue || vue.x == null) return;
      var dx = e.changedTouches[0].clientX - vue.x; vue.x = null;
      if (Math.abs(dx) > 50) aller(dx < 0 ? 1 : -1);
    });
    document.body.appendChild(v);
    majVue();
  }

  var jeton = 0;
  async function majVue() {
    if (!vue) return;
    var p = vue.liste[vue.i]; if (!p) return;
    var img = q('galVueImg'); img.src = p.mini; img.classList.add('flou');
    q('galVueN').textContent = (vue.i + 1) + ' / ' + vue.liste.length;
    var lk = q('galVueLock'); if (lk) lk.textContent = p.prive ? '🔒 Privée' : '🌐 Publique';
    var mon = ++jeton;
    var r = await sb.from('photos').select('image').eq('id', p.id).single();
    if (mon === jeton && r.data && q('galVueImg')) { img.src = r.data.image; img.classList.remove('flou'); }
  }

  function aller(d) {
    if (!vue) return;
    vue.i = (vue.i + d + vue.liste.length) % vue.liste.length;
    majVue();
  }

  function fermerVue() { var v = q('galVue'); if (v) v.remove(); vue = null; jeton++; }

  async function supprimer() {
    var p = vue && vue.liste[vue.i]; if (!p) return;
    if (!confirm('Supprimer cette photo pour de bon ?')) return;
    var r = await sb.from('photos').delete().eq('id', p.id);
    if (r.error) { showToast('❌ Suppression impossible'); return; }
    photos = photos.filter(function (x) { return x.id !== p.id; });
    vue.liste.splice(vue.i, 1);
    if (!vue.liste.length) fermerVue(); else { vue.i = Math.min(vue.i, vue.liste.length - 1); majVue(); }
    showToast('🗑️ Photo supprimée');
    renderGalerie();
  }

  /* ── Clics (une seule écoute) ── */
  document.addEventListener('click', async function (e) {
    var el = e.target.closest && e.target.closest('[data-g]');
    if (!el) return;
    var g = el.dataset.g;
    if (g === 'ajouter') ajouter();
    else if (g === 'voir') voir(el.dataset.id);
    else if (g === 'bascule') { e.stopPropagation(); bascule(el.dataset.id); }
    else if (g === 'tout') {
      var ids = photos.filter(function (p) { return p.lot === el.dataset.lot; }).map(function (p) { return p.id; });
      var prive = el.dataset.prive === '1';
      if (await fixer(ids, prive)) { showToast(prive ? '🔒 Album privé' : '🌐 Album visible par la famille'); renderGalerie(); }
    }
    else if (g === 'env-bascule') { var i = +el.dataset.i; envoi.prive[i] = !envoi.prive[i]; var t = q('galTitre') && q('galTitre').value; feuille(); if (t) q('galTitre').value = t; }
    else if (g === 'env-tout') { var tout = envoi.prive.some(function (x) { return !x; }); envoi.prive = envoi.prive.map(function () { return tout; }); var t2 = q('galTitre') && q('galTitre').value; feuille(); if (t2) q('galTitre').value = t2; }
    else if (g === 'ville') { filtre = el.dataset.v; renderGalerie(); }
    else if (g === 'env-ville') { villeEnvoi = el.dataset.v; var t3 = q('galTitre') && q('galTitre').value; feuille(); if (t3) q('galTitre').value = t3; }
    else if (g === 'env-go') publier();
    else if (g === 'env-annuler') fermerFeuille();
    else if (g === 'v-fermer') fermerVue();
    else if (g === 'v-prec') aller(-1);
    else if (g === 'v-suiv') aller(1);
    else if (g === 'v-lock') { var p = vue && vue.liste[vue.i]; if (p) bascule(p.id); }
    else if (g === 'v-suppr') supprimer();
  });

  /* ── Style ── */
  var css = document.createElement('style');
  css.textContent = [
    '.gal-actions{display:flex;align-items:center;gap:12px;padding:0 16px 14px;flex-wrap:wrap}',
    '.gal-actions span{font-size:.74rem;color:var(--txt2);flex:1;min-width:150px}',
    '.gal-add{padding:12px 18px;border:none;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font:700 .88rem var(--font);cursor:pointer;min-height:44px}',
    '.gal-vide{text-align:center;padding:40px 20px;color:var(--txt2);font-size:.88rem}.gal-vide span{font-size:.74rem;color:var(--txt3)}',
    '.gal-album{margin-bottom:18px}',
    '.gal-villes{display:flex;gap:6px;overflow-x:auto;padding:0 16px 12px;align-items:center;scrollbar-width:none}.gal-choix{padding:10px 0 0}.gal-choix>span{font-size:.74rem;color:var(--txt2);white-space:nowrap}',
    '.gal-chip{flex:none;border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 13px;font:600 .76rem var(--font);color:var(--txt2);cursor:pointer;min-height:36px}.gal-chip.on{background:var(--txt);border-color:var(--txt);color:#fff}',
    '.gal-album header{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding:0 16px 8px}',
    '.gal-album h2{font-size:1rem;font-weight:700;margin:0;font-family:var(--font-title)}',
    '.gal-album header p{margin:2px 0 0;font-size:.72rem;color:var(--txt2)}',
    '.gal-lien{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 12px;font:600 .72rem var(--font);color:var(--txt2);cursor:pointer;min-height:36px;white-space:nowrap}',
    '.gal-lock{position:absolute;top:4px;right:4px;width:34px;height:34px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:.85rem;cursor:pointer;display:grid;place-items:center}',
    '.gal-lock.priv{background:var(--accent)}',
    '.gal-sheet{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;backdrop-filter:blur(4px)}',
    '.gal-sheet-in{width:100%;max-height:92vh;overflow:auto;background:#fff;border-radius:24px 24px 0 0;padding:0 16px calc(16px + env(safe-area-inset-bottom));animation:slideUp .25s ease}',
    '.gal-poignee{width:36px;height:4px;background:#ddd;border-radius:2px;margin:12px auto 14px}',
    '.gal-sheet h3{font-size:1.05rem;margin:0 0 12px;font-family:var(--font-title)}',
    '.gal-barre{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 8px;font-size:.74rem;color:var(--txt2)}',
    '.gal-prev{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.gal-prev-it{position:relative;aspect-ratio:1;border:3px solid transparent;border-radius:12px;padding:0;overflow:hidden;background:var(--bg);cursor:pointer}',
    '.gal-prev-it img{width:100%;height:100%;object-fit:cover;display:block}',
    '.gal-prev-it.priv{border-color:var(--accent)}.gal-prev-it.priv img{filter:brightness(.7)}',
    '.gal-prev-it span{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;font-size:.8rem;padding:3px 7px}',
    '.gal-resume{text-align:center;font-size:.76rem;color:var(--txt2);margin:10px 0}',
    '.gal-go{width:100%;padding:14px;border:none;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font:700 .92rem var(--font);cursor:pointer;min-height:48px}',
    '.gal-go:disabled{opacity:.7}',
    '.gal-annuler{width:100%;padding:12px;border:none;background:none;color:var(--txt2);font:600 .84rem var(--font);cursor:pointer;margin-top:4px}',
    '.gal-vue{position:fixed;inset:0;z-index:4000;background:#000;display:flex;align-items:center;justify-content:center}',
    '.gal-vue img{max-width:100%;max-height:100%;object-fit:contain;transition:filter .2s}.gal-vue img.flou{filter:blur(6px)}',
    '.gal-vue-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;color:#fff;font-size:.8rem;z-index:2;background:linear-gradient(#000a,transparent)}',
    '.gal-vue-top div{display:flex;gap:8px}',
    '.gal-vue-top button{border:none;background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:8px 12px;font:600 .8rem var(--font);cursor:pointer;min-height:40px}',
    '.gal-nav{position:absolute;top:50%;transform:translateY(-50%);border:none;background:rgba(255,255,255,.18);color:#fff;width:44px;height:64px;font-size:1.8rem;cursor:pointer;z-index:2;border-radius:12px}',
    '.gal-nav.g{left:6px}.gal-nav.d{right:6px}'
  ].join('');
  document.head.appendChild(css);
})();
