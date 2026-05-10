---
title: Exporter SDK
description: הוסיפו פורמט יעד חדש — CARLA, Unity, SUMO או כל דבר אחר.
keywords:
  - exporter SDK
  - הוספת פורמט יעד
  - יצוא לסימולטורים
  - drawtonomy SDK
  - לוח לבן לתרחישי נהיגה
  - מפתחי מייצא
  - יצוא מותאם אישית
---

המייצא הוא קבוצה של פונקציות טהורות מעל `DrawtonomySnapshot`.
הוספת פורמט יעד חדשה היא עצמאית: מודול חדש, כמה
בדיקות ו-hook UI אופציונלי.

עמוד זה הוא התמצאות מהירה. המדריך המלא — ארכיטקטורה,
API, דפוסי בדיקה, בדיקות ויזואליות של esmini — נמצא במאגר
הציבורי:

➡ **[מדריך מפתח המייצא](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## התחלה מהירה

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch mode
```

## מייצא חדש מינימלי

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Walk shapes, emit your format.
  return ''
}
```

```ts
// packages/drawtonomy-sdk/__tests__/exporter/my-format.test.ts
import { describe, it, expect } from 'vitest'
import { exportToMyFormat } from '../../src/exporter/my-format'
import { createSnapshot, createLane } from '../../src/index'

describe('my-format exporter', () => {
  it('emits expected payload for a single lane', () => {
    const snapshot = createSnapshot([createLane(/* ... */)])
    expect(exportToMyFormat(snapshot)).toContain('<expected/>')
  })
})
```

## שימוש בסצנה אמיתית כ-fixture

קבצי `drawtonomy.svg` עושים הלוך-ושוב דרך ה-SDK, כך שאתם
יכולים לכתוב סצנה בעורך ולהשתמש בה כקלט בדיקת
רגרסיה:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## ראו גם

- [ארכיטקטורת המייצא](/he/explanation/exporter-architecture/) —
  הצינור ולמה הוא טהור.
- [סקירת `@drawtonomy/sdk`](/he/reference/sdk/)
