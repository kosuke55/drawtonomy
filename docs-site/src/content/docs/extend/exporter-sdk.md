---
title: Exporter SDK
description: Add a new target format — CARLA, Unity, SUMO, or anything else.
---

The exporter is a set of pure functions over `DrawtonomySnapshot`.
Adding a new target format is self-contained: a new module, a few
tests, and an optional UI hook.

This page is a quick orientation. The full guide — architecture,
API, testing patterns, esmini visual checks — is in the public
repo:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Quick start

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch mode
```

## Minimal new exporter

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Walk shapes, emit your format.
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

## Use a real scene as a fixture

`drawtonomy.svg` files round-trip through the SDK, so you can
author a scene in the editor and use it as a regression-test
input:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## See also

- [Exporter architecture](/explanation/exporter-architecture/) —
  the pipeline and why it's pure.
- [`@drawtonomy/sdk` overview](/reference/sdk/)
