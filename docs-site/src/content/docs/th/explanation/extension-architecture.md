---
title: สถาปัตยกรรมส่วนขยาย
description: drawtonomy โหลด แยก และสื่อสารกับส่วนขยายของบุคคลที่สามอย่างไร
---

ส่วนขยายของ drawtonomy ไม่ใช่ปลั๊กอินที่คอมไพล์เข้าโปรแกรม
แก้ไข แต่เป็นเว็บแอปแยกที่โหลดเข้า iframe และสื่อสารกับโฮสต์
ผ่าน `postMessage` หน้านี้อธิบายเหตุผลและสิ่งที่ตามมาจาก
การเลือกนั้น

## การโหลด

ส่วนขยายคือ URL ที่ชี้ไปยัง `manifest.json` ผู้ใช้ (หรือ
deep-link) เปิดโปรแกรมแก้ไขด้วย `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

โปรแกรมแก้ไขดึง manifest สร้าง iframe และโหลด HTML จุดเข้า
ของส่วนขยาย โหลดส่วนขยายหลายตัวพร้อมกันได้ด้วยพารามิเตอร์
`?ext=` ซ้ำ

## การแยก

ส่วนขยายทำงานใน iframe ที่มี origin ของตนเอง ไม่สามารถ:

- แตะ DOM ของโปรแกรมแก้ไขโดยตรง
- อ่าน localStorage ของ drawtonomy
- โหลดทรัพยากรเกิน CSP ของโฮสต์

ทำได้เฉพาะสิ่งที่ขอใน array `capabilities` ของ manifest
(`shapes:read`, `shapes:write`, `ui:panel` …) และสิ่งที่
`postMessage` เปิดผ่าน `ExtensionClient` ของ
`@drawtonomy/sdk`

นี่เป็นความตั้งใจ ส่วนขยายเป็นโค้ดของบุคคลที่สาม โปรแกรม
แก้ไขถือว่าไม่น่าเชื่อถือ

## การสื่อสาร

SDK ห่อหุ้ม `postMessage` ใน `ExtensionClient` ที่ให้ API
แบบ typed และ promise:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

ภายใต้ฉาก:

- ส่วนขยายส่งคำขอไปยัง iframe โฮสต์
- โฮสต์ตรวจสอบกับ capabilities ของส่วนขยาย
- โฮสต์ตอบกลับ หรือคำขอถูกปฏิเสธ

## ทำไม iframe

ทางเลือก — ปลั๊กอินสไตล์ npm, Webpack module federation,
สคริปต์ในกระบวนการ — ล้วนต้องเชื่อใจโค้ดของส่วนขยายในโปรแกรม
แก้ไข และยังผูกอายุของส่วนขยายเข้ากับการ build ของโปรแกรม
แก้ไข

iframe ให้:

- **การแยก origin** ที่บังคับโดยเบราว์เซอร์ — ไม่ต้องดูแล
  JS sandbox
- **วงรอบการ deploy อิสระ** — ส่วนขยาย ship ตามจังหวะของตน
- **Framework ใดก็ได้** — React, Vue, Svelte, vanilla JS
  โฮสต์ไม่สนใจ
- **โค้ดเดียวกันใน dev และ prod** — dev server โฮสต์โปรแกรม
  แก้ไขที่ `localhost:3000` ชี้ไปที่ส่วนขยายที่ `localhost:3001`
  flag `?ext=` เดียวกัน โปรโตคอลเดียวกัน

ข้อแลกเปลี่ยนคือ `postMessage` เป็นแบบ async การเรียกที่ดู
ฟรี (`getShapes()`) มีค่าใช้จ่าย iframe round-trip SDK batch
และ cache ที่ทำได้ อย่าวางการเรียกในลูปแน่น

## การพัฒนาในเครื่อง

แพ็กเกจ `@drawtonomy/dev-server` เสิร์ฟโปรแกรมแก้ไขใน
เครื่อง เพื่อให้พัฒนาโดยไม่ต้องผ่านเครือข่าย:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # โปรแกรมแก้ไขที่ :3000
cd my-extension && pnpm dev --port 3001        # ส่วนขยายที่ :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

คู่มือเต็มอยู่ในรีโป public:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)

## ดูเพิ่มเติม

- [API ของ Extension SDK](/th/extend/extension-sdk/)
- [ภาพรวม `@drawtonomy/sdk`](/th/reference/sdk/)
