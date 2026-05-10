---
title: SDK экспортёра
description: Добавьте новый целевой формат — CARLA, Unity, SUMO или что угодно ещё.
---

Экспортёр — это набор чистых функций над `DrawtonomySnapshot`.
Добавление нового целевого формата самодостаточно: новый модуль,
несколько тестов и опциональный UI-хук.

Эта страница — быстрая ориентация. Полное руководство — архитектура,
API, шаблоны тестирования, визуальные проверки esmini — в публичном
репозитории:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Быстрый старт

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # режим watch
```

## Минимальный новый экспортёр

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Обойдите фигуры, эмитируйте свой формат.
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

## Используйте реальную сцену как фикстуру

Файлы `drawtonomy.svg` совершают обмен через SDK, поэтому можно
создать сцену в редакторе и использовать её как вход для
регрессионного теста:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## См. также

- [Архитектура экспортёра](/ru/explanation/exporter-architecture/) —
  пайплайн и почему он чистый.
- [Обзор `@drawtonomy/sdk`](/ru/reference/sdk/)
