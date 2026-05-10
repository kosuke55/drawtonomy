---
title: Exporter SDK
description: Ein neues Zielformat hinzufügen — CARLA, Unity, SUMO oder anderes.
keywords:
  - drawtonomy Exporter SDK
  - eigenes Exportformat
  - CARLA Exporter
  - SUMO Exporter
  - DrawtonomySnapshot
  - Whiteboard für autonomes Fahren
---

Der Exporter ist eine Sammlung reiner Funktionen über
`DrawtonomySnapshot`. Ein neues Zielformat hinzuzufügen ist
in sich abgeschlossen: ein neues Modul, ein paar Tests und ein
optionaler UI-Hook.

Diese Seite ist eine schnelle Orientierung. Die vollständige
Anleitung — Architektur, API, Testmuster, esmini-Sichtprüfungen —
liegt im öffentlichen Repo:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Schnellstart

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # Watch-Modus
```

## Minimaler neuer Exporter

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Formen durchlaufen, Ihr Format ausgeben.
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

## Eine reale Szene als Fixture verwenden

`drawtonomy.svg`-Dateien sind durch das SDK reisefähig, sodass Sie
eine Szene im Editor erstellen und als Eingabe für
Regressionstests nutzen können:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Siehe auch

- [Exporter-Architektur](/de/explanation/exporter-architecture/) —
  die Pipeline und warum sie rein ist.
- [`@drawtonomy/sdk`-Übersicht](/de/reference/sdk/)
