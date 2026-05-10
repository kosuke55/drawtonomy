---
title: بنية الإضافات
description: كيف يحمّل drawtonomy الإضافات الخارجية ويعزلها ويتواصل معها.
---

إضافات drawtonomy ليست ملحقات (plugins) مُجمَّعة في المحرر. إنها تطبيقات ويب منفصلة تُحمَّل في iframe، وتتواصل مع المضيف عبر `postMessage`. توضح هذه الصفحة لماذا، وما الذي يترتب على هذا الاختيار.

## التحميل

الإضافة عبارة عن رابط يشير إلى `manifest.json`. يفتح المستخدم (أو رابط عميق) المحرر بـ `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

يجلب المحرر البيان (manifest)، وينشئ iframe، ويُحمّل HTML نقطة دخول الإضافة. يمكن تحميل عدة إضافات في نفس الوقت بمعاملات `?ext=` متكررة.

## العزل

تعمل الإضافات داخل iframe بمصدر (origin) خاص بها. لا يمكنها:

- لمس DOM الخاص بالمحرر مباشرة.
- قراءة localStorage الخاص بـ drawtonomy.
- تحميل موارد خارج CSP الخاص بالمضيف.

تستطيع فعل ما تطلبه في مصفوفة `capabilities` في البيان (`shapes:read` و`shapes:write` و`ui:panel` ...) وما تكشفه `postMessage` عبر `ExtensionClient` في `@drawtonomy/sdk`.

هذا متعمَّد. الإضافات شيفرة من طرف ثالث؛ يعاملها المحرر كغير موثوقة.

## التواصل

تغلّف SDK `postMessage` في `ExtensionClient` يمنحك واجهة API بأنواع وُعود (Promises):

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

في الخلفية:

- تُرسل الإضافة طلبًا إلى iframe المضيف.
- يتحقق المضيف من قدرات الإضافة.
- يستجيب المضيف، أو يُرفض الطلب.

## لماذا iframes

البدائل — ملحقات بنمط npm، أو module federation في Webpack، أو نصوص داخل العملية — كلها تتطلب الثقة بشيفرة الإضافة في محررك. كما تربط دورات حياة الإضافات ببناء المحرر.

تمنحك iframes:

- **عزل المصدر**، يفرضه المتصفح — لا حاجة إلى صندوق رمل JS للصيانة.
- **دورات نشر مستقلة** — تُشحَن الإضافات بوتيرتها الخاصة.
- **أي إطار عمل** — React أو Vue أو Svelte أو JS عادي؛ لا يهتم المضيف.
- **الشيفرة نفسها في التطوير والإنتاج** — يستضيف خادم التطوير المحرر على `localhost:3000`؛ توجّهه إلى إضافتك على `localhost:3001`. علامة `?ext=` نفسها، البروتوكول نفسه.

المقايضة هي أن `postMessage` غير متزامنة. الاستدعاءات التي تبدو مجانية (`getShapes()`) تكلّف رحلة ذهاب وإياب لـ iframe. تُجمّع SDK وتُخزّن النتائج حيث يمكن؛ لا تضع استدعاءً داخل حلقة محكمة.

## التطوير المحلي

تخدم حزمة `@drawtonomy/dev-server` المحرر محليًا لتتمكن من التطوير مقابلها دون رحلة شبكة:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # المحرر على :3000
cd my-extension && pnpm dev --port 3001        # الإضافة على :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

الدليل الكامل في المستودع العام: [دليل تطوير الإضافات](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## انظر أيضًا

- [واجهة API لـ Extension SDK](/ar/extend/extension-sdk/)
- [نظرة عامة على `@drawtonomy/sdk`](/ar/reference/sdk/)
