---
title: Architecture de l'exporteur
description: Comment un canevas devient un instantané, et un instantané devient un fichier.
---

L'exporteur est le pont entre les données dans l'éditeur de drawtonomy et les formats externes — OpenDRIVE, OpenSCENARIO, Lanelet2, ou tout autre que vous brancherez ensuite. Comprendre le pipeline est le préalable à l'ajout d'un nouveau format cible.

## Le pipeline

```
État de l'éditeur ──► DrawtonomySnapshot ──► Exporteur ──► Fichier / blob
                       (sérialisable)         (pur)
```

### 1. `DrawtonomySnapshot`

Un instantané est un objet brut : une liste de formes, plus une marque de version et un horodatage. Il est sérialisable, ne contient aucune référence DOM et constitue la seule entrée que prend l'exporteur.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Vous construisez un instantané avec `createSnapshot(shapes)`, ou en parsant un `drawtonomy.svg` enregistré avec `parseDrawtonomySvg(svg)`.

### 2. Les modules d'export

Chaque format cible est une fonction pure distincte :

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (XML OSM)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Elles prennent un instantané, retournent une chaîne ou un blob. Pas d'accès à l'éditeur, pas de DOM, pas de dépendance asynchrone. Même entrée, même sortie.

### 3. Aller-retour

Pour Lanelet2, le SDK fournit également un parseur :

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

C'est ce qui anime le flux d'[import Lanelet2](/fr/guides/import-lanelet2/).

## Pourquoi des fonctions pures

L'exporteur exécute le même code dans le navigateur, dans un script Node CI, dans un pipeline côté serveur ou dans une extension de navigateur. Les tests s'exécutent contre des fixtures d'instantanés sans navigateur sans interface graphique.

C'est pourquoi l'exporteur réside dans `@drawtonomy/sdk` et non à l'intérieur de l'éditeur — l'éditeur dépend du SDK, et non l'inverse.

## Ajouter un format cible

L'exporteur est le principal point d'extension pour de nouveaux formats cibles — CARLA, Unity, SUMO, DSL personnalisés. La recette :

1. Ajoutez un nouveau module sous `packages/drawtonomy-sdk/src/exporter/`.
2. Prenez `DrawtonomySnapshot` en entrée, retournez une chaîne ou un blob.
3. Ajoutez des tests sous `packages/drawtonomy-sdk/__tests__/exporter/` à l'aide de fixtures d'instantanés.
4. Câblez un point d'entrée d'interface si vous voulez que le menu Export de l'éditeur en ait connaissance (optionnel — beaucoup d'utilisateurs l'appelleront par programme).

Le guide développeur complet est dans le dépôt public : [Guide développeur de l'exporteur](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Voir aussi

- [Exporter vers OpenDRIVE / OpenSCENARIO / esmini](/fr/guides/export-asam/) — le flux côté utilisateur.
- [Vue d'ensemble de `@drawtonomy/sdk`](/fr/reference/sdk/)
- [API du SDK Exporteur](/fr/extend/exporter-sdk/)
