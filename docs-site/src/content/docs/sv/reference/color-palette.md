---
title: Färgpalett
description: drawtonomys färgnycklar och deras HEX-värden.
---

drawtonomy använder en palett i Tailwind- / Material-stil:
grey-100 (ljusast) till grey-900 (mörkast), plus namngivna färger.

## Gråskala

| Nyckel | HEX | Anteckningar |
|---|---|---|
| `grey-100` | `#e6e6e6` | Ljusast. Standard för Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Standard för Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Mellangrå. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Mörkast. |

Lägre nummer = ljusare. Detta matchar Tailwinds konvention.

## Mall-standardvärden

| Mall | Standardfärg |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Övriga former | `black` |

## Ange färg programmatiskt

Använd SDK:ns `resolveColor()` för att konvertera en nyckel till
ett HEX-värde. Se [Extension SDK API](/sv/extend/extension-sdk/) för
detaljer.
