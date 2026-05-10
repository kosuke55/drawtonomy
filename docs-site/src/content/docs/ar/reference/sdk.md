---
title: 'نظرة عامة على @drawtonomy/sdk'
description: الحزم ونقاط الدخول وكيف تتلاءم SDK مع المحرر.
---

`@drawtonomy/sdk` هي الحزمة التي يبني عليها مؤلفو الإضافات والأدوات بدون رأس (headless). تكشف:

| الوحدة | الغرض |
|---|---|
| `ExtensionClient` | عميل postMessage للإضافات المستضافة في iframe. |
| دوال صانعة للأشكال | `createLane()` و`createVehicle()` وغيرها. |
| `createSnapshot()` | يبني `DrawtonomySnapshot` من مصفوفة أشكال. |
| `exporter.*` | دوال نقية تحوّل لقطة إلى OpenDRIVE / OpenSCENARIO / حزمة esmini zip / Lanelet2 OSM. تتضمن محلل Lanelet2. |
| الأنواع | `BaseShape` و`LaneShape` و`VehicleShape` و`DrawtonomySnapshot` وغيرها. |

## التثبيت

```bash
pnpm add @drawtonomy/sdk
```

## الحزم المرافقة

| الحزمة | الغرض |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | الـ SDK نفسها. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | خادم تطوير محلي يستضيف المحرر لتطوير الإضافات. |

## المصدر

شيفرة SDK واختباراتها وأمثلتها في [مستودع drawtonomy على GitHub](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## انظر أيضًا

- [واجهة API لـ Extension SDK](/ar/extend/extension-sdk/) — بناء إضافات iframe.
- [واجهة API لـ Exporter SDK](/ar/extend/exporter-sdk/) — إضافة صيغ أهداف جديدة.
