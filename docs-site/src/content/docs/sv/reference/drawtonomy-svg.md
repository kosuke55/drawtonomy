---
title: drawtonomy.svg-format
description: Disk-strukturen för en återredigerbar drawtonomy-fil.
---

En `drawtonomy.svg`-fil är en vanlig SVG utökad med metadata som
registrerar redigerar-endast-tillståndet.

## Struktur

- Det visuella innehållet (paths, text, bilder) är vanlig SVG.
  Vilken SVG-visare som helst renderar det korrekt.
- Ett `<metadata>`-block överst i dokumentet håller den
  drawtonomy-specifika datan:
  - form-ID:n och props per form (mall, stil, etc.)
  - körfältskopplingsfack (`next`, `previous`, `left`, `right`)
  - referenser för delade punkter
  - fotavtrycksgruppmedlemskap
  - z-ordning

## Kompatibilitet

Att redigera en `drawtonomy.svg` i en generisk SVG-redigerare
(Illustrator, Inkscape, webbläsaren) släpper metadata-blocket vid
spara om du inte bevarar det explicit. drawtonomy kan fortfarande
öppna resultatet, men kopplingar och delade punkter kommer att
saknas.

För tur-och-retur-redigeringar utanför drawtonomy, använd SDK:n
([`@drawtonomy/sdk`](/sv/reference/sdk/)) — den kan läsa och skriva
formatet utan att gå genom redigeraren.

## Versionshantering

Äldre filer migreras automatiskt vid import. Hjälpfunktionen
`resolveColorKey()` i SDK:n konverterar äldre färgnycklar (till
exempel v1.x `grey-700`) till de aktuella.

## Se även

- [Exportera din scen](/sv/guides/export/)
- [`@drawtonomy/sdk`-översikt](/sv/reference/sdk/)
