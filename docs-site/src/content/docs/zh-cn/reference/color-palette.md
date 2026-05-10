---
title: 颜色调色板
description: drawtonomy 的颜色 key 与对应的 HEX 值。
keywords:
  - drawtonomy 调色板
  - 颜色 HEX
  - 自动驾驶图配色
  - 灰度调色板
  - Tailwind 调色板
---

drawtonomy 使用类似 Tailwind / Material 的调色板:从 grey-100(最浅)
到 grey-900(最深),另加几种命名颜色。

## 灰度

| Key | HEX | 备注 |
|---|---|---|
| `grey-100` | `#e6e6e6` | 最浅。Vehicle (Simple) 默认值。 |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) 默认值。 |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | 中灰。 |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | 最深。 |

数字越小越浅,与 Tailwind 的约定一致。

## 模板默认色

| 模板 | 默认颜色 |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| 其他图形 | `black` |

## 程序化设置颜色

使用 SDK 中的 `resolveColor()` 把 key 转换为 HEX 值。
详见 [扩展 SDK API](/zh-cn/extend/extension-sdk/)。
