# Chine 2026 · Matis & Lise

PWA de voyage (`index.html` + `ia.js`), données dans Supabase, temps réel entre les deux téléphones.

## Ce qu'il y a dedans

- **🧭 Programme** (barre du bas, « Prog. ») : 4 vues
  - **Aujourd'hui** : feuille de route du jour avec les heures, plus une carte « prochaine étape » (bouton *Y aller* qui ouvre Amap, et l'adresse en chinois à copier)
  - **Vital** : hôtels et transports dans l'ordre chronologique, nuits, coût, alerte quand un jour n'a pas d'hôtel
  - **Activités** : idées pas encore planifiées et points du cerveau pas encore ajoutés, à filtrer par ville et par moment. Le bouton *＋ Caser* les place dans un jour
  - **Planning** : planning optimisé jour par jour. On part de l'hôtel, on enchaîne les lieux les plus proches et on estime les trajets. Les heures que vous avez fixées (📌) sont respectées. *💾 Fixer les heures* enregistre le planning, *🗺️* trace le trajet du jour sur la carte
- **🧠 Cerveau** (menu *Plus*) : les points tirés des reels Insta / TikTok, à filtrer par ville et par type. *＋ Idée* ajoute un lieu à l'app. Un lieu sans position a un bouton *🔎 Amap*
- **🤖 Assistant IA** dans le chat : écris `@ia …`. Il lit le cerveau, l'état du voyage et cherche sur le web. Il **modifie l'app lui-même** : planning, lieux, dépenses, carte. La réponse arrive dans le chat pour vous deux
- **🗺️ Carte Amap** : labels en anglais par défaut, le bouton 🗺️ passe en chinois (pour montrer au chauffeur), en satellite ou sur OSM
- L'existant : budget, checklist, notes, phrasebook, galerie, stats, mode terrain…

## Mise en route

### 1. Base de données
Créer un projet Supabase, puis Supabase → **SQL Editor** → coller et lancer `supabase/migrations/20261105000000_schema_complet.sql`.

Le script crée tout ce dont l'app a besoin (tables, temps réel, les 14 jours, les deux connexions). Il marche aussi sur un projet restauré sans toucher aux données, et peut être relancé sans risque.

Mettre ensuite `SB_URL` et `SB_KEY` du nouveau projet dans `index.html`.

> **Pause du plan gratuit :** un projet inactif est mis en pause, et il n'est restaurable depuis le dashboard que pendant 90 jours. Après, il reste le téléchargement de la sauvegarde, à recharger dans un nouveau projet.

### 2. Charger le cerveau
```bash
python tools/export_cerveau.py --no-geocode --push
```
Le script lit `cerveau.db` sans jamais y écrire. Il prend la partie Voyage/Chine et écrit `cerveau.json`, servi avec l'app : le cerveau reste consultable même si la base ne répond pas. `--push` envoie aussi le tout dans la table `cerveau`, avec les transcriptions, pour que l'IA puisse les lire. Les transcriptions ne vont jamais dans `cerveau.json`, qui est public.

Après une nouvelle session de récolte, relancer sans `--no-geocode`. Les réponses d'OSM sont gardées dans `tools/geocache.json`, seuls les nouveaux lieux sont cherchés.

### 3. Assistant IA (Edge Function)
```bash
npx supabase login
npx supabase secrets set --project-ref <ref> ANTHROPIC_API_KEY=sk-ant-... APP_SECRET=un-code-a-vous
npx supabase functions deploy assistant --project-ref <ref> --no-verify-jwt
```
- `ANTHROPIC_API_KEY` : à créer sur console.anthropic.com (facturé à l'usage)
- `APP_SECRET` : un code que vous inventez. L'app le demande au premier `@ia` et le garde sur le téléphone. Sans lui, n'importe qui qui trouve l'URL pourrait consommer vos crédits
- `--no-verify-jwt` est nécessaire parce que l'app utilise une clé `sb_publishable_…`, qui n'est pas un JWT

### 4. Publier
GitHub Pages sert la branche `main` : l'app ne change sur les téléphones qu'une fois le travail mergé dedans.

## Carte et positions

- **Tout est stocké en WGS-84** (GPS, OSM). Amap travaille en GCJ-02, décalé de plusieurs centaines de mètres : `ia.js` décale le calque de tuiles et convertit les liens de navigation. Ne pas convertir les pins : ils tomberaient deux fois à côté.
- **Les tuiles Amap** ne demandent pas de clé, mais ce n'est pas une API officielle. Si elles s'arrêtent, le bouton 🗺️ passe sur OSM.
- **Placer les lieux automatiquement** passe par OSM, parce que l'API de recherche Amap demande une clé. OSM connaît mal les petits lieux chinois : ceux-là n'ont pas de pin, et le bouton *🔎 Amap* les retrouve.
- **Chaque pin est vérifié** à l'export : dans la bonne ville, nom qui correspond, pas la ville entière. Les chaînes (Manner, Hey Tea…) n'ont volontairement pas de pin : Amap trouve la boutique la plus proche. `geo` indique la précision (`adresse`, `nom`, `rue`, `quartier`).

## Exemples à dire à l'IA
- `@ia qu'est-ce qu'on fait cet aprem à Chengdu ? pioche dans le cerveau`
- `@ia optimise demain et fixe les heures`
- `@ia décale le hot pot à jeudi 20h`
- `@ia ajoute 38€ de resto payé par Matis`
- `@ia ajoute le Bar Rouge du reel et mets-le samedi soir`

## Fichiers
- `index.html` : l'app (HTML/CSS/JS)
- `ia.js` : Programme, Cerveau, assistant, géocodage, correction Amap
- `cerveau.json` : la partie voyage du cerveau, générée par le script
- `tools/export_cerveau.py` : cerveau SQLite vers `cerveau.json` et Supabase
- `supabase/migrations/…sql` : schéma complet
- `supabase/functions/assistant/index.ts` : backend de l'assistant (Claude + web search + outils d'écriture)
- `sw.js` : cache hors-ligne (réseau d'abord, pour que les mises à jour arrivent)

Le cerveau complet n'est pas dans ce repo (voir `.gitignore`) : 2,7 Go, avec l'export TikTok.
