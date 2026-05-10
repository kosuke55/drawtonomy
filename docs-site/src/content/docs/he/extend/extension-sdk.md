---
title: Extension SDK
description: בנו הרחבות iframe עם @drawtonomy/sdk ו-@drawtonomy/dev-server.
keywords:
  - extension SDK
  - בניית הרחבות
  - iframe drawtonomy
  - dev server
  - ExtensionClient
  - לוח לבן לתרחישי נהיגה
  - דוגמאות הרחבה
---

הרחבות drawtonomy הן אפליקציות web מארחות-iframe שמדברות
עם העורך דרך `postMessage`. ה-SDK נותן לכם לקוח מוקלד;
ה-dev-server נותן לכם עורך מקומי לפתח מולו.

עמוד זה הוא התמצאות מהירה. המדריך המלא — סכמת
manifest, רשימת capabilities, פרוטוקול הודעות — נמצא במאגר
הציבורי:

➡ **[מדריך פיתוח הרחבות](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## התחלה מהירה

```bash
# Editor on :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Your extension on :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## הרחבה מינימלית

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

## הרחבות הפניה

ההרחבות in-tree הן דוגמאות בנאמנות מלאה:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — יצירת סצנה משפה טבעית ומ-OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — תצוגה מקדימה של תבנית צורה.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — הפעלת המייצא מול קנבס חי.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — ניסויים ב-Path Footprint.

## ראו גם

- [ארכיטקטורת ההרחבות](/he/explanation/extension-architecture/) —
  למה iframes, למה postMessage.
- [סקירת `@drawtonomy/sdk`](/he/reference/sdk/) — החבילה
  והמודולים שלה.
