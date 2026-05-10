---
title: صيغ التصدير المدعومة
description: ما يستطيع drawtonomy قراءته وكتابته.
---

| الصيغة | تصدير | استيراد | ملاحظات |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG قياسي. |
| **PNG** | ✓ | ✓ | تنقيط بدون فقد. |
| **JPG** | ✓ | ✓ | تنقيط مع فقد. |
| **PDF** | ✓ |  | متجه، يدعم الشفافية. |
| **EPS** | ✓ |  | متجه. **لا يدعم الشفافية** — استخدم PDF بدلًا منه. |
| **drawtonomy.svg** | ✓ | ✓ | قابل لإعادة التحرير: يحفظ الوصلات والنقاط المشتركة ومجموعات الآثار والنمط. |
| **OSM (Lanelet2)** | ✓ | ✓ | شبكات طرق [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | خريطة OccupancyGrid، صيغة ROS `map_server`. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **حزمة esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` معًا، جاهزة لـ `esmini`. |

## ما يُحفظ

| الميزة | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| الهندسة | ✓ | ✓ | ✓ | ✓ | ✓ |
| وصلات المسارات | ✓ | ✓ | ✓ | جزئيًا | – |
| النقاط المشتركة | ✓ | – | – | – | – |
| مجموعات الآثار | ✓ | – | – | جزئيًا | – |
| النمط (اللون، الشفافية) | ✓ | – | – | – | ✓ |
| دورة كاملة | ✓ | ✓ | – | – | – |

## انظر أيضًا

- [تصدير المشهد](/ar/guides/export/)
- [التصدير إلى OpenDRIVE / OpenSCENARIO / esmini](/ar/guides/export-asam/)
