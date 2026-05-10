---
title: 擴充 drawtonomy
description: 開發擴充功能、新增目標格式、貢獻範本。
sidebar:
  order: 0
keywords:
  - 擴充 drawtonomy
  - 自駕白板擴充
  - 擴充功能開發
  - SVG 範本貢獻
  - drawtonomy 開發
---

drawtonomy 設計為可擴充。同一個支援內建擴充功能(AI 場景產生器、範本預覽、匯出器試驗場)的 SDK,就是您要使用的工具。

## 選擇您的擴充點

| 您想…… | 閱讀 |
|---|---|
| 加入面板、產生器或與編輯器並行的工具 | [擴充 SDK](/zh-tw/extend/extension-sdk/) |
| 新增匯出目標(CARLA、Unity、SUMO 等) | [匯出器 SDK](/zh-tw/extend/exporter-sdk/) |
| 貢獻新的 SVG 範本(車輛、行人、號誌) | [範本](/zh-tw/extend/templates/) |

## 原始碼位置

所有內容皆位於公開的 [drawtonomy GitHub 儲存庫](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — 開發用本機編輯器
- `extensions/` — 內建擴充功能,可作為參考
- `templates/` — 內建形狀範本

歡迎 PR。[範本指南](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)詳細介紹從頭到尾新增自訂形狀的流程。
