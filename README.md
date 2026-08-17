# AéroConfort

Assistant d'aération : aide à décider quand ouvrir ou fermer les fenêtres d'un
logement pour le rafraîchir, en comparant la température/humidité intérieures
(saisies manuellement) à la météo extérieure (récupérée automatiquement).

PWA légère en HTML/CSS/JavaScript "vanilla" (aucun framework), installable sur
iPhone (Safari → Partager → Sur l'écran d'accueil) et Android (Chrome →
Installer l'application).

## Fonctionnalités

- Saisie de la température et de l'humidité intérieures.
- Météo extérieure automatique (température, humidité, vent, rafales,
  direction) via [Open-Meteo](https://open-meteo.com/) — gratuit, sans clé API,
  avec timeout réseau (12 s) pour éviter un blocage indéfini en cas de
  connexion instable (ex. itinérance).
- Géolocalisation automatique avec nom de ville affiché (géolocalisation
  inverse via [BigDataCloud](https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api),
  gratuit, sans clé API), et bouton "Changer de ville" toujours accessible
  pour rechercher une autre localité (autocomplétion Open-Meteo).
- Calculs : humidité absolue, point de rosée, humidex.
- Deux cibles de confort mémorisées, **été** (22°C par défaut) et **hiver**
  (20°C par défaut), modifiables sur l'écran de saisie. Elles déterminent
  automatiquement le contexte (été / hiver / intermédiaire) d'après la
  température **extérieure**, pas le calendrier, et donc le régime de
  recommandation (voir ci-dessous) — aucun réglage manuel de saison à faire.
- Décision 🟢 Ouvrir / 🟡 Attendre / 🔴 Fermer avec score, confiance et
  raisons expliquées ; ce calcul est identique toute l'année (l'humidité
  seule peut justifier d'ouvrir même par temps frais). Ce qui change selon le
  contexte, c'est la **durée conseillée** :
  - **Rafraîchir** : l'intérieur dépasse la cible retenue et l'extérieur est
    plus frais — durée de 5 à 45 min proportionnelle au score, avec (si "Ma
    pièce" est configurée) une estimation de la température atteinte.
  - **Aération courte** : cible déjà atteinte, ou température extérieure
    entre les deux cibles (il fait déjà bon dehors) — pas de température à
    chasser, juste le temps nécessaire pour renouveler l'air de la pièce
    (calculé à partir de "Ma pièce" si configurée, sinon estimation générique
    au vent).
- Si la décision n'est pas "Ouvrir" : estimation du prochain créneau favorable
  dans les 2-3 prochaines heures, à partir des prévisions météo.
- Deux onglets sur l'écran de résultat : "Renouvellement d'air" (décision,
  raisons, mode Expert) et "Rafraîchissement" (Ma pièce, Rafraîchissement
  nocturne — masqué et remplacé par un message contextuel quand le régime est
  "Aération courte", ce rafraîchissement n'ayant alors pas de sens).
- Chronomètre d'aération avec suivi en temps réel, calé sur la durée
  effectivement conseillée (régime "Rafraîchir" ou "Aération courte").
- Mode Expert : détail des calculs (humidités absolues, points de rosée,
  écarts, temps de renouvellement d'air estimé au vent seul, confiance).
- Profil "Ma pièce" (optionnel) : surface, hauteur de plafond, orientation de
  la/les fenêtre(s), courant d'air. Une fois renseigné, il affine le débit
  d'air réel (vent + orientation plutôt qu'une estimation générique) et
  alimente :
  - La durée et la température estimée de l'aération conseillée, quel que
    soit le régime.
  - **Rafraîchissement nocturne** (régime "Rafraîchir" uniquement) : détecte,
    sur les prévisions à venir, la fenêtre où l'extérieur reste durablement
    plus frais (typiquement la nuit), et indique quand ouvrir et quand fermer
    avant que l'extérieur ne redevienne plus chaud que la pièce.
  - **Calibrage réel** : à partir d'une mesure (température intérieure avant/
    après une période fenêtre ouverte), calcule un temps de refroidissement
    propre à la pièce (la météo extérieure réelle de la période est récupérée
    automatiquement) — remplace l'estimation générique dès qu'il est disponible.
  - **Export / Import** : sauvegarde ou restauration de "Ma pièce" (y compris
    le calibrage) au format JSON, pour ne pas tout ressaisir en cas de
    changement d'appareil.
  Le modèle physique reste volontairement simple (débit d'air par règle
  empirique de ventilation naturelle, refroidissement par décroissance
  exponentielle avec facteur d'inertie thermique) — indicatif, pas une
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
