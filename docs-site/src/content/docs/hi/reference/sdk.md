---
title: '@drawtonomy/sdk overview'
description: Packages, entry points, और SDK एडिटर के साथ कैसे fit होता है।
---

`@drawtonomy/sdk` वह package है जिसके विरुद्ध एक्सटेंशन authors
और headless tooling बनाते हैं। यह expose करता है:

| Module | उद्देश्य |
|---|---|
| `ExtensionClient` | iframe-hosted एक्सटेंशन के लिए postMessage client। |
| Shape factory functions | `createLane()`, `createVehicle()`, etc। |
| `createSnapshot()` | shapes के एक array से एक `DrawtonomySnapshot` बनाएं। |
| `exporter.*` | Pure functions जो एक snapshot को OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM में बदलती हैं। एक Lanelet2 parser शामिल है। |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Install

```bash
pnpm add @drawtonomy/sdk
```

## Companion packages

| Package | उद्देश्य |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK स्वयं। |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | एक्सटेंशन development के लिए एडिटर host करने वाला local dev server। |

## स्रोत

SDK स्रोत, tests, और examples
[drawtonomy GitHub repository](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk)
में हैं।

## इसे भी देखें

- [Extension SDK API](/hi/extend/extension-sdk/) — iframe एक्सटेंशन
  बनाना।
- [Exporter SDK API](/hi/extend/exporter-sdk/) — नए target फ़ॉर्मैट
  जोड़ना।
