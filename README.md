# Chine App V3

Version modulaire de l'app de voyage.

## Structure

- `index.html` : shell HTML principal
- `assets/css/base.css` : styles extraits du fichier source
- `assets/css/features.css` : dark mode, favoris, backup, hub d'outils, countdown
- `assets/js/app-core.js` : budget, planning, items, checklist, notes, phrases, logique cœur
- `assets/js/map.js` : carte, GPS, navigation vers un lieu
- `assets/js/chat.js` : chat, médias, snap, sondages, galerie, réactions
- `assets/js/analytics.js` : stats, score voyage, pratique Chine, rappels, login
- `assets/js/features.js` : features V2 réinjectées proprement sur la V3
- `manifest.webmanifest` : PWA minimale
- `sw.js` : cache offline simple

## Features reprises

- budget par personne + convertisseur
- planning jour par jour
- activités / restos / cafés / hôtels / transports
- checklist + packing
- notes
- phrasebook chinois
- chat collaboratif avec médias + sondage + assistant local
- stats + score voyage
- carte + GPS + navigation
- galerie
- mode terrain
- section pratique Chine
- thème clair / sombre / auto
- favoris
- export / import de backup local
- compte à rebours voyage

## Note

Le découpage est maintenant réel côté fichiers, mais la logique reste en global JS pour ne pas casser l'app rapidement. Le vrai next step propre serait un passage en modules ES (`import/export`) avec store central et composants isolés.
