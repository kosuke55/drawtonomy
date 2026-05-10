---
title: Farbpalette
description: Die Farbschlüssel von drawtonomy und ihre HEX-Werte.
keywords:
  - drawtonomy Farbpalette
  - Farbschlüssel Editor
  - HEX Werte drawtonomy
  - Tailwind Palette Spureditor
  - Whiteboard für autonomes Fahren
---

drawtonomy verwendet eine Palette im Tailwind-/Material-Stil:
grey-100 (am hellsten) bis grey-900 (am dunkelsten), plus benannte
Farben.

## Graustufen

| Schlüssel | HEX | Hinweise |
|---|---|---|
| `grey-100` | `#e6e6e6` | Am hellsten. Standard für Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Standard für Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Mittleres Grau. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Am dunkelsten. |

Niedrigere Zahl = heller. Das entspricht der Tailwind-Konvention.

## Vorlagen-Standardwerte

| Vorlage | Standardfarbe |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Andere Formen | `black` |

## Farbe programmatisch setzen

Verwenden Sie `resolveColor()` aus dem SDK, um einen Schlüssel in
einen HEX-Wert umzuwandeln. Details in der
[Extension-SDK-API](/de/extend/extension-sdk/).
