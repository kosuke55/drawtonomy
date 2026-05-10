---
title: Snap och punktdelning
description: Två relaterade men olika mekanismer för att hålla former linjerade.
---

Snap och punktdelning hanterar båda "den här punkten ska gå på den
saken." De ser likadana ut i UI:t, men de har olika konsekvenser.
Att blanda ihop dem är den vanligaste källan till buggar av typen
"varför drev mina former isär?".

## Snap = samma koordinat

Snapping flyttar din markör (eller ett hörn du drar) till att
landa på ett befintligt mål. Resultatet är två distinkta punkter
som *råkar* dela koordinater.

Flytta originalmålet senare och din snappade punkt följer inte
med. De var aldrig länkade.

Det här är vad du vill ha när du skissar: precis linjering, ingen
dold koppling.

## Delning = samma identitet

En delad punkt är ett objekt som refereras av flera former.
Flytta den en gång, varje form som håller referensen flyttas med
den.

Du skapar delade punkter genom att hålla <kbd>Alt</kbd> medan du
klickar, eller genom att dra ett hörn på ett befintligt i
segmentredigeringsläge.

Det här är vad du vill ha för gränser som aldrig ska separeras —
två angränsande körfältskanter, två polygonhörn som behöver hållas
svetsade, slutet av en bana och starten av en annan.

## Varför skilja på dem

Om två formkanter som ska vara samma faktiskt är två snappade
punkter, dra en av dem, exportera till OpenDRIVE, och vägnätet
öppnar upp sig vid det hörnet. Simulatorn kan tolka gapet som en
diskontinuitet, eller smeta över det beroende på verktyget.

Lane Vänster/Höger-grannar som delar en gräns använder alltid
delade punkter internt — det är inte valfritt och inte
användarstyrt. För godtyckliga former (Linestring, Polygon, Path)
är valet upp till dig.

## Visuella ledtrådar

- Ett snap-mål visar ett enskilt markerat handtag och drar
  markören.
- En delad punkt renderas som ett dubblat handtag i
  segmentredigeringsläge.

## Se även

- [Snap till befintlig geometri](/sv/guides/snap/)
- [Dela punkter mellan former](/sv/guides/point-sharing/)
