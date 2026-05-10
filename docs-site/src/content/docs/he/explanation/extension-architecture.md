---
title: ארכיטקטורת ההרחבות
description: איך drawtonomy טוען, מבודד ומדבר עם הרחבות צד-שלישי.
keywords:
  - ארכיטקטורת הרחבות
  - iframe drawtonomy
  - postMessage SDK
  - ExtensionClient
  - לוח לבן לתרחישי נהיגה
  - dev server drawtonomy
  - בידוד הרחבות
---

הרחבות drawtonomy אינן תוספים שמהודרים לתוך העורך.
הם אפליקציות web נפרדות שנטענות לתוך iframe, ומתקשרות
עם המארח דרך `postMessage`. עמוד זה מסביר למה,
ומה נופל מהבחירה הזאת.

## טעינה

הרחבה היא URL שמצביע על `manifest.json`. המשתמש (או
deep-link) פותח את העורך עם `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

העורך מושך את ה-manifest, יוצר iframe וטוען את
ה-HTML של נקודת הכניסה של ההרחבה. אפשר לטעון מספר הרחבות בו זמנית
עם פרמטרי `?ext=` חוזרים.

## בידוד

הרחבות רצות בתוך iframe עם המקור (origin) שלהן. הן
לא יכולות:

- לגעת ב-DOM של העורך ישירות.
- לקרוא את localStorage של drawtonomy.
- לטעון משאבים מעבר ל-CSP של המארח.

הן יכולות לעשות את מה שהן מבקשות במערך ה-`capabilities`
של ה-manifest (`shapes:read`, `shapes:write`, `ui:panel`, …) ומה
ש-`postMessage` חושף דרך ה-`ExtensionClient` של
`@drawtonomy/sdk`.

זה בכוונה. הרחבות הן קוד צד-שלישי; העורך
מתייחס אליהן כלא-אמינות.

## תקשורת

ה-SDK עוטף את `postMessage` ב-`ExtensionClient` שנותן לכם
API מוקלד מבוסס promise:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

מתחת למכסה המנוע:

- ההרחבה שולחת בקשה ל-iframe המארח.
- המארח מאמת מול היכולות של ההרחבה.
- המארח עונה, או הבקשה נדחית.

## למה iframes

החלופות — תוספים בסגנון npm, Webpack module federation,
סקריפטים בתוך התהליך — כולן דורשות לסמוך על קוד
ההרחבה עם העורך שלכם. הן גם צמודות מחזורי חיים של הרחבות
לבילד של העורך.

iframes נותנים לכם:

- **בידוד מקור**, נאכף-דפדפן — אין JS sandbox
  לתחזק.
- **מחזורי deploy עצמאיים** — הרחבות נשלחות בקצב
  שלהן.
- **כל framework** — React, Vue, Svelte, vanilla JS;
  המארח לא אכפת לו.
- **אותו קוד ב-dev וב-prod** — שרת ה-dev מארח את העורך
  ב-`localhost:3000`; אתם מצביעים עליו על ההרחבה שלכם
  ב-`localhost:3001`. אותו דגל `?ext=`, אותו פרוטוקול.

ההתפשרות היא ש-`postMessage` הוא אסינכרוני. קריאות שנראות
חופשיות (`getShapes()`) עולות סבב iframe. ה-SDK מתאחד
ושומר במטמון איפה שהוא יכול; אל תכניסו קריאה ללולאה הדוקה.

## פיתוח מקומי

חבילת `@drawtonomy/dev-server` מגישה את העורך מקומית כך
שתוכלו לפתח מולו ללא סבב רשת:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor on :3000
cd my-extension && pnpm dev --port 3001        # extension on :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

המדריך המלא במאגר הציבורי:
[מדריך פיתוח הרחבות](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## ראו גם

- [API של SDK ההרחבות](/he/extend/extension-sdk/)
- [סקירת `@drawtonomy/sdk`](/he/reference/sdk/)
