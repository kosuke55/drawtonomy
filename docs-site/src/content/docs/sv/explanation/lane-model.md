---
title: Körfältskopplingsmodell
description: Hur drawtonomy representerar vägtopologi, och vad det köper dig.
---

Ett drawtonomy-Lane har mer än två gränser och en mittlinje; det
bär också fyra kopplingsfack — **Nästa**, **Föregående**,
**Vänster** och **Höger** — som länkar in det i ett vägnät.

## De fyra facken

| Fack | Betydelse |
|---|---|
| **Nästa** | Körfältet som trafik på detta körfält flödar in i. |
| **Föregående** | Körfältet som flödar in i detta körfält. |
| **Vänster** | Körfältet omedelbart till vänster, som delar en gräns. |
| **Höger** | Körfältet omedelbart till höger, som delar en gräns. |

Kopplingar är dubbelriktade: att sätta körfält A:s Nästa till B
sätter också B:s Föregående till A. Redigeraren upprätthåller den
invarianten åt dig.

## Vad kopplingar möjliggör

### Koordinerad redigering

När två körfält delar en gräns — för att de är
Vänster/Höger-grannar, eller för att Nästa/Föregående-körfält möts
ända-mot-ända — är den gränsen ett enda objekt. Dra en punkt på
den och båda körfälten uppdateras.

Topologin säger redan vad som är limmat till vad, så geometri
behöver inte repareras för hand varje gång du justerar ett
körfält.

### Sammanhängande export

Både [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
och
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
kodar körfältskonnektivitet. drawtonomys exportörer använder
kopplingsfacken direkt, utan slutsatser eller heuristiker som
skulle falla över kantfall. En scen som ser rätt ut i redigeraren
exporteras som ett verkligt vägnät snarare än en påse polylinjer.

### Tur-och-retur med importer

Lanelet2-importören läser samma kopplingsmodell från `.osm`-filer.
Du kan redigera en Lanelet2-karta i drawtonomy och exportera den
tillbaka utan att förlora topologi.

## När kopplingar härleds

drawtonomy ställer in kopplingar automatiskt när avsikten är
tydlig:

- Att rita ett körfält som börjar på ett befintligt körfälts
  ändpunkt sätter **Föregående**.
- Genvägen för parallellt körfält (<kbd>Alt</kbd>+klick med
  Lane-verktyget) sätter **Vänster** eller **Höger**.
- Att placera en
  [korsningsmall](/sv/guides/participants/) kopplar in varje
  inkommande körfält.
- [Lane Generator](/sv/guides/lane-from-map/) härleder kopplingar
  från OSM-topologi där det är otvetydigt.

För allt annat, ange dem för hand i attributpanelen — se
[Hantera körfältskopplingar](/sv/guides/lane-connections/).

## Vad kopplingar inte kodar

- **Färdriktning** är underförstådd av Nästa/Föregående, men inte
  separat kodad. Dubbelriktade vägar modelleras som två motsatta
  körfält med sina egna Nästa/Föregående-kedjor.
- **Svängrestriktioner** vid korsningar modelleras inte i
  drawtonomy självt. De visas i OpenDRIVE/OpenSCENARIO-exporten
  via korsningsmallen som producerade dem.
- **Hastighetsgränser, ytmaterial, belysning** — inget av dessa.
  drawtonomy är geometri plus topologi; semantiska attribut är
  utanför omfattning.

## Se även

- [Hantera körfältskopplingar](/sv/guides/lane-connections/) —
  redigerarstegen.
- [drawtonomy.svg-format](/sv/reference/drawtonomy-svg/) — hur
  kopplingar bevaras vid spara.
