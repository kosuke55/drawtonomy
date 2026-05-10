---
title: הרחבת drawtonomy
description: בנו הרחבות, הוסיפו פורמטי יעד, תרמו תבניות.
sidebar:
  order: 0
keywords:
  - הרחבת drawtonomy
  - SDK של drawtonomy
  - מפתחי הרחבות
  - תבניות מותאמות אישית
  - לוח לבן לתרחישי נהיגה
  - exporter SDK
  - extension SDK
---

drawtonomy בנוי כך שניתן יהיה להרחיב אותו. אותו SDK שמניע את
ההרחבות שב-tree (מחולל סצנות AI, Template Preview, Exporter
Playground) הוא מה שאתם משתמשים בו.

## בחרו את נקודת ההרחבה שלכם

| אתם רוצים… | קראו |
|---|---|
| להוסיף פאנל, מחולל או כלי שרץ לצד העורך | [Extension SDK](/he/extend/extension-sdk/) |
| להוסיף יעד ייצוא חדש (CARLA, Unity, SUMO, …) | [Exporter SDK](/he/extend/exporter-sdk/) |
| לתרום תבנית SVG חדשה (רכב, הולך רגל, תמרור) | [תבניות](/he/extend/templates/) |

## איפה המקור גר

הכל ב-
[מאגר drawtonomy הציבורי ב-GitHub](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — ה-SDK
- `packages/drawtonomy-dev-server/` — עורך מקומי לפיתוח
- `extensions/` — הרחבות in-tree, שימושיות כהפניות
- `templates/` — תבניות צורות מובנות

PR-ים מתקבלים בברכה.
[מדריך התבניות](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
מעביר אתכם דרך הוספת צורה מותאמת אישית מקצה לקצה.
