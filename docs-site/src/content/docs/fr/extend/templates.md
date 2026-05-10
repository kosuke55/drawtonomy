---
title: Contribuer des modèles
description: Ajouter un nouveau modèle de véhicule, piéton, panneau ou marquage au sol.
---

Les modèles sont des fichiers SVG accompagnés d'une entrée de manifeste. Une fois contribués, ils apparaissent dans les menus Participants et formes de l'éditeur, à côté des modèles intégrés.

Le flux de contribution est dans le dépôt public :

➡ **[Guide des modèles](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Catégories

| Dossier | Exemples |
|---|---|
| `templates/vehicle/` | Berline, Bus, Camion, Moto |
| `templates/pedestrian/` | Marchant, Simple |
| `templates/road_marking/` | Passage piéton, marquages fléchés |
| `templates/sign/` | Stop, cédez le passage, têtes de signaux |
| `templates/other/` | Tout le reste |

## Procédure

1. Ajoutez votre SVG dans le dossier de la bonne catégorie.
2. Enregistrez-le dans `templates/manifest.json`.
3. Ouvrez une PR. Joignez une capture d'écran du modèle placé sur le canevas.

## Ce qui fait un bon modèle

- Dessiné à une taille par défaut sensée (véhicules autour de 4 à 5 m pour une berline).
- Une seule zone à couleur modifiable marquée par un remplissage connu, afin que le sélecteur de couleur du panneau d'attributs puisse la recolorer.
- Pas de référence à des polices externes — le texte est converti en chemins s'il est présent.
- Taille de fichier raisonnable (sous environ 30 Ko pour un modèle de la taille d'un véhicule).
