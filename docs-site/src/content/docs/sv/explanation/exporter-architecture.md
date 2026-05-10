---
title: Exportörarkitektur
description: Hur en canvas blir en ögonblicksbild, och en ögonblicksbild blir en fil.
---

Exportören är bryggan mellan drawtonomys data i redigeraren och
externa format — OpenDRIVE, OpenSCENARIO, Lanelet2, eller vad du
än kopplar in härnäst. Att förstå pipelinen är förutsättningen
för att lägga till ett nytt målformat.

## Pipelinen

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

En ögonblicksbild är ett vanligt objekt: en lista med former plus
en versionsstämpel och en tidsstämpel. Den är serialiserbar, har
inga DOM-referenser, och är den enda inmatningen exportören tar.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Du bygger en ögonblicksbild med `createSnapshot(shapes)`, eller
genom att parsa en sparad `drawtonomy.svg` med
`parseDrawtonomySvg(svg)`.

### 2. Exportörmodulerna

Varje målformat är en separat ren funktion:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

De tar en ögonblicksbild, returnerar en sträng eller en blob.
Ingen redigeraråtkomst, ingen DOM, inga asynkrona beroenden.
Samma input, samma output.

### 3. Tur och retur

För Lanelet2 levererar SDK:n också en parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Det är vad som driver flödet
[Lanelet2-import](/sv/guides/import-lanelet2/).

## Varför rena funktioner

Exportören kör samma kodväg i webbläsaren, i ett Node-CI-skript,
i en serversidig pipeline eller i ett webbläsartillägg. Tester
körs mot ögonblicksbildsfixturer utan en headless-webbläsare.

Det är därför exportören bor i `@drawtonomy/sdk` och inte inuti
redigeraren — redigeraren beror på SDK:n, inte tvärtom.

## Lägga till ett målformat

Exportören är huvudförlängningspunkten för nya mål — CARLA,
Unity, SUMO, anpassade DSL:er. Receptet:

1. Lägg till en ny modul under
   `packages/drawtonomy-sdk/src/exporter/`.
2. Ta `DrawtonomySnapshot` in, returnera en sträng eller blob.
3. Lägg till tester under
   `packages/drawtonomy-sdk/__tests__/exporter/` med
   ögonblicksbildsfixturer.
4. Koppla in en UI-ingångspunkt om du vill att redigerarens
   exportmeny ska känna till den (valfritt — många användare
   kommer att anropa den programmatiskt).

Den fullständiga utvecklarguiden finns i det publika arkivet:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Se även

- [Exportera till OpenDRIVE / OpenSCENARIO / esmini](/sv/guides/export-asam/) —
  det användarinriktade flödet.
- [`@drawtonomy/sdk`-översikt](/sv/reference/sdk/)
- [Exporter SDK API](/sv/extend/exporter-sdk/)
