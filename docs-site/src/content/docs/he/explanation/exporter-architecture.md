---
title: ארכיטקטורת המייצא
description: איך קנבס הופך ל-snapshot, ו-snapshot הופך לקובץ.
keywords:
  - ארכיטקטורת מייצא
  - DrawtonomySnapshot
  - exporter API
  - יצוא OpenDRIVE
  - יצוא Lanelet2
  - לוח לבן לתרחישי נהיגה
  - exporter SDK
---

המייצא הוא הגשר בין נתונים בתוך-העורך של drawtonomy לבין
פורמטים חיצוניים — OpenDRIVE, OpenSCENARIO, Lanelet2 או כל
מה שתחברו הבא. הבנת הצינור היא הדרישה
המוקדמת להוספת פורמט יעד חדש.

## הצינור

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

snapshot הוא אובייקט פשוט: רשימה של צורות פלוס חותמת
גרסה וחותמת זמן. הוא ניתן לסריאליזציה, ללא הפניות DOM,
והוא הקלט היחיד שהמייצא לוקח.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

אתם בונים snapshot עם `createSnapshot(shapes)`, או על ידי ניתוח
`drawtonomy.svg` שמור עם `parseDrawtonomySvg(svg)`.

### 2. מודולי המייצא

כל פורמט יעד הוא פונקציה טהורה נפרדת:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

הם לוקחים snapshot, מחזירים מחרוזת או blob. ללא גישה לעורך,
ללא DOM, ללא תלויות אסינכרוניות. אותו קלט, אותו פלט.

### 3. הלוך-ושוב

ל-Lanelet2, ה-SDK גם מגיע עם פרסר:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

זה מה שמניע את זרימת [ייבוא ה-Lanelet2](/he/guides/import-lanelet2/).

## למה פונקציות טהורות

המייצא מריץ את אותו נתיב קוד בדפדפן, בסקריפט CI של Node,
בצינור צד שרת או בהרחבת דפדפן. בדיקות
רצות מול snapshot fixtures ללא דפדפן ללא ראש.

זאת הסיבה שהמייצא חי ב-`@drawtonomy/sdk` ולא בתוך
העורך — העורך תלוי ב-SDK, לא להפך.

## הוספת פורמט יעד

המייצא הוא נקודת ההרחבה העיקרית ליעדים חדשים — CARLA,
Unity, SUMO, DSLs מותאמים אישית. המתכון:

1. הוסיפו מודול חדש תחת `packages/drawtonomy-sdk/src/exporter/`.
2. קחו `DrawtonomySnapshot` פנימה, החזירו מחרוזת או blob.
3. הוסיפו בדיקות תחת `packages/drawtonomy-sdk/__tests__/exporter/`
   באמצעות snapshot fixtures.
4. חברו נקודת כניסה ל-UI אם תרצו שתפריט הייצוא של העורך
   יידע עליו (אופציונלי — הרבה משתמשים יקראו לו
   פרוגרמטית).

מדריך המפתח המלא במאגר הציבורי:
[מדריך מפתח המייצא](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## ראו גם

- [ייצוא ל-OpenDRIVE / OpenSCENARIO / esmini](/he/guides/export-asam/) —
  הזרימה הפונה למשתמש.
- [סקירת `@drawtonomy/sdk`](/he/reference/sdk/)
- [API של SDK המייצא](/he/extend/exporter-sdk/)
