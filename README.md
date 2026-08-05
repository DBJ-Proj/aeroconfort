# AéroConfort

Assistant d'aération : aide à décider quand ouvrir ou fermer les fenêtres d'un
logement pour le rafraîchir, en comparant la température/humidité intérieures
(saisies manuellement) à la météo extérieure (récupérée automatiquement).

PWA légère en HTML/CSS/JavaScript "vanilla" (aucun framework), installable sur
iPhone (Safari → Partager → Sur l'écran d'accueil) et Android (Chrome →
Installer l'application).

## Fonctionnalités (V1.0)

- Saisie de la température et de l'humidité intérieures.
- Météo extérieure automatique (température, humidité, vent, rafales,
  direction) via [Open-Meteo](https://open-meteo.com/) — gratuit, sans clé API.
- Géolocalisation automatique, avec recherche de ville en secours.
- Calculs : humidité absolue, point de rosée, humidex.
- Décision 🟢 Ouvrir / 🟡 Attendre / 🔴 Fermer avec score, durée idéale et
  raisons expliquées.
- Si la décision n'est pas "Ouvrir" : estimation du prochain créneau favorable
  dans les 2-3 prochaines heures, à partir des prévisions météo.
- Chronomètre d'aération avec suivi en temps réel.
- Mode Expert : détail des calculs (humidités absolues, points de rosée,
  écarts, temps de renouvellement d'air estimé, confiance).
- Mode sombre automatique (suit les préférences système).
- Installable en PWA (manifest + service worker).

## Lancer en local

Un serveur HTTP est nécessaire (la géolocalisation et les appels réseau ne
fonctionnent pas en ouvrant `index.html` directement, protocole `file://`).

```bash
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080` dans le navigateur.

## Architecture

```
index.html
css/style.css          interface, mobile-first, mode sombre auto
js/app.js               orchestration des écrans et des événements
js/weather.js           géolocalisation + appel API météo Open-Meteo
js/psychrometrics.js    calculs physiques (humidité absolue, point de rosée, humidex)
js/decision.js          moteur de décision (score, durée, raisons)
js/timer.js             chronomètre d'aération
js/storage.js           persistance locale (position, dernière saisie)
manifest.webmanifest    métadonnées PWA
service-worker.js       cache de l'app shell pour l'installation PWA
icons/                  icônes de l'application
```

Voir [CLAUDE.md](CLAUDE.md) pour les détails d'implémentation et les
conventions à respecter en cas d'évolution.

## Roadmap

- **V2.0** : historique des ouvertures, graphiques (`js/charts.js`), mode
  sombre avec bascule manuelle (`css/dark.css`), plusieurs logements
  enregistrables.
- **V3.0** : fonctionnement hors ligne (sauf météo), saisie météo manuelle en
  secours, notifications de fermeture.

## Crédits

Données météo : [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
