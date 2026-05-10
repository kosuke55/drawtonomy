---
title: Color palette
description: drawtonomy's color keys and their HEX values.
---

drawtonomy uses a Tailwind / Material-style palette: grey-100 (lightest)
through grey-900 (darkest), plus named colours.

## Greyscale

| Key | HEX | Notes |
|---|---|---|
| `grey-100` | `#e6e6e6` | Lightest. Default for Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Default for Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Middle grey. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Darkest. |

Lower number = lighter. This matches Tailwind's convention.

## Template defaults

| Template | Default colour |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Other shapes | `black` |

## Setting colour programmatically

Use the SDK's `resolveColor()` to convert a key to a HEX value. See
the [Extension SDK API](/extend/extension-sdk/) for details.
