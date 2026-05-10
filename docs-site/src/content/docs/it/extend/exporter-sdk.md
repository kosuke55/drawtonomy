---
title: SDK degli esportatori
description: Aggiungi un nuovo formato target — CARLA, Unity, SUMO o qualsiasi altra cosa.
---

L'esportatore è un insieme di funzioni pure su
`DrawtonomySnapshot`. Aggiungere un nuovo formato target è
autonomo: un nuovo modulo, qualche test e un hook UI opzionale.

Questa pagina è un orientamento rapido. La guida completa —
architettura, API, pattern di test, controlli visivi esmini — è
nel repo pubblico:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Avvio rapido

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # modalità watch
```

## Esportatore minimo

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Itera sulle forme, emetti il tuo formato.
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

## Usare una scena reale come fixture

I file `drawtonomy.svg` fanno il round-trip attraverso l'SDK,
quindi puoi creare una scena nell'editor e usarla come input per
test di regressione:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Vedi anche

- [Architettura dell'esportatore](/it/explanation/exporter-architecture/) —
  la pipeline e perché è pura.
- [Panoramica `@drawtonomy/sdk`](/it/reference/sdk/)
