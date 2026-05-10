---
title: SDK Exporteur
description: Ajouter un nouveau format cible — CARLA, Unity, SUMO ou autre.
---

L'exporteur est un ensemble de fonctions pures sur `DrawtonomySnapshot`. Ajouter un nouveau format cible est autonome : un nouveau module, quelques tests, et un crochet d'interface optionnel.

Cette page est une orientation rapide. Le guide complet — architecture, API, schémas de tests, vérifications visuelles esmini — est dans le dépôt public :

➡ **[Guide développeur de l'exporteur](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Démarrage rapide

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # mode surveillance
```

## Nouvel exporteur minimal

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Parcourir les formes, émettre votre format.
  return ''
}
```

```ts
// packages/drawtonomy-sdk/__tests__/exporter/my-format.test.ts
import { describe, it, expect } from 'vitest'
import { exportToMyFormat } from '../../src/exporter/my-format'
import { createSnapshot, createLane } from '../../src/index'

describe('my-format exporter', () => {
  it('emits expected payload for a single lane', () => {
    const snapshot = createSnapshot([createLane(/* ... */)])
    expect(exportToMyFormat(snapshot)).toContain('<expected/>')
  })
})
```

## Utiliser une vraie scène comme fixture

Les fichiers `drawtonomy.svg` font l'aller-retour à travers le SDK ; vous pouvez donc créer une scène dans l'éditeur et l'utiliser comme entrée de test de régression :

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Voir aussi

- [Architecture de l'exporteur](/fr/explanation/exporter-architecture/) — le pipeline et pourquoi il est pur.
- [Vue d'ensemble de `@drawtonomy/sdk`](/fr/reference/sdk/)
