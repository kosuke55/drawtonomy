---
title: '@drawtonomy/sdk 概述'
description: 套件、進入點,以及 SDK 如何與編輯器搭配。
keywords:
  - drawtonomy SDK
  - 自駕白板 SDK
  - 擴充功能 SDK
  - drawtonomy 套件
  - 自駕工具開發
---

`@drawtonomy/sdk` 是擴充功能作者與無頭工具開發所依賴的套件。它提供:

| 模組 | 用途 |
|---|---|
| `ExtensionClient` | 給 iframe 代管擴充功能使用的 postMessage 客戶端。 |
| 形狀工廠函式 | `createLane()`、`createVehicle()` 等。 |
| `createSnapshot()` | 從形狀陣列建立 `DrawtonomySnapshot`。 |
| `exporter.*` | 將快照轉換為 OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM 的純函式。包含 Lanelet2 解析器。 |
| 型別 | `BaseShape`、`LaneShape`、`VehicleShape`、`DrawtonomySnapshot`…… |

## 安裝

```bash
pnpm add @drawtonomy/sdk
```

## 配套套件

| 套件 | 用途 |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK 本身。 |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | 給擴充功能開發使用的本機開發伺服器,可代管編輯器。 |

## 原始碼

SDK 原始碼、測試與範例位於 [drawtonomy GitHub 儲存庫](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk)。

## 另請參閱

- [擴充 SDK API](/zh-tw/extend/extension-sdk/) — 開發 iframe 擴充功能。
- [匯出器 SDK API](/zh-tw/extend/exporter-sdk/) — 新增目標格式。
