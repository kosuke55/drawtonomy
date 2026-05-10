---
title: لوحة الألوان
description: مفاتيح ألوان drawtonomy وقيمها بصيغة HEX.
---

يستخدم drawtonomy لوحة بنمط Tailwind / Material: من grey-100 (الأفتح) إلى grey-900 (الأغمق)، بالإضافة إلى ألوان مسماة.

## التدرج الرمادي

| المفتاح | HEX | ملاحظات |
|---|---|---|
| `grey-100` | `#e6e6e6` | الأفتح. افتراضي لـ Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | افتراضي لـ Pedestrian (Walking وSimple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | الرمادي الأوسط. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | الأغمق. |

الرقم الأصغر = أفتح. وهذا يطابق اصطلاح Tailwind.

## القيم الافتراضية للقوالب

| القالب | اللون الافتراضي |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| الأشكال الأخرى | `black` |

## ضبط اللون برمجيًا

استخدم `resolveColor()` في SDK لتحويل مفتاح إلى قيمة HEX. راجع [واجهة API لـ Extension SDK](/ar/extend/extension-sdk/) للتفاصيل.
