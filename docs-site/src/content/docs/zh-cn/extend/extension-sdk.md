---
title: 扩展 SDK
description: 使用 @drawtonomy/sdk 与 @drawtonomy/dev-server 构建 iframe 扩展。
keywords:
  - drawtonomy 扩展 SDK
  - iframe 扩展开发
  - postMessage 协议
  - drawtonomy ExtensionClient
  - 自定义自动驾驶工具
  - 浏览器扩展开发
---

drawtonomy 扩展是托管在 iframe 中的 Web 应用,
通过 `postMessage` 与编辑器通信。SDK 提供了类型化的客户端;
dev-server 则提供本地编辑器供你开发。

本页是一份快速指南。完整说明——manifest schema、
能力(capabilities)列表、消息协议——位于公开仓库:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## 快速开始

```bash
# 编辑器在 :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# 你的扩展在 :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## 一个最小扩展

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

## 参考扩展

仓库内置的扩展是完整保真示例:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — 自然语言与 OpenSCENARIO 场景生成。
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — 预览图形模板。
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — 在画布上即时调试导出器。
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint 实验。

## 另请参阅

- [扩展架构](/zh-cn/explanation/extension-architecture/) —
  为什么使用 iframe 与 postMessage。
- [`@drawtonomy/sdk` 概览](/zh-cn/reference/sdk/) — 包及其模块。
