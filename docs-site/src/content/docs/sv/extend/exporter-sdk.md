---
title: Exporter SDK
description: Lägg till ett nytt målformat — CARLA, Unity, SUMO eller vad som helst annat.
---

Exportören är en uppsättning rena funktioner över
`DrawtonomySnapshot`. Att lägga till ett nytt målformat är
självständigt: en ny modul, några tester och en valfri UI-krok.

Den här sidan är en snabborientering. Den fullständiga guiden —
arkitektur, API, testmönster, esmini visuella kontroller — finns
i det publika arkivet:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Snabbstart

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch-läge
```

## Minimal ny exportör

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Gå genom former, emittera ditt format.
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

## Använd en riktig scen som fixtur

`drawtonomy.svg`-filer går tur-och-retur genom SDK:n, så du kan
skapa en scen i redigeraren och använda den som
regressionstest-input:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Se även

- [Exportörarkitektur](/sv/explanation/exporter-architecture/) —
  pipelinen och varför den är ren.
- [`@drawtonomy/sdk`-översikt](/sv/reference/sdk/)
