---
title: SDK del exportador
description: Añade un nuevo formato de destino — CARLA, Unity, SUMO o cualquier otra cosa.
---

El exportador es un conjunto de funciones puras sobre
`DrawtonomySnapshot`. Añadir un nuevo formato de destino es
autocontenido: un nuevo módulo, unas pocas pruebas y un hook de UI
opcional.

Esta página es una orientación rápida. La guía completa —
arquitectura, API, patrones de prueba, comprobaciones visuales con
esmini — está en el repo público:

➡ **[Guía de Desarrollador del Exportador](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Inicio rápido

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # modo watch
```

## Nuevo exportador mínimo

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Recorre las formas, emite tu formato.
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

## Usar una escena real como fixture

Los archivos `drawtonomy.svg` hacen round-trip a través del SDK,
así que puedes crear una escena en el editor y usarla como
entrada de prueba de regresión:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Véase también

- [Arquitectura del exportador](/es/explanation/exporter-architecture/) —
  el pipeline y por qué es puro.
- [Resumen de `@drawtonomy/sdk`](/es/reference/sdk/)
