---
title: นำเข้า ROS OccupancyGrid (.pgm + .yaml)
description: โหลด occupancy grid ของ ROS map_server (.pgm + .yaml) — สร้างด้วย nav2, Cartographer หรือ Gmapping — เข้า drawtonomy ในรูปเลเยอร์พื้นหลัง แล้วร่างเส้นทาง เลน และสิ่งกีดขวางทับ
keywords:
  - การกำกับข้อมูล ROS occupancy grid
  - โปรแกรมแก้ไขแผนที่ nav2
  - โปรแกรมดูแผนที่ cartographer
  - วาดบนแผนที่ pgm
  - เครื่องมือกำกับข้อมูลแผนที่ SLAM
---

drawtonomy เข้าใจรูปแบบ ROS `map_server` ที่ใช้โดย
[nav2](https://navigation.ros.org/), Cartographer, Gmapping
และเครื่องมือ SLAM ที่คล้ายกัน

![ROS occupancy grid ที่นำเข้า drawtonomy พร้อมลูกศรและชั้นวางที่วาดทับ](/img/ros-occupancy-grid.png)

ภาพหน้าจอแสดง occupancy grid ของคลังสินค้าจริง (เซลล์ที่ถูกครอบครอง
เป็นสีดำ เซลล์ว่างเป็นสีขาว) พร้อมเส้นทางและสิ่งกีดขวางที่วาด
ทับโดยตรงภายใน drawtonomy

## นำเข้า

1. เปิดเมนู **File** → **Import**
2. เลือก **ทั้งสอง** ไฟล์ `.pgm` และ `.yaml` ที่เข้าคู่กัน
   ในกล่องโต้ตอบไฟล์
3. drawtonomy อ่านเมทาดาทา YAML (ความละเอียด เกณฑ์) และ
   เรนเดอร์ตารางบนผืนผ้าใบ

หากเลือกเฉพาะ `.pgm` โดยไม่มี `.yaml` drawtonomy จะใช้
ค่าเริ่มต้น (`resolution = 0.05 m/px` และเกณฑ์ occupancy
มาตรฐาน)

## การลงสีเซลล์

| เซลล์ | สี |
|---|---|
| ถูกครอบครอง | ดำ |
| ว่าง | ขาว |
| ไม่ทราบ | เทา |

เซลล์เรนเดอร์ในขนาดที่ตรงกับมิติเลนของ drawtonomy จึงวาดเลน
เส้นทาง และรูปทรงทับได้โดยตรง — เหมือนภาพหน้าจอด้านบน

## เครื่องมือที่ทดสอบแล้ว

drawtonomy ใช้ได้กับแผนที่จาก nav2, Cartographer และ Gmapping
ผู้สร้างอื่น ๆ ควรใช้ได้หากผลิตคู่ไฟล์ `.pgm` + `.yaml`
มาตรฐานของ `map_server`

## ดูเพิ่มเติม

- [นำเข้าไฟล์ Lanelet2 (.osm)](/th/guides/import-lanelet2/)
