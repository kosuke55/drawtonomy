---
title: SDK do Exportador
description: Adicione um novo formato alvo — CARLA, Unity, SUMO ou qualquer outra coisa.
---

O exportador é um conjunto de funções puras sobre
`DrawtonomySnapshot`. Adicionar um novo formato alvo é
autocontido: um novo módulo, alguns testes e um hook de UI opcional.

Esta página é uma orientação rápida. O guia completo —
arquitetura, API, padrões de teste, verificações visuais com
esmini — está no repositório público:

➡ **[Guia do Desenvolvedor do Exportador](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Início rápido

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # modo watch
```

## Novo exportador mínimo

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Percorra as formas, emita seu formato.
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

## Use uma cena real como fixture

Arquivos `drawtonomy.svg` fazem round-trip pelo SDK, então você
pode criar uma cena no editor e usá-la como entrada de teste de
regressão:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Veja também

- [Arquitetura do exportador](/pt/explanation/exporter-architecture/) —
  o pipeline e por que ele é puro.
- [Visão geral do `@drawtonomy/sdk`](/pt/reference/sdk/)
