---
title: SDK Trình xuất
description: Thêm một định dạng đích mới — CARLA, Unity, SUMO, hoặc bất cứ thứ gì khác.
---

Trình xuất là một tập hợp các hàm thuần trên `DrawtonomySnapshot`. Thêm một định dạng đích mới là tự chứa: một module mới, vài bài kiểm thử, và một móc UI tùy chọn.

Trang này là một định hướng nhanh. Hướng dẫn đầy đủ — kiến trúc, API, các mẫu kiểm thử, các kiểm tra trực quan esmini — nằm trong repo công khai:

➡ **[Hướng dẫn Nhà phát triển Trình xuất](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Bắt đầu nhanh

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch mode
```

## Trình xuất mới tối thiểu

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

## Sử dụng một cảnh thực làm fixture

Các tệp `drawtonomy.svg` được đọc/ghi qua lại qua SDK, vì vậy bạn có thể tạo một cảnh trong trình chỉnh sửa và sử dụng nó làm đầu vào kiểm thử hồi quy:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Xem thêm

- [Kiến trúc trình xuất](/vi/explanation/exporter-architecture/) — pipeline và vì sao nó thuần.
- [Tổng quan `@drawtonomy/sdk`](/vi/reference/sdk/)
