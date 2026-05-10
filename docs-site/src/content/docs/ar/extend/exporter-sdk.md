---
title: Exporter SDK
description: أضف صيغة هدف جديدة — CARLA أو Unity أو SUMO أو أي شيء آخر.
---

المُصدِّر مجموعة من الدوال النقية فوق `DrawtonomySnapshot`. إضافة صيغة هدف جديدة عمل قائم بذاته: وحدة جديدة، وبضعة اختبارات، وخطاف اختياري لواجهة المستخدم.

هذه الصفحة توجيه سريع. الدليل الكامل — البنية وواجهة API وأنماط الاختبار وفحوص esmini البصرية — في المستودع العام:

➡ **[دليل مطوّر المُصدِّر](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## بدء سريع

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # وضع المراقبة
```

## مُصدِّر جديد بحدّ أدنى

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // امرّ على الأشكال وأخرج صيغتك.
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

## استخدم مشهدًا حقيقيًا كملف اختبار

تمرّ ملفات `drawtonomy.svg` عبر SDK في دورة كاملة، فيمكنك تأليف مشهد في المحرر واستخدامه كمدخل اختبار انحدار:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## انظر أيضًا

- [بنية المُصدِّر](/ar/explanation/exporter-architecture/) — خط الأنابيب ولماذا هو نقي.
- [نظرة عامة على `@drawtonomy/sdk`](/ar/reference/sdk/)
