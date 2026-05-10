---
title: פלטת צבעים
description: מפתחות הצבע של drawtonomy וערכי ה-HEX שלהם.
keywords:
  - פלטת צבעים drawtonomy
  - ערכי HEX
  - צבעי גווני אפור
  - לוח לבן לתרחישי נהיגה
  - סגנון צורות
  - פלטת Tailwind
---

drawtonomy משתמש בפלטה בסגנון Tailwind / Material: grey-100 (הבהיר ביותר)
עד grey-900 (הכהה ביותר), פלוס צבעים בעלי שם.

## גווני אפור

| מפתח | HEX | הערות |
|---|---|---|
| `grey-100` | `#e6e6e6` | הבהיר ביותר. ברירת מחדל ל-Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | ברירת מחדל ל-Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | אפור אמצעי. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | הכהה ביותר. |

מספר נמוך יותר = בהיר יותר. זה תואם את המוסכמה של Tailwind.

## ברירות מחדל לתבניות

| תבנית | צבע ברירת מחדל |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| צורות אחרות | `black` |

## הגדרת צבע פרוגרמטית

השתמשו ב-`resolveColor()` של ה-SDK להמרת מפתח לערך HEX. ראו
את [API של SDK ההרחבות](/he/extend/extension-sdk/) לפרטים.
