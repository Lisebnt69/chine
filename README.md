# Chine 2026 · Matis & Lise

PWA de voyage (un seul `index.html` + `ia.js`), données dans Supabase, temps réel entre les deux téléphones.

## Ce qu'il y a dedans

- **🧭 Programme** (barre du bas, « Prog. ») : 4 vues
  - **Aujourd'hui** : feuille de route du jour avec les heures, plus une carte « prochaine étape » (bouton *Y aller* qui ouvre Amap, et l'adresse en chinois à copier)
  - **Vital** : hôtels et transports dans l'ordre chronologique, nuits, coût, alerte quand un jour n'a pas d'hôtel
  - **Activités** : idées pas encore planifiées et reels du cerveau pas encore ajoutés, à filtrer par ville et par moment (matin / aprem / soir). Le bouton *＋ Caser* les place dans un jour
  - **Planning** : planning optimisé jour par jour. On part de l'hôtel, on enchaîne les lieux les plus proches et on estime les trajets. Les heures que vous avez fixées (📌) sont respectées. *💾 Fixer les heures* enregistre le planning, *🗺️* trace le trajet du jour sur la carte
- **🧠 Cerveau** (menu *Plus*) : les reels Insta / TikTok transcrits, avec recherche et import JSON/CSV. *＋ Idée* transforme un reel en activité dans l'app, placée sur la carte
- **🤖 Assistant IA** dans le chat : écris `@ia …`. Il lit le cerveau, l'état du voyage et cherche sur le web. Il **modifie l'app lui-même** : planning, lieux, dépenses, carte. La réponse arrive dans le chat pour vous deux
- **🗺️ Carte** : les adresses manquantes sont géocodées automatiquement à l'ouverture (bouton 📍 pour relancer), les reels du cerveau apparaissent en 🧠
- L'existant : budget, checklist, notes, phrasebook, galerie, stats, mode terrain…

## Mise en route (≈ 15 min, une seule fois)

### 1. Base de données
Supabase → **SQL Editor** → colle et lance `supabase/migrations/20261104000000_cerveau_assistant.sql`.
Ça crée la table `cerveau`, la recherche plein texte, ajoute `heure` aux créneaux et active le temps réel. Le script peut être relancé sans risque.

> ⚠️ Si le projet Supabase est en pause (plan gratuit, inactif 7 jours), il faut d'abord le relancer depuis le dashboard.

### 2. Assistant IA (Edge Function)
```bash
npm i -g supabase
supabase login
supabase secrets set --project-ref nwskpowizbggdqghnhcw ANTHROPIC_API_KEY=sk-ant-... APP_SECRET=un-code-a-vous
supabase functions deploy assistant --project-ref nwskpowizbggdqghnhcw --no-verify-jwt
```
- `ANTHROPIC_API_KEY` : à créer sur console.anthropic.com (facturé à l'usage)
- `APP_SECRET` : un code que vous inventez. L'app le demande au premier `@ia` et le garde sur le téléphone. Sans lui, n'importe qui qui trouve l'URL pourrait consommer vos crédits
- `--no-verify-jwt` est nécessaire parce que l'app utilise une clé `sb_publishable_…`, qui n'est pas un JWT

### 3. Brancher le cerveau
Exporte tes reels transcrits en **JSON** (ou CSV avec les mêmes colonnes), puis importe-les : onglet 🧠 Cerveau → *Importer*. Tu peux aussi les insérer directement dans la table `cerveau` depuis ton pipeline de transcription. Un reel déjà présent (même `url`) est mis à jour, pas dupliqué.

```json
[
  {
    "url": "https://www.tiktok.com/@compte/video/123",
    "source": "tiktok",
    "auteur": "@compte",
    "titre": "Hot pot caché dans une ruelle",
    "transcription": "texte complet de la vidéo…",
    "resume": "Hot pot local, pas cher, file d'attente le soir",
    "categorie": "restaurant",
    "ville": "Chongqing",
    "lieu_nom": "Pei Jie Lao Huo Guo",
    "adresse": "…",
    "adresse_cn": "重庆市渝中区…",
    "prix_estime": 15,
    "duree": "1h",
    "meilleur_moment": "Soir",
    "tags": ["hotpot", "local"]
  }
]
```
Seuls `url` ou `titre` / `lieu_nom` sont obligatoires. Plus tu donnes d'infos, plus l'IA est pertinente. Mets **`adresse_cn`** dès que possible : OpenStreetMap trouve mal les lieux chinois à partir d'un nom en français.

## Exemples à dire à l'IA
- `@ia qu'est-ce qu'on fait cet aprem à Chengdu ? pioche dans le cerveau`
- `@ia optimise demain et fixe les heures`
- `@ia décale le hot pot à jeudi 20h`
- `@ia ajoute 38€ de resto payé par Matis`
- `@ia ajoute le Bar Rouge du reel et mets-le samedi soir`

## Fichiers
- `index.html` : l'app (HTML/CSS/JS)
- `ia.js` : Programme, Cerveau, assistant, géocodage auto
- `supabase/migrations/…sql` : schéma cerveau et ajouts
- `supabase/functions/assistant/index.ts` : backend de l'assistant (Claude + web search + outils d'écriture)
- `sw.js` : cache hors-ligne (réseau d'abord, pour que les mises à jour arrivent)
