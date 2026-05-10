---
title: Color palette
description: drawtonomy के color keys और उनके HEX values।
---

drawtonomy एक Tailwind / Material-style palette का उपयोग करता है:
grey-100 (सबसे हल्का) से grey-900 (सबसे गहरा), plus नामित रंग।

## Greyscale

| Key | HEX | नोट्स |
|---|---|---|
| `grey-100` | `#e6e6e6` | सबसे हल्का। Vehicle (Simple) के लिए डिफ़ॉल्ट। |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) के लिए डिफ़ॉल्ट। |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Middle grey। |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | सबसे गहरा। |

कम संख्या = हल्का। यह Tailwind की convention से मेल खाता है।

## Template defaults

| Template | डिफ़ॉल्ट रंग |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Other shapes | `black` |

## Programmatically रंग सेट करना

एक key को HEX value में बदलने के लिए SDK के `resolveColor()` का
उपयोग करें। विवरण के लिए
[Extension SDK API](/hi/extend/extension-sdk/) देखें।
