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
  var filtreJour = '';    // jour filtré (AAAA-MM-JJ, '' = tous)
  var filtre = '';        // ville filtrée dans la galerie ('' = toutes)
  var villeEnvoi = '';
  var cible = null;       // album existant auquel on ajoute des photos : {lot, album, ville}
  var sel = null;         // mode sélection : liste d'ids cochés, ou null
  var dep = null;         // déplacement en cours : {ids, nouveau, ville}
  var likes = {};         // id photo -> nombre de likes
  var mesLikes = {};      // id photo -> true si CET appareil a liké
  var edit = null;        // album en cours de modification : {lot, ville}    // ville choisie dans la feuille d'envoi         // visionneuse : {liste, i}

  function nouveauLot() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function editeur() { return isEditorMode(); }
  function q(id) { return document.getElementById(id); }

  /* ── Likes : le visiteur est reconnu par un identifiant aléatoire gardé sur son appareil ── */
  function monId() {
    try {
      var id = localStorage.getItem('gal_client');
      if (!id || id.length < 8) { id = nouveauLot(); localStorage.setItem('gal_client', id); }
      return id;
    } catch (e) { return window.__galId || (window.__galId = nouveauLot()); }
  }
  async function chargerLikes() {
    try {
      var r = await sb.from('photo_likes').select('photo_id,client_id').limit(20000);
      if (r.error) throw r.error;
      likes = {}; mesLikes = {};
      var moi = monId();
      (r.data || []).forEach(function (l) { likes[l.photo_id] = (likes[l.photo_id] || 0) + 1; if (l.client_id === moi) mesLikes[l.photo_id] = true; });
    } catch (e) { /* table pas encore créée : la galerie marche sans likes */ }
  }
  function coeur(p) {
    var n = likes[p.id] || 0, moi = !!mesLikes[p.id];
    if (editeur()) return n ? '<span class="gal-like lu" aria-label="' + n + ' like' + (n > 1 ? 's' : '') + '">❤️ ' + n + '</span>' : '';
    return '<button type="button" class="gal-like' + (moi ? ' on' : '') + '" data-g="like" data-id="' + esc(p.id) + '" aria-pressed="' + moi + '" aria-label="' + (moi ? 'Retirer mon like' : 'Liker la photo') + '">'
      + (moi ? '❤️' : '🤍') + (n ? ' ' + n : '') + '</button>';
  }
  async function aime(id) {
    var moi = !!mesLikes[id], cid = monId();
    // affichage immédiat, annulé si la base refuse
    if (moi) { delete mesLikes[id]; likes[id] = Math.max(0, (likes[id] || 1) - 1); } else { mesLikes[id] = true; likes[id] = (likes[id] || 0) + 1; }
    rafraichirLikes(id);
    var r = moi ? await sb.from('photo_likes').delete().eq('photo_id', id).eq('client_id', cid)
                : await sb.from('photo_likes').insert({ photo_id: id, client_id: cid });
    if (r.error && r.error.code !== '23505') {
      if (moi) { mesLikes[id] = true; likes[id] = (likes[id] || 0) + 1; } else { delete mesLikes[id]; likes[id] = Math.max(0, (likes[id] || 1) - 1); }
      rafraichirLikes(id);
      showToast('❌ Like impossible');
    }
  }
  function rafraichirLikes(id) {
    var p = photos.find(function (x) { return x.id === id; }); if (!p) return;
    document.querySelectorAll('.gal-like[data-id="' + id + '"]').forEach(function (b) {
      // on met le bouton à jour sur place (sans le remplacer) : un bouton retiré en plein tap peut faire déraper le geste
      var moi = !!mesLikes[id], n = likes[id] || 0;
      b.className = 'gal-like' + (moi ? ' on' : '');
      b.setAttribute('aria-pressed', moi);
      b.setAttribute('aria-label', moi ? 'Retirer mon like' : 'Liker la photo');
      b.textContent = (moi ? '❤️' : '🤍') + (n ? ' ' + n : '');
    });
  }

  /* ── Lecture ── */
  async function charger() {
    var req = sb.from('photos').select('id,created_at,auteur,lot,album,ville,prive,mini,image').order('created_at', { ascending: false }).limit(2000);
    if (!editeur()) req = req.eq('prive', false);
    var r = await req;
    if (r.error) throw r.error;
    photos = r.data || [];
  }

  function albums() {
    var map = {}, ordre = [];
    photos.forEach(function (p) {
      if (!map[p.lot]) { map[p.lot] = { lot: p.lot, album: p.album, ville: p.ville, date: p.created_at, items: [] }; ordre.push(map[p.lot]); }
      if (p.created_at < map[p.lot].date) map[p.lot].date = p.created_at; // l'album date de sa 1re photo
      map[p.lot].items.push(p);
    });
    ordre.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; }); // le dernier jour en haut
    ordre.forEach(function (a) { a.items.sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; }); });
    return ordre;
  }

  function jourDe(a) { var d = new Date(a.date); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function jourTxt(j) { var t = j.split('-'); return new Date(+t[0], +t[1] - 1, +t[2]).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }

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
    try { await charger(); await chargerLikes(); }
    catch (e) {
      cont.innerHTML = '<div class="gal-vide">📷 La galerie n\'est pas encore prête.<br><span>Il manque la table <b>photos</b> dans Supabase (migration 20261108000000_photos.sql).</span></div>';
      return;
    }
    var html = '';
    if (editeur()) {
      html += '<div class="gal-actions"><button type="button" class="gal-add" data-g="ajouter">＋ Ajouter des photos</button>'
        + '<button type="button" class="gal-lien" data-g="choisir">' + (sel ? '✕ Annuler la sélection' : '☑ Sélectionner') + '</button>'
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
    var jours = [];
    tous.forEach(function (a) { var j = jourDe(a); if (jours.indexOf(j) < 0) jours.push(j); });
    if (filtreJour && jours.indexOf(filtreJour) < 0) filtreJour = '';
    if (jours.length > 1) {
      html += '<div class="gal-villes"><button type="button" class="gal-chip' + (!filtreJour ? ' on' : '') + '" data-g="jour" data-v="">Tous les jours</button>';
      jours.forEach(function (j) { html += '<button type="button" class="gal-chip' + (filtreJour === j ? ' on' : '') + '" data-g="jour" data-v="' + j + '">📅 ' + esc(jourTxt(j)) + '</button>'; });
      html += '</div>';
    }
    var liste = tous.filter(function (a) { return (!filtre || a.ville === filtre) && (!filtreJour || jourDe(a) === filtreJour); });
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
        html += '<div class="gal-hbtn"><button type="button" class="gal-lien" data-g="plus" data-lot="' + esc(a.lot) + '">＋ Photos</button>'
          + '<button type="button" class="gal-lien" data-g="modif" data-lot="' + esc(a.lot) + '" aria-label="Modifier l\'album">✏️</button></div>';
        html += '<button type="button" class="gal-lien" data-g="tout" data-lot="' + esc(a.lot) + '" data-prive="' + (nbPriv < a.items.length ? 1 : 0) + '">'
          + (nbPriv < a.items.length ? '🔒 Tout privé' : '🌐 Tout public') + '</button>';
      }
      html += '</header><div class="gallery-grid">';
      a.items.forEach(function (p) {
        var coche = sel && sel.indexOf(p.id) >= 0;
        html += '<div class="gallery-item' + (coche ? ' gal-coche' : '') + '" data-g="voir" data-id="' + esc(p.id) + '"><img src="' + p.mini + '" loading="lazy" alt="Photo">' + coeur(p)
          + (sel ? '<span class="gal-case">' + (coche ? '✓' : '') + '</span>' : '')
          + (editeur() && !sel ? '<button type="button" class="gal-lock' + (p.prive ? ' priv' : '') + '" data-g="bascule" data-id="' + esc(p.id)
            + '" aria-label="' + (p.prive ? 'Privée : la rendre publique' : 'Publique : la rendre privée') + '">' + (p.prive ? '🔒' : '🌐') + '</button>' : '')
          + '</div>';
      });
      html += '</div></section>';
    });
    cont.innerHTML = html;
    barreSel();
  };

  /* ── Ajout de plusieurs photos ── */
  window.openGallery = function () {
    if (!editeur()) { showToast('👁️ Lecture seule'); return; }
    if (typeof goTabByName === 'function') goTabByName('galerie');
    ajouter();
  };

  function ajouter(lot) {
    if (!editeur()) return;
    var a = lot && albums().filter(function (x) { return x.lot === lot; })[0];
    cible = a ? { lot: a.lot, album: a.album || null, ville: a.ville || null, nom: titre(a) } : null;
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
    if (files.length > 100) { showToast('📷 100 photos max par envoi, les 100 premières sont gardées'); files = files.slice(0, 100); }
    villeEnvoi = cible ? (cible.ville || '') : (filtre || '');
    envoi = { files: files, prive: files.map(function () { return false; }), busy: false, urls: files.map(function (f) { return URL.createObjectURL(f); }) };
    feuille();
  }

  function feuille() {
    var old = q('galSheet'); if (old) old.remove();
    var n = envoi.files.length, nbPriv = envoi.prive.filter(Boolean).length;
    var s = document.createElement('div'); s.id = 'galSheet'; s.className = 'gal-sheet';
    var h = '<div class="gal-sheet-in"><div class="gal-poignee"></div>'
      + '<h3>' + n + ' photo' + (n > 1 ? 's' : '') + ' à ajouter</h3>'
      + (cible ? '<p class="gal-cible">Ajout à l\'album <b>' + esc(cible.nom) + '</b></p>' : '<input class="form-input" id="galTitre" maxlength="60" placeholder="Titre de l\'album (facultatif) : Jour 3, Le Bund…">'
        + '<div class="gal-villes gal-choix"><span>📍 Ville</span>' + (typeof VILLES !== 'undefined' ? VILLES : []).concat(['Autre']).map(function (v) {
          var val = v === 'Autre' ? '' : v;
          return '<button type="button" class="gal-chip' + ((v === 'Autre' ? villeEnvoi === '' : villeEnvoi === v) ? ' on' : '') + '" data-g="env-ville" data-v="' + esc(val) + '">' + esc(v) + '</button>';
        }).join('') + '</div>')
      + '<div class="gal-barre"><span>Touche une photo pour la passer en <b>🔒 privée</b> ou <b>🌐 publique</b>.</span>'
      + '<button type="button" class="gal-lien" data-g="env-tout">' + (nbPriv < n ? '🔒 Tout privé' : '🌐 Tout public') + '</button></div>'
      + '<div class="gal-prev">';
    envoi.urls.forEach(function (u, i) {
      h += '<button type="button" class="gal-prev-it' + (envoi.prive[i] ? ' priv' : '') + '" data-g="env-bascule" data-i="' + i + '" aria-label="Photo ' + (i + 1) + (envoi.prive[i] ? ', privée' : ', publique') + '">'
        + '<img src="' + u + '" alt=""><span>' + (envoi.prive[i] ? '🔒' : '🌐') + '</span></button>';
    });
    h += '</div><div class="gal-resume">' + (n - nbPriv) + ' publique' + (n - nbPriv > 1 ? 's' : '') + ' · ' + nbPriv + ' privée' + (nbPriv > 1 ? 's' : '') + '</div>'
      + '<button type="button" class="gal-go" id="galGo" data-g="env-go">' + (cible ? 'Ajouter à l\'album' : 'Publier l\'album') + '</button>'
      + '<button type="button" class="gal-annuler" data-g="env-annuler">Annuler</button></div>';
    s.innerHTML = h;
    document.body.appendChild(s);
  }

  function fermerFeuille() {
    cible = null;
    if (envoi) envoi.urls.forEach(function (u) { URL.revokeObjectURL(u); });
    envoi = null;
    var s = q('galSheet'); if (s) s.remove();
  }

  async function publier() {
    if (!envoi || envoi.busy) return;
    envoi.busy = true;
    var titreAlbum = cible ? cible.album : ((q('galTitre') && q('galTitre').value.trim()) || null);
    var villePub = cible ? cible.ville : (villeEnvoi || null);
    var lot = cible ? cible.lot : nouveauLot();
    var go = q('galGo'), n = envoi.files.length, ok = 0, rate = 0;
    var base = Date.now();
    for (var i = 0; i < n; i++) {
      if (go) { go.disabled = true; go.textContent = 'Envoi ' + (i + 1) + ' / ' + n + '…'; }
      try {
        var grande = await (await fetch(await compressImage(envoi.files[i], 1600, 0.8))).blob();
        var mini = await (await fetch(await compressImage(envoi.files[i], 400, 0.7))).blob();
        var nom = lot + '/' + Date.now().toString(36) + i;
        var st = sb.storage.from('photos'), opt = { contentType: 'image/jpeg', cacheControl: '31536000' };
        var u1 = await st.upload(nom + '.jpg', grande, opt);
        var u2 = await st.upload(nom + '-m.jpg', mini, opt);
        if (u1.error || u2.error) { await st.remove([nom + '.jpg', nom + '-m.jpg']); throw (u1.error || u2.error); }
        var r = await sb.from('photos').insert({
          auteur: currentUser, lot: lot, album: titreAlbum, ville: villePub, prive: envoi.prive[i],
          mini: st.getPublicUrl(nom + '-m.jpg').data.publicUrl, image: st.getPublicUrl(nom + '.jpg').data.publicUrl,
          created_at: new Date(base + i).toISOString() // garde l'ordre choisi dans l'album
        });
        if (r.error) { await st.remove([nom + '.jpg', nom + '-m.jpg']); throw r.error; }
        ok++;
      } catch (e) { rate++; }
    }
    fermerFeuille();
    showToast(rate ? '⚠️ ' + ok + ' envoyée' + (ok > 1 ? 's' : '') + ', ' + rate + ' en échec' : '✅ ' + ok + ' photo' + (ok > 1 ? 's' : '') + ' ajoutée' + (ok > 1 ? 's' : ''));
    renderGalerie();
  }

  /* ── Déplacer des photos vers un autre album ── */
  function barreSel() {
    var b = q('galSelBar'); if (b) b.remove();
    if (!sel) return;
    b = document.createElement('div'); b.id = 'galSelBar'; b.className = 'gal-selbar';
    b.innerHTML = '<span>' + sel.length + ' sélectionnée' + (sel.length > 1 ? 's' : '') + '</span>'
      + '<button type="button" data-g="sel-dep"' + (sel.length ? '' : ' disabled') + '>📁 Déplacer vers…</button>'
      + '<button type="button" data-g="choisir">Annuler</button>';
    (q('tab-galerie') || document.body).appendChild(b); // dans l'onglet : la barre disparaît avec lui
  }

  function deplacer(ids) {
    dep = { ids: ids, nouveau: false, ville: '' };
    feuilleDep();
  }

  function feuilleDep() {
    var old = q('galDep'); if (old) old.remove();
    var s = document.createElement('div'); s.id = 'galDep'; s.className = 'gal-sheet'; s.style.zIndex = 5000;
    var n = dep.ids.length, h = '<div class="gal-sheet-in"><div class="gal-poignee"></div><h3>Déplacer ' + n + ' photo' + (n > 1 ? 's' : '') + ' vers…</h3>';
    if (!dep.nouveau) {
      h += '<div class="gal-dest">';
      albums().forEach(function (a) {
        h += '<button type="button" data-g="dep-vers" data-lot="' + esc(a.lot) + '"><b>' + esc(titre(a)) + '</b><span>' + (a.ville ? '📍 ' + esc(a.ville) + ' · ' : '') + a.items.length + ' photo' + (a.items.length > 1 ? 's' : '') + '</span></button>';
      });
      h += '<button type="button" class="neuf" data-g="dep-nouveau">＋ Nouvel album</button></div>';
    } else {
      h += '<input class="form-input" id="galDepTitre" maxlength="60" placeholder="Titre du nouvel album">'
        + '<div class="gal-villes gal-choix"><span>📍 Ville</span>' + (typeof VILLES !== 'undefined' ? VILLES : []).concat(['Autre']).map(function (v) {
          var val = v === 'Autre' ? '' : v;
          return '<button type="button" class="gal-chip' + ((v === 'Autre' ? dep.ville === '' : dep.ville === v) ? ' on' : '') + '" data-g="dep-ville" data-v="' + esc(val) + '">' + esc(v) + '</button>';
        }).join('') + '</div><button type="button" class="gal-go" data-g="dep-ok" style="margin-top:14px">Créer et déplacer</button>';
    }
    h += '<button type="button" class="gal-annuler" data-g="dep-annuler">Annuler</button></div>';
    s.innerHTML = h;
    document.body.appendChild(s);
  }

  async function fairePasser(champs) {
    var ids = dep.ids;
    var r = await sb.from('photos').update(champs).in('id', ids);
    if (r.error) { showToast('❌ Déplacement impossible'); return; }
    dep = null; q('galDep').remove(); sel = null;
    fermerVue();
    showToast('📁 ' + ids.length + ' photo' + (ids.length > 1 ? 's' : '') + ' déplacée' + (ids.length > 1 ? 's' : ''));
    renderGalerie();
  }

  function choisirDest(lot) {
    var a = albums().filter(function (x) { return x.lot === lot; })[0];
    if (a) fairePasser({ lot: a.lot, album: a.album || null, ville: a.ville || null });
  }

  function confirmerNouveau() {
    var t = q('galDepTitre').value.trim();
    if (!t) { showToast('✏️ Donne un titre au nouvel album'); return; }
    fairePasser({ lot: nouveauLot(), album: t, ville: dep.ville || null });
  }

  /* ── Modifier un album déjà publié ── */
  function modifier(lot) {
    var a = albums().filter(function (x) { return x.lot === lot; })[0];
    if (!a) return;
    edit = { lot: lot, ville: a.ville || '', n: a.items.length, items: a.items };
    feuilleEdit(a.album || '');
  }

  function feuilleEdit(titreVal) {
    var old = q('galEdit'); if (old) old.remove();
    var s = document.createElement('div'); s.id = 'galEdit'; s.className = 'gal-sheet';
    s.innerHTML = '<div class="gal-sheet-in"><div class="gal-poignee"></div><h3>Modifier l\'album</h3>'
      + '<input class="form-input" id="galEdTitre" maxlength="60" placeholder="Titre de l\'album" value="' + esc(titreVal) + '">'
      + '<div class="gal-villes gal-choix"><span>📍 Ville</span>' + (typeof VILLES !== 'undefined' ? VILLES : []).concat(['Autre']).map(function (v) {
          var val = v === 'Autre' ? '' : v;
          return '<button type="button" class="gal-chip' + ((v === 'Autre' ? edit.ville === '' : edit.ville === v) ? ' on' : '') + '" data-g="ed-ville" data-v="' + esc(val) + '">' + esc(v) + '</button>';
        }).join('') + '</div>'
      + '<button type="button" class="gal-go" data-g="ed-ok" style="margin-top:14px">Enregistrer</button>'
      + '<button type="button" class="gal-annuler" data-g="ed-annuler">Annuler</button>'
      + '<button type="button" class="gal-annuler gal-danger" data-g="ed-suppr">🗑️ Supprimer tout l\'album (' + edit.n + ' photo' + (edit.n > 1 ? 's' : '') + ')</button></div>';
    document.body.appendChild(s);
  }

  async function enregistrer() {
    if (!edit) return;
    var t = q('galEdTitre').value.trim() || null;
    var r = await sb.from('photos').update({ album: t, ville: edit.ville || null }).eq('lot', edit.lot);
    if (r.error) { showToast('❌ Modification impossible'); return; }
    edit = null; q('galEdit').remove();
    showToast('✅ Album modifié');
    renderGalerie();
  }

  async function supprimerAlbum() {
    if (!edit) return;
    if (!confirm('Supprimer l\'album et ses ' + edit.n + ' photos pour de bon ?')) return;
    var chemins = [];
    edit.items.forEach(function (p) { [p.image, p.mini].forEach(function (u) { var m = /\/photos\/(.+)$/.exec(u || ''); if (m) chemins.push(decodeURIComponent(m[1])); }); });
    var r = await sb.from('photos').delete().eq('lot', edit.lot);
    if (r.error) { showToast('❌ Suppression impossible'); return; }
    if (chemins.length) sb.storage.from('photos').remove(chemins);
    edit = null; q('galEdit').remove();
    showToast('🗑️ Album supprimé');
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
      + (editeur() ? '<button type="button" data-g="v-dep">📁 Déplacer</button><button type="button" data-g="v-lock" id="galVueLock"></button><button type="button" data-g="v-suppr" aria-label="Supprimer">🗑️</button>' : '')
      + '<button type="button" data-g="v-fermer" aria-label="Fermer">✕</button></div></div>'
      + '<div class="gal-vue-like" id="galVueLike"></div>'
      + '<button type="button" class="gal-nav g" data-g="v-prec" aria-label="Précédente">‹</button>'
      + '<img id="galVueImg" alt="Photo">'
      + '<button type="button" class="gal-nav d" data-g="v-suiv" aria-label="Suivante">›</button>';
    v.addEventListener('touchstart', function (e) {
      // un tap sur un bouton (like, fermer…) n'est jamais un début de glissement
      if (vue) vue.x = (e.target.closest && e.target.closest('button')) ? null : e.touches[0].clientX;
    }, { passive: true });
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
    var vl = q('galVueLike'); if (vl) vl.innerHTML = coeur(p);
    var lk = q('galVueLock'); if (lk) lk.textContent = p.prive ? '🔒 Privée' : '🌐 Publique';
    var mon = ++jeton, gros = new Image();
    gros.onload = function () { if (mon === jeton && q('galVueImg')) { img.src = p.image; img.classList.remove('flou'); } };
    gros.src = p.image;
    var suiv = vue.liste[(vue.i + 1) % vue.liste.length]; if (suiv) new Image().src = suiv.image; // la suivante charge pendant qu'on regarde
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
    var chemins = [p.image, p.mini].map(function (u) { var m = /\/photos\/(.+)$/.exec(u || ''); return m && decodeURIComponent(m[1]); }).filter(Boolean);
    if (chemins.length) sb.storage.from('photos').remove(chemins);
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
    if (g === 'like') { e.stopPropagation(); aime(el.dataset.id); }
    else if (g === 'ajouter') ajouter();
    else if (g === 'voir') {
      if (sel) { var k = sel.indexOf(el.dataset.id); if (k >= 0) sel.splice(k, 1); else sel.push(el.dataset.id); renderGalerie(); }
      else voir(el.dataset.id);
    }
    else if (g === 'choisir') { sel = sel ? null : []; renderGalerie(); }
    else if (g === 'sel-dep') { if (sel && sel.length) deplacer(sel.slice()); }
    else if (g === 'v-dep') { var pv = vue && vue.liste[vue.i]; if (pv) deplacer([pv.id]); }
    else if (g === 'dep-vers') choisirDest(el.dataset.lot);
    else if (g === 'dep-nouveau') { dep.nouveau = true; feuilleDep(); }
    else if (g === 'dep-ville') { dep.ville = el.dataset.v; var t5 = q('galDepTitre') && q('galDepTitre').value; feuilleDep(); if (t5) q('galDepTitre').value = t5; }
    else if (g === 'dep-ok') confirmerNouveau();
    else if (g === 'dep-annuler') { dep = null; var d0 = q('galDep'); if (d0) d0.remove(); }
    else if (g === 'bascule') { e.stopPropagation(); bascule(el.dataset.id); }
    else if (g === 'tout') {
      var ids = photos.filter(function (p) { return p.lot === el.dataset.lot; }).map(function (p) { return p.id; });
      var prive = el.dataset.prive === '1';
      if (await fixer(ids, prive)) { showToast(prive ? '🔒 Album privé' : '🌐 Album visible par la famille'); renderGalerie(); }
    }
    else if (g === 'env-bascule') { var i = +el.dataset.i; envoi.prive[i] = !envoi.prive[i]; var t = q('galTitre') && q('galTitre').value; feuille(); if (t) q('galTitre').value = t; }
    else if (g === 'env-tout') { var tout = envoi.prive.some(function (x) { return !x; }); envoi.prive = envoi.prive.map(function () { return tout; }); var t2 = q('galTitre') && q('galTitre').value; feuille(); if (t2) q('galTitre').value = t2; }
    else if (g === 'plus') ajouter(el.dataset.lot);
    else if (g === 'modif') modifier(el.dataset.lot);
    else if (g === 'ed-ville') { edit.ville = el.dataset.v; var t4 = q('galEdTitre').value; feuilleEdit(t4); }
    else if (g === 'ed-ok') enregistrer();
    else if (g === 'ed-annuler') { edit = null; var e0 = q('galEdit'); if (e0) e0.remove(); }
    else if (g === 'ed-suppr') supprimerAlbum();
    else if (g === 'jour') { filtreJour = el.dataset.v; renderGalerie(); }
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
    '.gal-case{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.35);color:#fff;font-size:.8rem;display:grid;place-items:center}.gal-coche{outline:3px solid var(--accent);outline-offset:-3px}.gal-coche .gal-case{background:var(--accent)}',
    '.gal-selbar{position:fixed;left:12px;right:12px;bottom:calc(var(--nav,68px) + 10px + env(safe-area-inset-bottom));z-index:2500;display:flex;align-items:center;gap:8px;background:var(--txt);color:#fff;border-radius:16px;padding:10px 12px;box-shadow:var(--shadow-lg)}.gal-selbar span{flex:1;font-size:.8rem}.gal-selbar button{border:none;border-radius:999px;padding:9px 13px;font:700 .78rem var(--font);cursor:pointer;min-height:40px;background:rgba(255,255,255,.18);color:#fff}.gal-selbar button:first-of-type{background:var(--accent)}.gal-selbar button:disabled{opacity:.4}',
    '.gal-dest{display:flex;flex-direction:column;gap:8px}.gal-dest button{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;padding:13px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;font:600 .86rem var(--font);color:var(--txt);cursor:pointer;min-height:48px}.gal-dest span{font-size:.72rem;color:var(--txt2);font-weight:500}.gal-dest .neuf{justify-content:center;border-style:dashed;color:var(--accent)}',
    '.gal-hbtn{display:flex;gap:6px;margin-left:auto}.gal-cible{margin:0 0 4px;font-size:.84rem;color:var(--txt2)}.gal-danger{color:var(--accent);margin-top:10px}',
    '.gal-villes{display:flex;gap:6px;overflow-x:auto;padding:0 16px 12px;align-items:center;scrollbar-width:none}.gal-choix{padding:10px 0 0}.gal-choix>span{font-size:.74rem;color:var(--txt2);white-space:nowrap}',
    '.gal-chip{flex:none;border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 13px;font:600 .76rem var(--font);color:var(--txt2);cursor:pointer;min-height:36px}.gal-chip.on{background:var(--txt);border-color:var(--txt);color:#fff}',
    '.gal-album header{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px;padding:0 16px 8px}',
    '.gal-album h2{font-size:1rem;font-weight:700;margin:0;font-family:var(--font-title)}',
    '.gal-album header p{margin:2px 0 0;font-size:.72rem;color:var(--txt2)}',
    '.gal-lien{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 12px;font:600 .72rem var(--font);color:var(--txt2);cursor:pointer;min-height:36px;white-space:nowrap}',
    '.gal-lock{position:absolute;top:4px;right:4px;width:34px;height:34px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:.85rem;cursor:pointer;display:grid;place-items:center}',
    '.gal-lock.priv{background:var(--accent)}',
    '.gal-like{touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:absolute;left:4px;bottom:4px;border:none;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:700 .74rem var(--font);padding:0 10px;min-height:34px;min-width:34px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;z-index:1}',
    '.gal-like.on{background:rgba(255,255,255,.92);color:#222}.gal-like.lu{pointer-events:none;min-height:26px;padding:0 8px;font-size:.7rem}',
    '.gal-vue-like{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom));z-index:3}',
    '.gal-vue-like .gal-like{position:static;min-height:48px;padding:0 20px;font-size:1rem;background:rgba(255,255,255,.18)}.gal-vue-like .gal-like.on{background:rgba(255,255,255,.92)}',
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
