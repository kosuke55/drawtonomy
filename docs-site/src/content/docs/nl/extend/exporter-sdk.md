---
title: Exporter-SDK
description: Voeg een nieuw doelformaat toe — CARLA, Unity, SUMO of iets anders.
---

De exporter is een set pure functies over `DrawtonomySnapshot`.
Een nieuw doelformaat toevoegen is op zichzelf staand: een
nieuwe module, een paar tests en een optionele UI-hook.

Deze pagina is een snelle oriëntatie. De volledige handleiding —
architectuur, API, testpatronen, esmini visuele controles —
staat in de openbare repo:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Snelstart

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch mode
```

## Minimale nieuwe exporter

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Loop over vormen, zend uw formaat uit.
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

## Een echte scène als fixture gebruiken

`drawtonomy.svg`-bestanden round-trippen door de SDK, dus u kunt
een scène maken in de editor en deze gebruiken als invoer voor
regressietests:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Zie ook

- [Exporter-architectuur](/nl/explanation/exporter-architecture/) —
  de pijplijn en waarom deze puur is.
- [`@drawtonomy/sdk`-overzicht](/nl/reference/sdk/)
