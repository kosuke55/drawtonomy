---
title: Exporter-architectuur
description: Hoe een canvas een snapshot wordt, en een snapshot een bestand.
---

De exporter is de brug tussen de in-editor data van drawtonomy
en externe formaten — OpenDRIVE, OpenSCENARIO, Lanelet2 of wat u
hierna ook aansluit. De pijplijn begrijpen is de voorwaarde om
een nieuw doelformaat toe te voegen.

## De pijplijn

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

Een snapshot is een gewoon object: een lijst van vormen plus een
versiestempel en een tijdstempel. Het is serialiseerbaar, heeft
geen DOM-referenties en is de enige invoer die de exporter
neemt.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

U bouwt een snapshot met `createSnapshot(shapes)`, of door een
opgeslagen `drawtonomy.svg` te parseren met
`parseDrawtonomySvg(svg)`.

### 2. De exportermodules

Elk doelformaat is een aparte pure functie:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Ze nemen een snapshot, geven een string of een blob terug. Geen
editor-toegang, geen DOM, geen async-afhankelijkheden. Zelfde
invoer, zelfde uitvoer.

### 3. Round-trip

Voor Lanelet2 levert de SDK ook een parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Dit is wat de
[Lanelet2-import](/nl/guides/import-lanelet2/)-flow aandrijft.

## Waarom pure functies

De exporter draait hetzelfde codepad in de browser, in een
Node-CI-script, in een server-side pijplijn of in een
browserextensie. Tests draaien tegen snapshot-fixtures zonder
headless browser.

Dat is waarom de exporter in `@drawtonomy/sdk` woont en niet
binnen de editor — de editor hangt af van de SDK, niet andersom.

## Een doelformaat toevoegen

De exporter is het belangrijkste uitbreidingspunt voor nieuwe
doelen — CARLA, Unity, SUMO, aangepaste DSL's. Het recept:

1. Voeg een nieuwe module toe onder
   `packages/drawtonomy-sdk/src/exporter/`.
2. Neem `DrawtonomySnapshot` in, geef een string of blob terug.
3. Voeg tests toe onder
   `packages/drawtonomy-sdk/__tests__/exporter/` met behulp van
   snapshot-fixtures.
4. Bedraad een UI-entry point als u wilt dat het exportmenu van
   de editor erover weet (optioneel — veel gebruikers zullen het
   programmatisch aanroepen).

De volledige ontwikkelaarshandleiding staat in de openbare repo:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Zie ook

- [Exporteren naar OpenDRIVE / OpenSCENARIO / esmini](/nl/guides/export-asam/) —
  de gebruikersgerichte flow.
- [`@drawtonomy/sdk`-overzicht](/nl/reference/sdk/)
- [Exporter-SDK API](/nl/extend/exporter-sdk/)
