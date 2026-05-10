---
title: Pourquoi drawtonomy — un tableau blanc conçu pour les scénarios de conduite
description: Pourquoi drawtonomy existe et les choix de conception qui en découlent. Conçu spécifiquement pour les scénarios de conduite — les figures qui figurent dans les articles, présentations, revues de conception et rédactions de scénarios de conduite autonome.
keywords:
  - pourquoi drawtonomy
  - tableau blanc scénarios de conduite
  - outil diagramme conduite autonome
  - outil figures recherche véhicule autonome
  - logiciel illustration conduite autonome
  - alternative outils présentation diagrammes routiers
  - tableau blanc équipes conduite autonome
  - conception drawtonomy
---

drawtonomy est un tableau blanc conçu spécifiquement pour les scénarios de conduite. La plupart des équipes esquissent ces diagrammes aujourd'hui dans des outils de dessin génériques ou des logiciels de présentation — qui fonctionnent bien pour des formes générales, mais qui ne savent pas ce qu'est une voie. Il faut donc redessiner la géométrie chaque fois que la route tourne, qu'une intersection prend une nouvelle branche, ou qu'un passage piéton doit s'aligner avec la route.

Cette page explique les choix de conception qui découlent du fait de placer en tête « tableau blanc pour scénarios de conduite » plutôt que « outil qui exporte vers un simulateur ».

## Le problème autour duquel il est construit

L'essentiel de la communication réelle en conduite autonome se fait par des diagrammes : dans les articles, revues de conception, réunions de planification, comptes rendus d'incident, salles de classe et présentations. Le diagramme est l'artefact que les gens regardent, sur lequel ils débattent et dont ils se souviennent.

À ce niveau, les outils de dessin génériques ne donnent que des formes génériques. Une voie est un rectangle qu'il faut redessiner à chaque virage ; un passage piéton est une pile de rectangles qu'il faut sans cesse réaligner à la main ; une intersection prend une demi-heure à bricoler. Pire, dès que la géométrie de la route change — et en conduite autonome, elle change constamment — vous recommencez tout.

drawtonomy existe pour rendre cette boucle rapide. Les briques que le domaine possède réellement — voies, intersections, passages piétons, feux tricolores, marquages au sol, véhicules, piétons — sont des formes de première classe ; la figure reste donc correcte à mesure que vous itérez.

## Où se situe drawtonomy

Le travail sur les scénarios de conduite se déroule à plusieurs niveaux :

1. **Diagrammes.** Articles, présentations, esquisses de tableau, figures de documents de conception, supports pédagogiques. Rapide et facile en principe, mais dans un outil générique, la géométrie de la route doit être reconstruite à chaque déplacement.
2. **Outils de rédaction.** Éditeurs OpenSCENARIO, éditeurs de réseaux routiers, paquets de type CAO. Précis, lents, longs à apprendre.
3. **Simulateurs.** esmini, CARLA, outils maison. Exécutent le scénario, produisent des données.

drawtonomy se situe au niveau 1 et empiète sur le niveau 2 quand il faut : importer une carte Lanelet2, esquisser des modifications, exporter OpenDRIVE/OpenSCENARIO, transmettre le résultat à esmini.

## Priorités de conception

### Avant tout un tableau blanc

Le point de comparaison est une esquisse rapide sur tableau ou diapositive, pas un outil de CAO. Cela fixe le seuil de friction : ouvrir une URL, dessiner, partager. Pas d'installation, pas de compte, pas de format de fichier projet. Tout ce qui rendrait drawtonomy plus lourd qu'une esquisse rapide est écarté.

### Conscient de la topologie

Une route n'est pas un sac de polylignes. drawtonomy modélise les connexions de voies (Suivante / Précédente / Gauche / Droite) afin que le déplacement d'un bord mette à jour automatiquement les voies voisines. Deux voies qui partagent un bord partagent les mêmes points de bord — un seul glissement, les deux suivent. Voir [Modèle de connexions de voies](/fr/explanation/lane-model/).

### Modèles du domaine de la conduite

Véhicules (berline, bus, camion, moto…), piétons (marchant, simple), feux tricolores pour véhicules et piétons, passages piétons, marquages au sol, panneaux, modèles d'intersection. Ce sont des formes intégrées, pas des approximations à base de rectangles génériques. Des modèles SVG personnalisés peuvent être ajoutés par PR.

### Modifiables aussi en sortie qu'en entrée

Chaque format de sortie produit par drawtonomy préserve assez d'état pour être réédité. `drawtonomy.svg` est la forme canonique sans perte : un SVG standard qui s'affiche partout (navigateurs, GitHub, présentations, figures d'articles) et se rouvre dans drawtonomy avec chaque connexion et chaque relation de superposition intactes. Rien n'est piégé dans un format que vous ne pouvez pas relire.

### Sans interface graphique quand nécessaire

Le code de l'exporteur et du parseur fait partie de `@drawtonomy/sdk` et fonctionne sans l'éditeur. Pipelines CI, extensions de navigateur et outils d'IA peuvent générer et valider des scènes par programmation.

## Passerelles vers le reste du flux de travail

Une fois que vous avez un diagramme, vous voulez généralement en faire quelque chose. drawtonomy fournit plusieurs passerelles pour que la figure ne reste pas enfermée dans l'éditeur :

- **`drawtonomy.svg`** — par défaut. Intégrez-le dans des articles, présentations, documents Markdown ; rouvrez-le plus tard pour continuer l'édition.
- **Aller-retour Lanelet2** — ouvrez une carte Lanelet2 OSM (y compris des cartes d'exemple Autoware), éditez, exportez. Utile pour esquisser des modifications sur une carte HD existante.
- **Export ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, optionnellement regroupés en archive zip prête pour [esmini](https://github.com/esmini/esmini).
- **Générateur de scènes par IA** — décrivez un scénario en langage naturel, ou collez du XML OpenSCENARIO, et obtenez un canevas modifiable comme point de départ pour l'affinage.

Ces passerelles sont utiles, mais c'est le diagramme lui-même qui est la raison d'être de drawtonomy. Une figure dans drawtonomy a déjà une valeur en tant que figure ; ces formats lui permettent de circuler vers l'étape suivante du flux de travail quand c'est nécessaire.

## Ce que drawtonomy n'est pas

- **Pas un simulateur.** Il n'exécute pas les scénarios. Exportez vers esmini, CARLA ou votre propre outil pour cela.
- **Pas un outil de CAO.** Il n'impose pas de précision d'ingénierie (splines clothoïdes, dévers, élévation). La géométrie reste un 2D simple.
- **Pas une suite de collaboration en temps réel.** C'est un éditeur mono-utilisateur. Enregistrez, partagez, rouvrez.

## Voir aussi

- [Modèle de connexions de voies](/fr/explanation/lane-model/)
- [Architecture de l'exporteur](/fr/explanation/exporter-architecture/)
- [Architecture des extensions](/fr/explanation/extension-architecture/)
