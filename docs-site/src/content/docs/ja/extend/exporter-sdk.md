---
title: Exporter SDK
description: 新しいターゲット形式（CARLA、Unity、SUMO など）を追加する方法。
keywords:
  - exporter sdk 自動運転
  - 新規 ターゲット 形式 追加
  - carla unity sumo エクスポート
  - 自動運転 シミュレータ 出力
---

エクスポータは `DrawtonomySnapshot` に対する純粋関数の集まりです。新しいターゲット形式の追加は自己完結的に行えます: モジュール 1 つ、いくつかのテスト、そして任意で UI フックを追加するだけです。

このページは概要のみです。完全なガイド — アーキテクチャ、API、テストパターン、esmini での目視確認 — は公開リポジトリにあります:

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## クイックスタート

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # ウォッチモード
```

## 最小限のエクスポータ

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // 図形を走査して、独自形式を出力する。
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

## 実シーンをフィクスチャとして使う

`drawtonomy.svg` ファイルは SDK 経由でラウンドトリップ可能なので、エディタで作ったシーンを回帰テストの入力として使えます:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## 関連項目

- [エクスポータアーキテクチャ](/ja/explanation/exporter-architecture/) — パイプラインと、それが純粋関数である理由。
- [`@drawtonomy/sdk` の概要](/ja/reference/sdk/)
