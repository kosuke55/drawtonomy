---
title: รูปแบบส่งออกที่รองรับ
description: สิ่งที่ drawtonomy อ่านและเขียนได้
---

| รูปแบบ | ส่งออก | นำเข้า | หมายเหตุ |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG มาตรฐาน |
| **PNG** | ✓ | ✓ | รัสเตอร์แบบไร้สูญเสีย |
| **JPG** | ✓ | ✓ | รัสเตอร์แบบสูญเสียข้อมูล |
| **PDF** | ✓ |  | เวกเตอร์ รองรับความโปร่งใส |
| **EPS** | ✓ |  | เวกเตอร์ **ไม่รองรับความโปร่งใส** — ใช้ PDF แทน |
| **drawtonomy.svg** | ✓ | ✓ | กลับมาแก้ไขได้: เก็บการเชื่อมต่อ จุดร่วม กลุ่ม footprint และสไตล์ |
| **OSM (Lanelet2)** | ✓ | ✓ | เครือข่ายถนน [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) |
| **PGM + YAML (ROS)** |  | ✓ | แผนที่ OccupancyGrid รูปแบบ ROS `map_server` |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8 |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3 |
| **ไฟล์ esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` รวมกัน พร้อมใช้กับ `esmini` |

## สิ่งที่ถูกเก็บรักษา

| ฟีเจอร์ | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| รูปทรง | ✓ | ✓ | ✓ | ✓ | ✓ |
| การเชื่อมต่อเลน | ✓ | ✓ | ✓ | บางส่วน | – |
| จุดร่วม | ✓ | – | – | – | – |
| กลุ่ม footprint | ✓ | – | – | บางส่วน | – |
| สไตล์ (สี ความทึบ) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## ดูเพิ่มเติม

- [ส่งออกฉาก](/th/guides/export/)
- [ส่งออกเป็น OpenDRIVE / OpenSCENARIO / esmini](/th/guides/export-asam/)
