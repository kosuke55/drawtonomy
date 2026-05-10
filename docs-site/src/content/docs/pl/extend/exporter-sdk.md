---
title: Exporter SDK
description: Dodaj nowy format docelowy — CARLA, Unity, SUMO lub cokolwiek innego.
---

Eksporter to zestaw czystych funkcji nad `DrawtonomySnapshot`.
Dodanie nowego formatu docelowego jest samowystarczalne: nowy moduł,
kilka testów i opcjonalny hak UI.

Ta strona to szybkie wprowadzenie. Pełny przewodnik — architektura,
API, wzorce testowania, wizualne sprawdzenia esmini — znajduje się w
publicznym repo:

➡ **[Przewodnik Dewelopera Eksportera](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Szybki start

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # tryb watch
```

## Minimalny nowy eksporter

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Iteruj po kształtach, emituj swój format.
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

## Użyj prawdziwej sceny jako fixture

Pliki `drawtonomy.svg` przechodzą round-trip przez SDK, więc możesz
utworzyć scenę w edytorze i użyć jej jako wejścia do testu regresji:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Zobacz także

- [Architektura eksportera](/pl/explanation/exporter-architecture/) —
  potok i dlaczego jest czysty.
- [Przegląd `@drawtonomy/sdk`](/pl/reference/sdk/)
