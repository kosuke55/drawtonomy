---
title: 匯出器架構
description: 畫布如何變成快照,而快照如何變成檔案。
keywords:
  - drawtonomy 匯出器
  - 自駕場景匯出架構
  - DrawtonomySnapshot
  - OpenDRIVE 匯出流程
  - OpenSCENARIO 匯出
  - 匯出器管線
---

匯出器是 drawtonomy 編輯器內資料與外部格式之間的橋樑——OpenDRIVE、OpenSCENARIO、Lanelet2,或您接下來要插入的任何格式。理解管線是新增目標格式的先決條件。

## 管線

```
編輯器狀態 ──► DrawtonomySnapshot ──► 匯出器 ──► 檔案 / blob
              (可序列化)             (純函式)
```

### 1. `DrawtonomySnapshot`

快照是一個普通物件:形狀清單加上版本戳記與時間戳記。它可序列化、無 DOM 參考,且是匯出器接受的唯一輸入。

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

您可使用 `createSnapshot(shapes)` 或解析已儲存的 `drawtonomy.svg` 並透過 `parseDrawtonomySvg(svg)` 來建立快照。

### 2. 匯出器模組

每個目標格式是一個獨立的純函式:

- `exporter.exportToOpenDrive(snapshot, options) → string`(XML)
- `exporter.exportToOpenScenario(snapshot, options) → string`(XML)
- `exporter.exportToLanelet2(snapshot, options) → string`(OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

它們接受快照,回傳字串或 blob。沒有編輯器存取、沒有 DOM、沒有非同步相依。相同輸入,相同輸出。

### 3. 雙向轉換

對於 Lanelet2,SDK 也提供解析器:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

這就是支援 [Lanelet2 匯入](/zh-tw/guides/import-lanelet2/)流程的底層。

## 為何使用純函式

匯出器在瀏覽器、Node CI 腳本、伺服器端管線或瀏覽器擴充功能中都執行相同的程式碼路徑。測試在快照固定資料上執行,無需無頭瀏覽器。

這就是為什麼匯出器位於 `@drawtonomy/sdk` 而非編輯器內——編輯器相依於 SDK,而非反之。

## 新增目標格式

匯出器是新目標的主要擴充點——CARLA、Unity、SUMO、自訂 DSL。配方:

1. 在 `packages/drawtonomy-sdk/src/exporter/` 下新增一個模組。
2. 接受 `DrawtonomySnapshot` 為輸入,回傳字串或 blob。
3. 在 `packages/drawtonomy-sdk/__tests__/exporter/` 下使用快照固定資料新增測試。
4. 若您希望編輯器的匯出選單知道它,串接 UI 進入點(可選——許多使用者會以程式化方式呼叫)。

完整開發者指南位於公開儲存庫:[匯出器開發者指南](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)。

## 另請參閱

- [匯出至 OpenDRIVE / OpenSCENARIO / esmini](/zh-tw/guides/export-asam/) — 使用者面對的流程。
- [`@drawtonomy/sdk` 概述](/zh-tw/reference/sdk/)
- [匯出器 SDK API](/zh-tw/extend/exporter-sdk/)
