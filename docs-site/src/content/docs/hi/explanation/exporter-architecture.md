---
title: Exporter architecture
description: एक कैनवस कैसे एक snapshot बनता है, और एक snapshot कैसे एक फ़ाइल बनती है।
---

Exporter drawtonomy के in-editor डेटा और external फ़ॉर्मैट —
OpenDRIVE, OpenSCENARIO, Lanelet2, या जो भी आप अगला plug करते
हैं — के बीच ब्रिज है। Pipeline को समझना एक नया target फ़ॉर्मैट
जोड़ने के लिए prerequisite है।

## Pipeline

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

एक snapshot एक plain object है: shapes की एक list plus एक
version stamp और एक timestamp। यह serialisable है, इसमें कोई
DOM references नहीं हैं, और यह exporter जो single input लेता
है वही है।

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

आप `createSnapshot(shapes)` के साथ एक snapshot बनाते हैं, या
एक saved `drawtonomy.svg` को `parseDrawtonomySvg(svg)` के साथ
parse करके।

### 2. Exporter modules

प्रत्येक target फ़ॉर्मैट एक अलग pure function है:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

वे एक snapshot लेते हैं, एक string या एक blob return करते हैं।
कोई editor access नहीं, कोई DOM नहीं, कोई async dependencies
नहीं। समान input, समान output।

### 3. Round-trip

Lanelet2 के लिए, SDK एक parser भी ship करता है:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

यह वही है जो [Lanelet2 import](/hi/guides/import-lanelet2/) flow
को powers करता है।

## Pure functions क्यों

Exporter ब्राउज़र में, Node CI script में, server-side
pipeline में, या ब्राउज़र एक्सटेंशन में समान code path चलाता
है। Tests headless ब्राउज़र के बिना snapshot fixtures के
विरुद्ध चलते हैं।

यही कारण है कि exporter `@drawtonomy/sdk` में रहता है और एडिटर
के अंदर नहीं — एडिटर SDK पर निर्भर करता है, उल्टा नहीं।

## एक target फ़ॉर्मैट जोड़ना

Exporter नए targets — CARLA, Unity, SUMO, custom DSLs — के
लिए मुख्य extension point है। Recipe:

1. `packages/drawtonomy-sdk/src/exporter/` के तहत एक नया
   module जोड़ें।
2. `DrawtonomySnapshot` को input लें, एक string या blob return
   करें।
3. snapshot fixtures का उपयोग करके
   `packages/drawtonomy-sdk/__tests__/exporter/` के तहत tests
   जोड़ें।
4. यदि आप चाहते हैं कि एडिटर का Export मेनू इसके बारे में
   जाने तो UI entry point wire करें (वैकल्पिक — कई उपयोगकर्ता
   इसे programmatically call करेंगे)।

पूरा developer guide public repo में है:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)।

## इसे भी देखें

- [OpenDRIVE / OpenSCENARIO / esmini में एक्सपोर्ट](/hi/guides/export-asam/) —
  user-facing flow।
- [`@drawtonomy/sdk` overview](/hi/reference/sdk/)
- [Exporter SDK API](/hi/extend/exporter-sdk/)
