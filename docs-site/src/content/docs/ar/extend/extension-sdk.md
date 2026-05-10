---
title: Extension SDK
description: ابنِ إضافات iframe باستخدام @drawtonomy/sdk و@drawtonomy/dev-server.
---

إضافات drawtonomy تطبيقات ويب مستضافة في iframe تتواصل مع المحرر عبر `postMessage`. تمنحك SDK عميلًا بأنواع؛ ويمنحك خادم التطوير محررًا محليًا للتطوير مقابله.

هذه الصفحة توجيه سريع. الدليل الكامل — مخطط البيان وقائمة القدرات وبروتوكول الرسائل — في المستودع العام:

➡ **[دليل تطوير الإضافات](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## بدء سريع

```bash
# المحرر على :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# إضافتك على :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## إضافة بحدّ أدنى

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

## إضافات مرجعية

الإضافات الداخلية أمثلة كاملة الدقة:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — توليد المشاهد من اللغة الطبيعية وOpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — معاينة قالب شكل.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — اختبار المُصدِّر مقابل لوحة حية.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — تجارب Path Footprint.

## انظر أيضًا

- [بنية الإضافات](/ar/explanation/extension-architecture/) — لماذا iframes ولماذا postMessage.
- [نظرة عامة على `@drawtonomy/sdk`](/ar/reference/sdk/) — الحزمة ووحداتها.
