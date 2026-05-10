---
title: 'סקירת @drawtonomy/sdk'
description: חבילות, נקודות כניסה ואיך ה-SDK משתלב עם העורך.
keywords:
  - drawtonomy SDK
  - חבילת npm drawtonomy
  - exporter API
  - חבילת הרחבות
  - לוח לבן לתרחישי נהיגה
  - dev server drawtonomy
---

`@drawtonomy/sdk` היא החבילה שיוצרי הרחבות וכלים
ללא ראש בונים מולה. היא חושפת:

| מודול | מטרה |
|---|---|
| `ExtensionClient` | לקוח postMessage להרחבות מארחות-iframe. |
| פונקציות factory לצורות | `createLane()`, `createVehicle()` וכו'. |
| `createSnapshot()` | בניית `DrawtonomySnapshot` ממערך של צורות. |
| `exporter.*` | פונקציות טהורות שהופכות snapshot ל-OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM. כולל פרסר Lanelet2. |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## התקנה

```bash
pnpm add @drawtonomy/sdk
```

## חבילות נלוות

| חבילה | מטרה |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | ה-SDK עצמו. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | שרת dev מקומי שמארח את העורך לפיתוח הרחבות. |

## מקור

מקור ה-SDK, הבדיקות והדוגמאות נמצאים ב-
[מאגר drawtonomy ב-GitHub](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## ראו גם

- [API של SDK ההרחבות](/he/extend/extension-sdk/) — בניית הרחבות
  iframe.
- [API של SDK המייצא](/he/extend/exporter-sdk/) — הוספת פורמטי
  יעד חדשים.
