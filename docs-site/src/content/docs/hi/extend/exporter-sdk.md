---
title: Exporter SDK
description: एक नया target फ़ॉर्मैट जोड़ें — CARLA, Unity, SUMO, या कुछ और।
---

Exporter `DrawtonomySnapshot` पर pure functions का एक set है।
एक नया target फ़ॉर्मैट जोड़ना self-contained है: एक नया
module, कुछ tests, और एक वैकल्पिक UI hook।

यह पेज एक त्वरित orientation है। पूरा गाइड — architecture,
API, testing patterns, esmini visual checks — public repo में है:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Quick start

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch mode
```

## न्यूनतम नया exporter

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

## एक वास्तविक दृश्य को fixture के रूप में उपयोग करें

`drawtonomy.svg` फ़ाइलें SDK के माध्यम से round-trip करती हैं,
इसलिए आप एडिटर में एक दृश्य author कर सकते हैं और इसे
regression-test input के रूप में उपयोग कर सकते हैं:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## इसे भी देखें

- [Exporter architecture](/hi/explanation/exporter-architecture/) —
  pipeline और यह pure क्यों है।
- [`@drawtonomy/sdk` overview](/hi/reference/sdk/)
