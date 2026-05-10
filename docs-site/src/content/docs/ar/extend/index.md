---
title: توسيع drawtonomy
description: ابنِ الإضافات وأضف صيغ الأهداف وساهم بالقوالب.
sidebar:
  order: 0
---

drawtonomy مبني ليُوسَّع. ‏SDK نفسها التي تشغّل الإضافات الداخلية (AI Scene Generator وTemplate Preview وExporter Playground) هي ما تستخدمه أنت.

## اختر نقطة التوسعة المناسبة

| تريد أن... | اقرأ |
|---|---|
| تضيف لوحة أو مولّدًا أو أداة تعمل بجانب المحرر | [Extension SDK](/ar/extend/extension-sdk/) |
| تضيف صيغة تصدير جديدة (CARLA أو Unity أو SUMO...) | [Exporter SDK](/ar/extend/exporter-sdk/) |
| تساهم بقالب SVG جديد (مركبة أو مشاة أو إشارة) | [القوالب](/ar/extend/templates/) |

## أين تعيش الشيفرة المصدرية

كل شيء في [مستودع drawtonomy العام على GitHub](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — الـ SDK
- `packages/drawtonomy-dev-server/` — محرر محلي للتطوير
- `extensions/` — إضافات داخلية، مفيدة كمراجع
- `templates/` — قوالب الأشكال المدمجة

طلبات السحب (PRs) مرحَّب بها. يستعرض [دليل القوالب](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md) إضافة شكل مخصص من البداية إلى النهاية.
