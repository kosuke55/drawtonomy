---
title: بنية المُصدِّر
description: كيف تصبح اللوحة لقطة، وكيف تصبح اللقطة ملفًا.
---

المُصدِّر هو الجسر بين بيانات drawtonomy داخل المحرر والصيغ الخارجية — OpenDRIVE وOpenSCENARIO وLanelet2 أو أيًا كان ما تضيفه لاحقًا. فهم خط الأنابيب شرط مسبق لإضافة صيغة هدف جديدة.

## خط الأنابيب

```
حالة المحرر ──► DrawtonomySnapshot ──► المُصدِّر ──► ملف / blob
                  (قابل للتسلسل)        (نقي)
```

### 1. `DrawtonomySnapshot`

اللقطة كائن عادي: قائمة أشكال بالإضافة إلى ختم إصدار وطابع زمني. قابلة للتسلسل، ولا تحتوي مراجع DOM، وهي المدخل الوحيد الذي يأخذه المُصدِّر.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

تبني لقطة بـ `createSnapshot(shapes)`، أو بتحليل `drawtonomy.svg` محفوظ بـ `parseDrawtonomySvg(svg)`.

### 2. وحدات المُصدِّر

كل صيغة هدف هي دالة نقية منفصلة:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

تأخذ لقطة، وتُعيد سلسلة أو blob. لا وصول إلى المحرر، ولا DOM، ولا تبعيات غير متزامنة. المدخل نفسه، المخرج نفسه.

### 3. الدورة الكاملة

لـ Lanelet2، تُشحن SDK محللًا أيضًا:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

هذا ما يُشغّل تدفق [استيراد Lanelet2](/ar/guides/import-lanelet2/).

## لماذا الدوال النقية

يُشغّل المُصدِّر مسار الشيفرة نفسه في المتصفح، وفي نص CI لـ Node، وفي خط أنابيب على الخادم، وفي ملحق متصفح. تجري الاختبارات على ملفات لقطة ثابتة دون متصفح بدون رأس.

لهذا يعيش المُصدِّر في `@drawtonomy/sdk` وليس داخل المحرر — فالمحرر يعتمد على SDK، لا العكس.

## إضافة صيغة هدف

المُصدِّر هو نقطة التوسعة الرئيسية للأهداف الجديدة — CARLA وUnity وSUMO وDSL مخصصة. الوصفة:

1. أضف وحدة جديدة تحت `packages/drawtonomy-sdk/src/exporter/`.
2. خذ `DrawtonomySnapshot` كمدخل وأعد سلسلة أو blob.
3. أضف اختبارات تحت `packages/drawtonomy-sdk/__tests__/exporter/` باستخدام ملفات لقطة ثابتة.
4. وصل نقطة دخول لواجهة المستخدم إن أردت أن تعرف قائمة Export في المحرر بها (اختياري — كثير من المستخدمين سيستدعونها برمجيًا).

دليل المطوّر الكامل في المستودع العام: [دليل مطوّر المُصدِّر](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## انظر أيضًا

- [التصدير إلى OpenDRIVE / OpenSCENARIO / esmini](/ar/guides/export-asam/) — التدفق الذي يراه المستخدم.
- [نظرة عامة على `@drawtonomy/sdk`](/ar/reference/sdk/)
- [واجهة API لـ Exporter SDK](/ar/extend/exporter-sdk/)
