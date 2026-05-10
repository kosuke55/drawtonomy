---
title: エクステンション SDK
description: '@drawtonomy/sdk と @drawtonomy/dev-server で iframe エクステンションを構築する方法。'
keywords:
  - エクステンション sdk
  - drawtonomy iframe 開発
  - postmessage クライアント
  - 自動運転 シナリオ 拡張
---

drawtonomy のエクステンションは、`postMessage` でエディタと通信する iframe ホスト型の Web アプリです。SDK が型付きクライアントを提供し、dev-server が開発用のローカルエディタを提供します。

このページは概要のみです。完全なガイド — マニフェストスキーマ、capability 一覧、メッセージプロトコル — は公開リポジトリにあります:

➡ **[エクステンション開発ガイド](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## クイックスタート

```bash
# Editor on :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Your extension on :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## 最小構成のエクステンション

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## 参考になるエクステンション

インツリーのエクステンションは参考になる完全な実装例です:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — 自然言語と OpenSCENARIO によるシーン生成。
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — 図形テンプレートのプレビュー。
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — ライブのキャンバスに対してエクスポータを試す。
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint の実験用ラボ。

## 関連項目

- [エクステンションアーキテクチャ](/ja/explanation/extension-architecture/) — なぜ iframe か、なぜ postMessage か。
- [`@drawtonomy/sdk` の概要](/ja/reference/sdk/) — パッケージとモジュール。
