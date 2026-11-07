/* ═══════════════════════════════════════════════════════════════
   depense.js — Dépense rapide : on tape le montant, on touche la catégorie, c'est enregistré (2 gestes).

   Remplace le formulaire quand on touche « ＋ Dépense » (en-tête, onglet Budget, Accueil). Le formulaire complet reste
   disponible par le lien en bas de la feuille, et pour modifier une dépense existante rien ne change.
   En voyage (9 → 22 nov.) la saisie est en yuans, convertie en euros avec le taux de l'app : la base garde toujours des euros.
   Chargé APRÈS index.html (il enveloppe openBudgetSheet).
   ═══════════════════════════════════════════════════════════════ */

// Les libellés sont EXACTEMENT ceux de la liste du formulaire complet (budget.categorie les regroupe par texte).
const DR_CATS = [
  ['🍽️ Restaurant', '🍽️', 'Resto'], ['☕ Café / Bar', '☕', 'Café'], ['🚗 Taxi / DiDi', '🚗', 'Taxi'],
  ['🎯 Activité / Entrée', '🎯', 'Activité'], ['🛍️ Shopping', '🛍️', 'Shopping'], ['🚌 Bus', '🚌', 'Bus'],
  ['🚂 Train', '🚂', 'Train'], ['🏨 Hôtel', '🏨', 'Hôtel'], ['💊 Pharmacie / Santé', '💊', 'Santé'],
  ['📱 SIM / Internet', '📱', 'SIM'], ['🎭 Spectacle', '🎭', 'Spectacle'], ['💸 Divers', '💸', 'Divers'],
];
const DR = { devise: 'EUR', qui: 'les deux', envoi: false };

const drTaux = () => (convRate > 0 ? convRate : 7.78);
const drEl = id => document.getElementById(id);
const drQuiMemo = () => { try { const v = localStorage.getItem('dr_qui'); return ['les deux', 'matis', 'lise'].includes(v) ? v : 'les deux'; } catch (e) { return 'les deux'; } };
const drMontant = () => { const v = parseFloat(String(drEl('drMontant')?.value || '').replace(',', '.')); return v > 0 && v < 1000000 ? v : 0; };
const drEnEuros = v => DR.devise === 'CNY' ? Math.round(v / drTaux() * 100) / 100 : v;

function drMajApercu() {
  const v = drMontant(), hint = drEl('drHint'); if (!hint) return;
  hint.innerHTML = DR.devise === 'CNY'
    ? (v ? `= <b>${fmtE(drEnEuros(v))}</b> · 1 € = ${drTaux()} ¥` : `Saisie en yuans · 1 € = ${drTaux()} ¥`)
    : '';
}
function drDevise(d) {
  DR.devise = d;
  drEl('drCny')?.classList.toggle('on', d === 'CNY');
  drEl('drEur')?.classList.toggle('on', d === 'EUR');
  drMajApercu();
}
function drQui(k) {
  DR.qui = k;
  document.querySelectorAll('#dr-overlay .dr-qui').forEach(b => b.classList.toggle('on', b.dataset.k === k));
}

