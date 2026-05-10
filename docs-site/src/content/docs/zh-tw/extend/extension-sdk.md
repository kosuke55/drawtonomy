---
title: 擴充 SDK
description: 使用 @drawtonomy/sdk 與 @drawtonomy/dev-server 開發 iframe 擴充功能。
keywords:
  - drawtonomy 擴充 SDK
  - iframe 擴充功能
  - postMessage 擴充
  - drawtonomy 外掛
  - 自駕白板擴充開發
---

drawtonomy 擴充功能是透過 `postMessage` 與編輯器溝通的 iframe 代管網頁應用。SDK 提供具型別客戶端;dev-server 提供本機編輯器供您開發。

本頁是快速概覽。完整指南——資訊清單結構、功能清單、訊息協定——位於公開儲存庫:

➡ **[擴充功能開發指南](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)**([日文](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## 快速開始

```bash
# 編輯器於 :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# 您的擴充功能於 :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## 最小擴充功能

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

## 參考擴充功能

內建擴充功能是完整保真度的範例:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — 自然語言與 OpenSCENARIO 場景生成。
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — 預覽形狀範本。
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — 對即時畫布測試匯出器。
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — 路徑足跡實驗。

## 另請參閱

- [擴充功能架構](/zh-tw/explanation/extension-architecture/) — 為何使用 iframe 與 postMessage。
- [`@drawtonomy/sdk` 概述](/zh-tw/reference/sdk/) — 套件及其模組。
