---
title: การขยาย drawtonomy
description: สร้างส่วนขยาย เพิ่มรูปแบบเป้าหมาย มีส่วนร่วมในเทมเพลต
sidebar:
  order: 0
---

drawtonomy ถูกสร้างมาให้ขยายได้ SDK เดียวกันที่ขับเคลื่อน
ส่วนขยายในตัว (AI Scene Generator, Template Preview, Exporter
Playground) คือสิ่งที่คุณใช้

## เลือกจุดต่อขยาย

| ต้องการ… | อ่าน |
|---|---|
| เพิ่มพาเนล ตัวสร้าง หรือเครื่องมือที่ทำงานเคียงข้างโปรแกรมแก้ไข | [Extension SDK](/th/extend/extension-sdk/) |
| เพิ่มเป้าหมายส่งออกใหม่ (CARLA, Unity, SUMO …) | [Exporter SDK](/th/extend/exporter-sdk/) |
| มีส่วนร่วมในเทมเพลต SVG ใหม่ (ยานพาหนะ คนเดินเท้า ป้าย) | [เทมเพลต](/th/extend/templates/) |

## ที่อยู่ของซอร์สโค้ด

ทุกอย่างอยู่ใน
[คลัง GitHub สาธารณะของ drawtonomy](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — โปรแกรมแก้ไขในเครื่อง
  สำหรับการพัฒนา
- `extensions/` — ส่วนขยายในตัว ใช้เป็นข้อมูลอ้างอิง
- `templates/` — เทมเพลตรูปทรงในตัว

ยินดีรับ PR คู่มือ
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
พาผ่านการเพิ่มรูปทรงที่กำหนดเองตั้งแต่ต้นจนจบ
