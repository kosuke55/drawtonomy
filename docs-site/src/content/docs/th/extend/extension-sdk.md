---
title: Extension SDK
description: สร้างส่วนขยาย iframe ด้วย @drawtonomy/sdk และ @drawtonomy/dev-server
---

ส่วนขยายของ drawtonomy เป็นเว็บแอปที่ host ใน iframe และ
สื่อสารกับโปรแกรมแก้ไขผ่าน `postMessage` SDK ให้ไคลเอนต์
แบบ typed dev-server ให้โปรแกรมแก้ไขในเครื่องเพื่อพัฒนา

หน้านี้คือการแนะนำอย่างรวดเร็ว คู่มือเต็ม — schema ของ
manifest รายการ capabilities โปรโตคอลข้อความ — อยู่ในรีโป public:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## เริ่มต้นอย่างรวดเร็ว

```bash
# โปรแกรมแก้ไขที่ :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# ส่วนขยายของคุณที่ :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## ส่วนขยายขั้นต่ำ

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## ส่วนขยายอ้างอิง

ส่วนขยายในตัวเป็นตัวอย่างเต็มรูปแบบ:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — การสร้างฉากจากภาษาธรรมชาติและ OpenSCENARIO
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — แสดงตัวอย่างเทมเพลตรูปทรง
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — ทดลองตัวส่งออกกับผืนผ้าใบที่ใช้งานอยู่
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — การทดลอง Path Footprint

## ดูเพิ่มเติม

- [สถาปัตยกรรมส่วนขยาย](/th/explanation/extension-architecture/) —
  ทำไม iframe และ postMessage
- [ภาพรวม `@drawtonomy/sdk`](/th/reference/sdk/) — แพ็กเกจและ
  โมดูล
