---
title: 导出器 SDK
description: 新增一个目标格式 — CARLA、Unity、SUMO 或任意其他系统。
keywords:
  - drawtonomy 导出器 SDK
  - 自定义导出格式
  - CARLA 导出
  - Unity 自动驾驶
  - SUMO 场景导出
  - 自动驾驶仿真接入
---

导出器是一组针对 `DrawtonomySnapshot` 的纯函数。
新增一个目标格式是自包含的:一个新模块、几个测试,
以及一个可选的 UI 钩子。

本页是一份快速指南。完整说明——架构、API、测试模式、
基于 esmini 的可视化校验——位于公开仓库:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## 快速开始

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch 模式
```

## 一个最小的新导出器

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // 遍历图形,输出你的格式。
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

## 用真实场景作为 fixture

`drawtonomy.svg` 文件可以通过 SDK 双向往返,
所以你可以在编辑器里制作一个场景,作为回归测试输入:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## 另请参阅

- [导出器架构](/zh-cn/explanation/exporter-architecture/) —
  导出管线及它为何是纯函数。
- [`@drawtonomy/sdk` 概览](/zh-cn/reference/sdk/)
