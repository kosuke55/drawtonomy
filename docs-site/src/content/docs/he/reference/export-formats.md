---
title: פורמטי ייצוא נתמכים
description: מה drawtonomy יכול לקרוא ולכתוב.
keywords:
  - פורמטי ייצוא
  - פורמטי ייבוא
  - drawtonomy SVG OpenDRIVE
  - תאימות פורמטים
  - לוח לבן לתרחישי נהיגה
  - יצוא Lanelet2
  - יצוא esmini zip
---

| פורמט | ייצוא | ייבוא | הערות |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG סטנדרטי. |
| **PNG** | ✓ | ✓ | ראסטר ללא הפסד. |
| **JPG** | ✓ | ✓ | ראסטר עם הפסד. |
| **PDF** | ✓ |  | וקטורי, תומך בשקיפות. |
| **EPS** | ✓ |  | וקטורי. **ללא שקיפות** — השתמשו ב-PDF במקום. |
| **drawtonomy.svg** | ✓ | ✓ | בר-עריכה: שומר חיבורים, נקודות משותפות, קבוצות footprint, סגנון. |
| **OSM (Lanelet2)** | ✓ | ✓ | רשתות כבישים [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | מפת OccupancyGrid, פורמט `map_server` של ROS. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **חבילת esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` יחד, מוכנים ל-`esmini`. |

## מה נשמר

| פיצ'ר | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| גיאומטריה | ✓ | ✓ | ✓ | ✓ | ✓ |
| חיבורי נתיב | ✓ | ✓ | ✓ | חלקי | – |
| נקודות משותפות | ✓ | – | – | – | – |
| קבוצות footprint | ✓ | – | – | חלקי | – |
| סגנון (צבע, שקיפות) | ✓ | – | – | – | ✓ |
| הלוך-ושוב | ✓ | ✓ | – | – | – |

## ראו גם

- [ייצוא הסצנה שלכם](/he/guides/export/)
- [ייצוא ל-OpenDRIVE / OpenSCENARIO / esmini](/he/guides/export-asam/)
