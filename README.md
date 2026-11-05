# Chine 2026 · Matis & Lise

PWA de voyage (`index.html` + `ia.js`), données dans Supabase, temps réel entre les deux téléphones.

## Ce qu'il y a dedans

- **🧭 Programme** (barre du bas, « Prog. ») : 4 vues, sur les jours choisis en haut (un jour, plusieurs, ou tout)
  - **Vital** : transports et trains avec l'heure, check-in des hôtels, activités réservées ou à heure fixée, nuit du jour, alertes (« à réserver », pas d'hôtel)
  - **Léger** : les grandes heures de la journée et, dans chaque trou libre, des idées proches de l'endroit où vous serez : 3 restos et 4 activités. Ordre des sources : la liste de l'app, puis le cerveau. *Plus d'idées avec Claude* complète avec internet. *＋ Caser* place l'idée dans le planning à l'heure du trou
  - **Escales** : les vols décident de l'endroit où vous êtes. Avant l'arrivée en Chine (escale à Helsinki, vol de nuit) et après le vol retour, aucune idée de Chine n'est proposée, juste un bloc « Escale à Helsinki de 10h45 à 16h40 ». Il faut que les vols aient une date, une heure de départ et d'arrivée, et un nom « Ville → Ville »
  - **Prix** : une activité, un resto ou un bar payant porte des billets : 1 pas cher (activité sous 10 €, resto sous 8 €), 2 moyen (10 à 35 €, resto 8 à 25 €), 3 cher, avec le prix en euros quand on le connaît. Il vient du champ prix du lieu, ou du texte du prix du cerveau (¥ converti à 1 € = 7,8 ¥). Gratuit ou inconnu : rien
  - **Trajets** : à pied sous ~600 m, sinon métro ou DiDi avec durée et prix estimés, le conseillé en premier. DiDi seul sans métro (Zhangjiajie, Furong) ou quand le métro est fermé (22h30 à 6h). Le visiteur voit le mode et la durée, jamais le prix. Tout se recalcule à partir des activités du planning : ajouter, déplacer ou retirer une activité change les trajets. Une navette d'hôtel s'ajoute d'elle-même sur les trajets qu'elle dessert (`NAVETTES`, `ia.js`). Tarifs dans `TARIFS_VILLES` (`ia.js`). Les gares et aéroports ont leur position dans les notes du transport (`DEP_LAT`, `DEP_LNG`, `ARR_LAT`, `ARR_LNG`)
  - **Feuille de route** : chaque créneau peut porter une étape (`planning_slots.etape`) : durée, moyen de transport, ce qu'on y fait, 2e restaurant, conseil, source. Le trajet saisi ne sert que si on vient bien de l'étape prévue, sinon il est recalculé. Sortie de l'hôtel à 9h sauf obligation. Les étapes logistiques sont des items de type `etape`, hors des onglets. Migration `20261105060000_feuille_de_route.sql`
  - **Détaillé** : minute par minute. Sortie de l'hôtel, trajet, arrivée, temps sur place, marges, être à la gare 1 h avant le train (2 h pour un avion), retour à l'hôtel
  - **Claude** : conversation dédiée qui n'adapte **que le programme** (créneaux, heures, jours, statut d'une activité). Il utilise votre position GPS et propose d'abord la liste, puis le cerveau, puis internet. Il ne touche ni au budget, ni aux hôtels, ni aux transports. La conversation reste sur chaque téléphone ; les changements de programme, eux, se synchronisent
- **🎁 Souhaits** (menu *Plus*) : la liste de ce que les proches veulent qu'on leur rapporte, en tickets. **Ouvert au mode visiteur** : c'est le seul endroit où il peut écrire. Une personne et un souhait obligatoires, une photo facultative (réduite à ~900 px, stockée dans la ligne). Matis et Lise cochent *trouvé* ; un visiteur ne peut supprimer que ses propres tickets. Un mini tuto, raconté par Roomy, s'affiche à la première visite. Table `souhaits` : lancer `supabase/migrations/20261105010000_souhaits.sql`
- **Roomy, l'IA, est réservée à Matis et Lise** : il faut le code de l'assistant, y compris dans la fonction. Les visiteurs n'ont ni chat, ni vue Claude, ni bouton Roomy. L'onglet Questions (visiteurs qui parlent à Roomy) est débranché : `questions.js` reste chargé mais ne crée plus rien, et la table `questions_visiteurs` existe toujours, fermée à la clé publique
- **🐱 Roomy** : la chatte mascotte (`mascotte/`). Elle est l'assistante IA : le chat, l'onglet Programme et la connexion lui donnent son visage, et `@roomy …` (ou `@ia …`) lui parle. Redéployer la fonction `assistant` pour qu'elle prenne son nom et connaisse la liste des souhaits
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
- `souhaits.js` : onglet Souhaits (tickets, tuto, photo) et composants de la mascotte Roomy
- `questions.js` : ancien onglet Questions, débranché
- `mascotte/` : les trois poses de Roomy (calme, explique, joie) et leurs têtes en avatar, en WebP transparent
- `ia.js` : moteur de planning (trajets, heures), Cerveau, assistant `@ia`, géocodage, correction Amap
- `prog.js` : les 4 vues du Programme et la conversation Claude
- `cerveau.json` : la partie voyage du cerveau, générée par le script
- `tools/export_cerveau.py` : cerveau SQLite vers `cerveau.json` et Supabase
- `supabase/migrations/…sql` : schéma complet
- `supabase/functions/assistant/index.ts` : backend de l'assistant (Claude + web search + outils d'écriture ; `mode: "programme"` pour l'onglet Programme, outils limités au planning)
- `sw.js` : cache hors-ligne (réseau d'abord, pour que les mises à jour arrivent)

Le cerveau complet n'est pas dans ce repo (voir `.gitignore`) : 2,7 Go, avec l'export TikTok.
