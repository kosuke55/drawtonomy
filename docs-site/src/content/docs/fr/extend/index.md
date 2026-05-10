---
title: Étendre drawtonomy
description: Construire des extensions, ajouter des formats cibles, contribuer des modèles.
sidebar:
  order: 0
---

drawtonomy est conçu pour être étendu. Le même SDK qui anime les extensions intégrées (Générateur de scènes par IA, Aperçu de modèle, Bac à sable d'export) est celui que vous utilisez.

## Choisissez votre point d'extension

| Vous voulez… | Lire |
|---|---|
| Ajouter un panneau, un générateur ou un outil qui s'exécute aux côtés de l'éditeur | [SDK d'extension](/fr/extend/extension-sdk/) |
| Ajouter une nouvelle cible d'export (CARLA, Unity, SUMO, …) | [SDK Exporteur](/fr/extend/exporter-sdk/) |
| Contribuer un nouveau modèle SVG (véhicule, piéton, panneau) | [Modèles](/fr/extend/templates/) |

## Où se trouve le code source

Tout est dans le [dépôt GitHub drawtonomy](https://github.com/kosuke55/drawtonomy) public :

- `packages/drawtonomy-sdk/` — le SDK
- `packages/drawtonomy-dev-server/` — éditeur local pour le développement
- `extensions/` — extensions intégrées, utiles comme références
- `templates/` — modèles de formes intégrés

Les PR sont les bienvenues. Le [Guide des modèles](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md) déroule l'ajout d'une forme personnalisée de bout en bout.
