---
title: Palette de couleurs
description: Les clés de couleur de drawtonomy et leurs valeurs HEX.
---

drawtonomy utilise une palette de style Tailwind / Material : grey-100 (le plus clair) à grey-900 (le plus foncé), plus des couleurs nommées.

## Niveaux de gris

| Clé | HEX | Notes |
|---|---|---|
| `grey-100` | `#e6e6e6` | Le plus clair. Par défaut pour Véhicule (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Par défaut pour Piéton (Marchant et Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Gris moyen. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Le plus foncé. |

Plus le numéro est bas, plus c'est clair. Cela suit la convention de Tailwind.

## Valeurs par défaut des modèles

| Modèle | Couleur par défaut |
|---|---|
| Piéton (Marchant) | `grey-300` |
| Piéton (Simple) | `grey-300` |
| Véhicule (Simple) | `grey-100` |
| Autres formes | `black` |

## Définir la couleur par programme

Utilisez `resolveColor()` du SDK pour convertir une clé en valeur HEX. Voir l'[API du SDK d'extension](/fr/extend/extension-sdk/) pour plus de détails.
