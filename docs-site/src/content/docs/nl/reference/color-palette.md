---
title: Kleurenpalet
description: De kleurkeys van drawtonomy en hun HEX-waarden.
---

drawtonomy gebruikt een palet in Tailwind- / Material-stijl:
grey-100 (lichtst) tot en met grey-900 (donkerst), plus benoemde
kleuren.

## Grijswaarden

| Key | HEX | Opmerkingen |
|---|---|---|
| `grey-100` | `#e6e6e6` | Lichtst. Standaard voor Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Standaard voor Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Middengrijs. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Donkerst. |

Lager nummer = lichter. Dit komt overeen met de conventie van
Tailwind.

## Standaardwaarden van sjablonen

| Sjabloon | Standaardkleur |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Andere vormen | `black` |

## Kleur programmatisch instellen

Gebruik `resolveColor()` van de SDK om een key naar een
HEX-waarde te converteren. Zie de
[Extensie-SDK API](/nl/extend/extension-sdk/) voor details.
