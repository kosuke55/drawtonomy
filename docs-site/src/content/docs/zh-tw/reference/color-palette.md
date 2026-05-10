---
title: 調色盤
description: drawtonomy 的顏色鍵與其 HEX 值。
keywords:
  - drawtonomy 調色盤
  - 自駕白板顏色
  - 形狀顏色
  - HEX 顏色
  - tailwind 灰階
---

drawtonomy 使用 Tailwind / Material 風格的調色盤:grey-100(最淺)至 grey-900(最深),加上具名顏色。

## 灰階

| 鍵 | HEX | 備註 |
|---|---|---|
| `grey-100` | `#e6e6e6` | 最淺。Vehicle (Simple) 預設。 |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) 預設。 |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | 中灰。 |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | 最深。 |

數字越小越淺。這符合 Tailwind 的慣例。

## 範本預設值

| 範本 | 預設顏色 |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| 其他形狀 | `black` |

## 程式化設定顏色

使用 SDK 的 `resolveColor()` 將鍵轉換為 HEX 值。詳情請參閱[擴充 SDK API](/zh-tw/extend/extension-sdk/)。
