---
title: Vue d'ensemble de @drawtonomy/sdk
description: Paquets, points d'entrée, et comment le SDK s'articule avec l'éditeur.
---

`@drawtonomy/sdk` est le paquet sur lequel s'appuient les auteurs d'extensions et les outils sans éditeur. Il expose :

| Module | Rôle |
|---|---|
| `ExtensionClient` | Client postMessage pour les extensions hébergées en iframe. |
| Fonctions de fabrique de formes | `createLane()`, `createVehicle()`, etc. |
| `createSnapshot()` | Construit un `DrawtonomySnapshot` à partir d'un tableau de formes. |
| `exporter.*` | Fonctions pures qui transforment un instantané en OpenDRIVE / OpenSCENARIO / archive zip esmini / Lanelet2 OSM. Inclut un parseur Lanelet2. |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Installation

```bash
pnpm add @drawtonomy/sdk
```

## Paquets compagnons

| Paquet | Rôle |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Le SDK lui-même. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Serveur de développement local qui héberge l'éditeur pour le développement d'extensions. |

## Code source

Le code source du SDK, ses tests et ses exemples se trouvent dans le [dépôt GitHub drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Voir aussi

- [API du SDK d'extension](/fr/extend/extension-sdk/) — construire des extensions iframe.
- [API du SDK Exporteur](/fr/extend/exporter-sdk/) — ajouter de nouveaux formats cibles.
