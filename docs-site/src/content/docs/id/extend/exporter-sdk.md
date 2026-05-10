---
title: Exporter SDK
description: Tambahkan format target baru — CARLA, Unity, SUMO, atau apa pun.
---

Exporter adalah serangkaian fungsi murni atas
`DrawtonomySnapshot`. Menambahkan format target baru bersifat
mandiri: modul baru, beberapa tes, dan hook UI opsional.

Halaman ini adalah orientasi cepat. Panduan lengkap — arsitektur,
API, pola pengujian, pemeriksaan visual esmini — ada di
repositori publik:

➡ **[Panduan Pengembang Exporter](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Mulai cepat

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # mode watch
```

## Exporter baru minimal

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Telusuri bentuk, hasilkan format Anda.
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

## Gunakan adegan nyata sebagai fixture

Berkas `drawtonomy.svg` melakukan round-trip melalui SDK, jadi
Anda dapat membuat adegan di editor dan menggunakannya sebagai
input tes regresi:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Lihat juga

- [Arsitektur exporter](/id/explanation/exporter-architecture/) —
  pipeline dan mengapa bersifat murni.
- [Ikhtisar `@drawtonomy/sdk`](/id/reference/sdk/)