function ouvrirDepenseRapide() {
  if (!isEditorMode()) { showToast('🔒 Mode lecteur'); return; }
  drEl('dr-overlay')?.remove();
  DR.envoi = false;
  const ov = document.createElement('div');
  ov.className = 'overlay on'; ov.id = 'dr-overlay';
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `<div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">⚡ Dépense rapide</div>
    <div class="b-money-row">
      <input class="form-input" id="drMontant" type="number" step="0.01" inputmode="decimal" placeholder="Montant" autocomplete="off" aria-label="Montant">
      <div class="b-cur" role="group" aria-label="Devise">
        <button type="button" class="b-cur-btn" id="drCny" onclick="drDevise('CNY')">¥</button>
        <button type="button" class="b-cur-btn" id="drEur" onclick="drDevise('EUR')">€</button>
      </div>
    </div>
    <div class="b-cur-hint" id="drHint"></div>
    <div class="dr-lbl">Qui paie ?</div>
    <div class="dr-row">
      <button type="button" class="dr-chip dr-qui" data-k="les deux" onclick="drQui('les deux')">👥 Les deux</button>
      <button type="button" class="dr-chip dr-qui" data-k="matis" onclick="drQui('matis')">Matis</button>
      <button type="button" class="dr-chip dr-qui" data-k="lise" onclick="drQui('lise')">Lise</button>
    </div>
    <div class="dr-lbl">Touche la catégorie pour enregistrer</div>
    <div class="dr-grid">${DR_CATS.map(([val, ic, nom]) =>
      `<button type="button" class="dr-cat" data-cat="${val}" onclick="drEnregistrer(this.dataset.cat)"><span>${ic}</span>${nom}</button>`).join('')}</div>
    <input class="form-input" id="drNote" placeholder="Note (facultatif)" maxlength="80" autocomplete="off" style="margin-top:12px;">
    <button type="button" class="dr-lien" onclick="drEl('dr-overlay')?.remove();openBudgetSheetComplet()">Formulaire complet →</button>
    <button class="btn-cancel" onclick="drEl('dr-overlay')?.remove()">Annuler</button>
    <div style="height:4px;"></div>
  </div>`;
  document.body.appendChild(ov);
  drEl('drMontant').addEventListener('input', drMajApercu);
  const jour = jourLocalISO();
  drDevise(jour >= TAUX_AUTO_DEBUT && jour <= TAUX_AUTO_FIN ? 'CNY' : 'EUR');
  drQui(drQuiMemo());
  if (typeof majTauxAuto === 'function') majTauxAuto().then(drMajApercu).catch(() => {});   // taux frais, sans attendre
  setTimeout(() => drEl('drMontant')?.focus(), 120);
}

async function drEnregistrer(cat) {
  if (DR.envoi) return;
  const v = drMontant();
  if (!v) {
    showToast('Tape d\'abord le montant');
    const m = drEl('drMontant'); if (m) { m.focus(); m.classList.add('dr-err'); setTimeout(() => m.classList.remove('dr-err'), 600); }
    return;
  }
  if (!DR_CATS.some(c => c[0] === cat)) return;
  DR.envoi = true;                                   // un double tap ne doit pas compter deux fois
  document.querySelectorAll('#dr-overlay .dr-cat').forEach(b => { b.disabled = true; });
  const note = (drEl('drNote')?.value || '').trim().slice(0, 80);
  const euros = drEnEuros(v);
  let erreur = null;
  try {
    ({ error: erreur } = await sb.from('budget').insert({ categorie: cat, description: note, total: euros, source: 'manuel', personne: DR.qui }));
  } catch (e) { erreur = e; }
  if (erreur) {
    DR.envoi = false;
    document.querySelectorAll('#dr-overlay .dr-cat').forEach(b => { b.disabled = false; });
    showToast('❌ Pas enregistré : ' + (erreur.message || 'réseau'));   // la feuille reste ouverte : rien n'est perdu
    return;
  }
  try { localStorage.setItem('dr_qui', DR.qui); } catch (e) { /* ignoré */ }
  drEl('dr-overlay')?.remove();
  showToast(`✅ ${DR.devise === 'CNY' ? v + ' ¥ (' + fmtE(euros) + ')' : fmtE(euros)} · ${cat}`);
}

// Les trois boutons « ＋ Dépense » ouvrent la saisie rapide ; le formulaire complet garde son ancien nom.
const openBudgetSheetComplet = openBudgetSheet;
openBudgetSheet = ouvrirDepenseRapide;

document.head.insertAdjacentHTML('beforeend', `<style>
.dr-lbl{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt2);margin:14px 0 6px}
.dr-row{display:flex;gap:6px}
.dr-chip{flex:1;border:1.5px solid var(--border);background:var(--white);border-radius:12px;padding:10px 6px;font-family:var(--font);font-size:.8rem;font-weight:600;color:var(--txt);cursor:pointer}
.dr-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.dr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.dr-cat{display:flex;flex-direction:column;align-items:center;gap:3px;border:1.5px solid var(--border);background:var(--bg);border-radius:14px;padding:12px 4px;font-family:var(--font);font-size:.7rem;font-weight:600;color:var(--txt);cursor:pointer;min-height:64px}
.dr-cat span{font-size:1.35rem;line-height:1}
.dr-cat:active{background:var(--peach);border-color:var(--accent);transform:scale(.96)}
.dr-cat:disabled{opacity:.5}
.dr-lien{display:block;width:100%;background:none;border:none;color:var(--accent);font-family:var(--font);font-size:.78rem;font-weight:600;padding:12px 0 4px;cursor:pointer}
.dr-err{animation:shSecoue .38s;border-color:var(--red,#c0392b)!important}
</style>`);
