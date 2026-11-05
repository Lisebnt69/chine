/* Interface visiteur réduite.
   Un proche sans code ne voit que l'important : l'accueil, le programme, les souhaits (tickets) et la galerie
   dans la barre du bas ; tout le reste (hôtels, transport, planning, carte, restos…) dans « Plus », sauf l'argent
   et les outils de l'équipe, masqués ET refusés
   si on y arrive par un lien interne. Chargé en dernier. */

const VISITEUR_ONGLETS = ['accueil', 'programme', 'souhaits', 'galerie', 'hotels', 'transport', 'pratique',
  'planning', 'carte', 'activites', 'restaurants', 'nourriture', 'checklist', 'notes', 'phrases', 'stats'];
const vsEst = () => typeof currentUser !== 'undefined' && currentUser === 'visiteur';

/* Barre du bas : deux boutons de plus (Souhaits, Galerie), visibles seulement en mode visiteur. */
{
  const nav = document.querySelector('nav.nav');
  const plus = document.getElementById('nb-more');
  if (nav && plus && !document.getElementById('nb-souhaits')) {
    [['souhaits', 'gift', 'Souhaits'], ['galerie', 'image', 'Galerie']].forEach(([n, icone, lb]) => {
      const b = document.createElement('button');
      b.className = 'nb vs-only'; b.id = 'nb-' + n; b.type = 'button';
      b.setAttribute('onclick', `goTab('${n}',this);closeNavDrawer()`);
      b.innerHTML = `<span class="nic">${ic(icone)}</span><span class="nlb">${lb}</span>`;
      nav.insertBefore(b, plus);
    });
  }
}

/* Planning et Carte quittent la barre du bas mais restent à portée : une case de plus dans « Plus ». */
{
  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !document.getElementById('nd-planning')) {
    [['planning', 'calendar', 'Planning'], ['carte', 'map', 'Carte']].forEach(([n, icone, lb]) => {
      const b = document.createElement('button');
      b.className = 'nav-drawer-btn vs-only'; b.id = 'nd-' + n; b.type = 'button';
      b.onclick = () => { goTab(n, document.getElementById('nb-more')); closeNavDrawer(); };
      b.innerHTML = `<span class="nav-drawer-ic">${ic(icone)}</span><span class="nav-drawer-lbl">${lb}</span>`;
      grid.insertBefore(b, grid.firstChild);
    });
  }
}

/* Mode visiteur = une classe sur <body>, posée à chaque changement de compte. */
{
  const _update = updateEditorUI;
  updateEditorUI = function () {
    _update.apply(this, arguments);
    document.body.classList.toggle('visiteur-mode', vsEst());
  };
  updateEditorUI();

  /* Un lien interne vers un onglet masqué (carte de l'accueil, puce, etc.) retombe sur le programme. */
  const _goTab = goTab;
  goTab = function (n, el) {
    if (vsEst() && !VISITEUR_ONGLETS.includes(n)) { n = 'programme'; el = document.getElementById('nb-programme'); }
    _goTab(n, el);
    if (vsEst()) {
      const direct = document.getElementById('nb-' + n);
      if (direct && n !== 'programme') { document.querySelectorAll('.nb').forEach(b => b.classList.remove('on')); direct.classList.add('on'); }
    }
  };
  const _byName = goTabByName;
  goTabByName = function (name) {
    if (vsEst() && !VISITEUR_ONGLETS.includes(name)) return goTab('programme', document.getElementById('nb-programme'));
    return _byName(name);
  };
  const _map = getDrawerMainNavMap;
  getDrawerMainNavMap = function () { return { ..._map(), souhaits: 'nb-souhaits', galerie: 'nb-galerie' }; };
}

document.head.insertAdjacentHTML('beforeend', `<style>
.vs-only{display:none!important}
.visiteur-mode .vs-only{display:flex!important}
.visiteur-mode #nb-planning,.visiteur-mode #nb-carte,.visiteur-mode #nb-chat,
/* Ni budget, ni outils de l'équipe dans « Plus » (Stats reste, sans aucun montant). */
.visiteur-mode #nd-budget,.visiteur-mode #nd-roomy,.visiteur-mode #nd-areserver,.visiteur-mode #nd-questions,.visiteur-mode #nd-cerveau,
.visiteur-mode #nd-souhaits,.visiteur-mode #nd-galerie{display:none!important}
.visiteur-mode .qa-row,.visiteur-mode .pdf-export-btn{display:none!important}
</style>`);
