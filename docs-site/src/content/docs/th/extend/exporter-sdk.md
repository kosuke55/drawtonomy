---
title: Exporter SDK
description: เพิ่มรูปแบบเป้าหมายใหม่ — CARLA, Unity, SUMO หรืออะไรก็ตาม
---

ตัวส่งออกคือชุดของฟังก์ชันบริสุทธิ์ที่ทำงานบน
`DrawtonomySnapshot` การเพิ่มรูปแบบเป้าหมายใหม่เป็นงานที่
ครบถ้วนในตัว: โมดูลใหม่ เทสต์ไม่กี่ตัว และ UI hook ที่ไม่
บังคับ

หน้านี้คือการแนะนำอย่างรวดเร็ว คู่มือเต็ม — สถาปัตยกรรม API
รูปแบบเทสต์ การตรวจสอบเชิงภาพของ esmini — อยู่ในรีโป public:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## เริ่มต้นอย่างรวดเร็ว

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # โหมด watch
```

## ตัวส่งออกใหม่ขั้นต่ำ

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // เดินผ่านรูปทรง สร้างรูปแบบของคุณ
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

## ใช้ฉากจริงเป็น fixture

ไฟล์ `drawtonomy.svg` round-trip ผ่าน SDK ได้ จึงสร้างฉากใน
โปรแกรมแก้ไขแล้วใช้เป็นอินพุตเทสต์การถดถอยได้:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## ดูเพิ่มเติม

- [สถาปัตยกรรมตัวส่งออก](/th/explanation/exporter-architecture/) —
  pipeline และเหตุผลที่เป็นแบบบริสุทธิ์
- [ภาพรวม `@drawtonomy/sdk`](/th/reference/sdk/)
