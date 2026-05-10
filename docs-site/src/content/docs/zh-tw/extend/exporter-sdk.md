---
title: 匯出器 SDK
description: 新增目標格式 — CARLA、Unity、SUMO 或其他任何格式。
keywords:
  - drawtonomy 匯出器 SDK
  - 自訂匯出格式
  - CARLA 匯出
  - Unity 場景匯出
  - SUMO 匯出
  - 自駕場景轉換
---

匯出器是針對 `DrawtonomySnapshot` 的一組純函式。新增目標格式是自包含的:一個新模組、幾個測試,以及可選的 UI 鉤點。

本頁是快速概覽。完整指南——架構、API、測試模式、esmini 視覺檢查——位於公開儲存庫:

➡ **[匯出器開發者指南](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)**([日文](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## 快速開始

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # 監視模式
```

## 最小新匯出器

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // 走訪形狀,輸出您的格式。
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

## 將真實場景作為固定資料

`drawtonomy.svg` 檔案可透過 SDK 雙向轉換,所以您可以在編輯器中編寫場景,並用作迴歸測試輸入:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## 另請參閱

- [匯出器架構](/zh-tw/explanation/exporter-architecture/) — 管線及其純粹性的原因。
- [`@drawtonomy/sdk` 概述](/zh-tw/reference/sdk/)
