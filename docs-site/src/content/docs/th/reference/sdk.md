---
title: 'ภาพรวม @drawtonomy/sdk'
description: แพ็กเกจ จุดเข้าใช้งาน และวิธีที่ SDK ทำงานร่วมกับโปรแกรมแก้ไข
---

`@drawtonomy/sdk` คือแพ็กเกจที่ผู้สร้างส่วนขยายและเครื่องมือ
แบบ headless ใช้เป็นเป้าหมาย โดยเปิดให้ใช้:

| โมดูล | วัตถุประสงค์ |
|---|---|
| `ExtensionClient` | ไคลเอนต์ postMessage สำหรับส่วนขยายที่ host ใน iframe |
| ฟังก์ชัน factory ของรูปทรง | `createLane()`, `createVehicle()` ฯลฯ |
| `createSnapshot()` | สร้าง `DrawtonomySnapshot` จากอาร์เรย์ของรูปทรง |
| `exporter.*` | ฟังก์ชันบริสุทธิ์ที่เปลี่ยน snapshot เป็น OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM รวม parser ของ Lanelet2 |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## การติดตั้ง

```bash
pnpm add @drawtonomy/sdk
```

## แพ็กเกจที่เกี่ยวข้อง

| แพ็กเกจ | วัตถุประสงค์ |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | ตัว SDK เอง |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | dev server ในเครื่องที่โฮสต์โปรแกรมแก้ไขสำหรับการพัฒนาส่วนขยาย |

## ซอร์สโค้ด

ซอร์สโค้ด เทสต์ และตัวอย่างของ SDK อยู่ใน
[คลัง GitHub ของ drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk)

## ดูเพิ่มเติม

- [API ของ Extension SDK](/th/extend/extension-sdk/) — สร้าง
  ส่วนขยาย iframe
- [API ของ Exporter SDK](/th/extend/exporter-sdk/) — เพิ่มรูปแบบ
  เป้าหมายใหม่
