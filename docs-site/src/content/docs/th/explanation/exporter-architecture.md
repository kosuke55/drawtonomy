---
title: สถาปัตยกรรมตัวส่งออก
description: ผืนผ้าใบกลายเป็น snapshot และ snapshot กลายเป็นไฟล์อย่างไร
---

ตัวส่งออกคือสะพานระหว่างข้อมูลในโปรแกรมแก้ไขของ drawtonomy
และรูปแบบภายนอก — OpenDRIVE, OpenSCENARIO, Lanelet2 หรือ
อะไรก็ตามที่คุณเสียบเพิ่ม การเข้าใจ pipeline เป็นเงื่อนไข
สำหรับการเพิ่มรูปแบบเป้าหมายใหม่

## Pipeline

```
สถานะของ Editor ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                     (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

snapshot คืออ็อบเจกต์ธรรมดา: รายการรูปทรงพร้อม version
และ timestamp ทำเป็น serialize ได้ ไม่มีการอ้างอิง DOM และ
เป็นอินพุตเดียวที่ตัวส่งออกรับ

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

สร้าง snapshot ด้วย `createSnapshot(shapes)` หรือโดย parse
ไฟล์ `drawtonomy.svg` ที่บันทึกไว้ด้วย
`parseDrawtonomySvg(svg)`

### 2. โมดูลตัวส่งออก

แต่ละรูปแบบเป้าหมายเป็นฟังก์ชันบริสุทธิ์แยก:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

รับ snapshot คืนค่าเป็น string หรือ blob ไม่มีการเข้าถึง
โปรแกรมแก้ไข ไม่มี DOM ไม่มี dependency แบบ async อินพุต
เดียวกัน เอาต์พุตเดียวกัน

### 3. Round-trip

สำหรับ Lanelet2 SDK ส่ง parser มาด้วย:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

นี่เป็นสิ่งที่ขับเคลื่อนกระบวนการ
[นำเข้า Lanelet2](/th/guides/import-lanelet2/)

## ทำไมเป็นฟังก์ชันบริสุทธิ์

ตัวส่งออกรันโค้ดเดียวกันในเบราว์เซอร์ ในสคริปต์ Node CI
ใน pipeline ฝั่งเซิร์ฟเวอร์ หรือในส่วนขยายเบราว์เซอร์
เทสต์รันกับ snapshot fixture โดยไม่มีเบราว์เซอร์ headless

นี่คือเหตุผลที่ตัวส่งออกอยู่ใน `@drawtonomy/sdk` ไม่ใช่ใน
โปรแกรมแก้ไข — โปรแกรมแก้ไขขึ้นอยู่กับ SDK ไม่ใช่ในทางกลับกัน

## การเพิ่มรูปแบบเป้าหมาย

ตัวส่งออกเป็นจุดต่อขยายหลักสำหรับเป้าหมายใหม่ — CARLA, Unity,
SUMO, DSL ที่กำหนดเอง สูตร:

1. เพิ่มโมดูลใหม่ใต้ `packages/drawtonomy-sdk/src/exporter/`
2. รับ `DrawtonomySnapshot` คืนค่าเป็น string หรือ blob
3. เพิ่มเทสต์ใต้ `packages/drawtonomy-sdk/__tests__/exporter/`
   โดยใช้ snapshot fixture
4. เชื่อมจุดเข้า UI หากต้องการให้เมนู Export ของโปรแกรมแก้ไข
   รู้จัก (ไม่บังคับ — ผู้ใช้หลายคนจะเรียกเชิงโปรแกรม)

คู่มือนักพัฒนาเต็มอยู่ในรีโป public:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)

## ดูเพิ่มเติม

- [ส่งออกเป็น OpenDRIVE / OpenSCENARIO / esmini](/th/guides/export-asam/) —
  กระบวนการที่ผู้ใช้เห็น
- [ภาพรวม `@drawtonomy/sdk`](/th/reference/sdk/)
- [API ของ Exporter SDK](/th/extend/exporter-sdk/)
