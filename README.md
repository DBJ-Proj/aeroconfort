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
- Géolocalisation automatique avec nom de ville affiché (géolocalisation
  inverse via [BigDataCloud](https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api),
  gratuit, sans clé API), et bouton "Changer de ville" toujours accessible
  pour rechercher une autre localité (autocomplétion Open-Meteo).
- Calculs : humidité absolue, point de rosée, humidex.
- Décision 🟢 Ouvrir / 🟡 Attendre / 🔴 Fermer avec score, durée idéale et
  raisons expliquées.
- Si la décision n'est pas "Ouvrir" : estimation du prochain créneau favorable
  dans les 2-3 prochaines heures, à partir des prévisions météo.
- Chronomètre d'aération avec suivi en temps réel.
- Mode Expert : détail des calculs (humidités absolues, points de rosée,
  écarts, temps de renouvellement d'air estimé, confiance).
- Profil "Ma pièce" (mode Expert, optionnel) : surface, hauteur de plafond,
  orientation de la/les fenêtre(s), courant d'air. Une fois renseigné, il
  affine le temps de renouvellement d'air (débit réel selon le vent et
  l'orientation plutôt qu'une estimation générique) et débloque deux
  informations sur l'écran principal :
  - **Baisse estimée** : température atteignable en ouvrant pour la durée
    idéale actuelle.
  - **Rafraîchissement nocturne** : détecte, sur les prévisions à venir,
    la fenêtre où l'extérieur reste durablement plus frais (typiquement la
    nuit), et indique quand ouvrir et quand fermer avant que l'extérieur ne
    redevienne plus chaud que la pièce.
  Ces estimations utilisent un modèle physique simplifié (débit d'air par
  règle empirique de ventilation naturelle, refroidissement par décroissance
  exponentielle, sans inertie thermique des murs) — indicatif, pas une
  simulation d'ingénierie.
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
Géolocalisation inverse (nom de ville) : [BigDataCloud](https://www.bigdatacloud.com/).
