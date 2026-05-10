---
title: Importer une OccupancyGrid ROS (.pgm + .yaml)
description: Chargez une grille d'occupation map_server ROS (.pgm + .yaml) — produite avec nav2, Cartographer ou Gmapping — dans drawtonomy comme couche d'arrière-plan, puis esquissez trajectoires, voies et obstacles par-dessus.
keywords:
  - annotation grille d'occupation ROS
  - éditeur cartes nav2
  - visionneuse cartes Cartographer
  - dessiner sur carte pgm
  - outil annotation cartes SLAM
  - éditeur OccupancyGrid navigateur
---

drawtonomy comprend le format ROS `map_server` utilisé par [nav2](https://navigation.ros.org/), Cartographer, Gmapping et autres outils SLAM similaires.

![Une grille d'occupation ROS importée dans drawtonomy avec des flèches et des étagères dessinées par-dessus](/img/ros-occupancy-grid.png)

La capture d'écran montre une vraie grille d'occupation d'entrepôt (cellules occupées en noir, libres en blanc) avec des trajectoires et des obstacles dessinés directement par-dessus dans drawtonomy.

## Importer

1. Ouvrez le menu **Fichier** → **Importer**.
2. Sélectionnez **à la fois** le fichier `.pgm` et le fichier `.yaml` correspondant dans la boîte de dialogue.
3. drawtonomy lit les métadonnées YAML (résolution, seuils) et affiche la grille sur le canevas.

Si vous ne sélectionnez que le `.pgm` sans `.yaml`, drawtonomy utilise les valeurs par défaut (`resolution = 0.05 m/px`, seuils d'occupation standards).

## Coloration des cellules

| Cellule | Couleur |
|---|---|
| Occupée | Noir |
| Libre | Blanc |
| Inconnue | Gris |

Les cellules s'affichent à une échelle qui correspond aux dimensions des voies de drawtonomy ; vous pouvez ainsi dessiner voies, trajectoires et formes directement par-dessus — exactement comme dans la capture ci-dessus.

## Outils testés

drawtonomy a été utilisé avec des cartes produites par nav2, Cartographer et Gmapping. D'autres producteurs devraient fonctionner tant qu'ils émettent la paire `.pgm` + `.yaml` standard de `map_server`.

## Voir aussi

- [Importer un fichier Lanelet2 (.osm)](/fr/guides/import-lanelet2/)
