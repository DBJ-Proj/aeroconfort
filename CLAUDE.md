# CLAUDE.md

Contexte pour une future session Claude Code reprenant ce projet.

## Projet

AéroConfort : PWA vanilla JS (pas de framework, pas de build step) qui
recommande d'ouvrir/fermer les fenêtres selon la météo. Voir
[README.md](README.md) pour la description fonctionnelle complète et
l'architecture des fichiers.

## Conventions

- Aucun framework, aucune dépendance npm, aucun build : les fichiers
  `js/*.js` sont chargés directement via `<script>` (pas de bundler). Garder
  cette approche pour toute évolution — c'est un choix délibéré (légèreté,
  hébergement trivial sur n'importe quel serveur statique).
- `js/psychrometrics.js` et `js/decision.js` exposent des fonctions pures
  (pas d'accès DOM) pour rester testables indépendamment de l'UI.
- Les constantes ajustables du moteur de décision (poids, seuils, bornes de
  durée) sont regroupées en tête de `js/decision.js` : à modifier là plutôt
  que d'éparpiller des valeurs magiques dans le code.
- Pas de clé API : la météo vient d'Open-Meteo (gratuit, sans authentification).
  Si une autre source météo est ajoutée un jour, prévoir la gestion de la
  clé (variable d'environnement / saisie utilisateur), aucune infra actuelle
  ne la supporte.
- Mode sombre V1 = uniquement `prefers-color-scheme` en CSS, pas de bascule
  manuelle ni de fichier séparé. Une bascule manuelle est prévue pour la V2
  (voir README → Roadmap), qui introduirait `css/dark.css`.

## Lancer / tester

```bash
python -m http.server 8080
```

Ouvrir `http://localhost:8080`. Le `fetch` météo et la géolocalisation
exigent HTTP(S), pas `file://`.

Pas de suite de tests automatisés pour l'instant (V1.0). Les fonctions de
`psychrometrics.js` et `decision.js` étant pures, elles se prêtent bien à des
tests unitaires si une suite est ajoutée plus tard.

## Roadmap

Voir la section Roadmap de [README.md](README.md) pour le périmètre prévu des
V2.0 et V3.0.
