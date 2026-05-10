---
title: Architektura eksportera
description: Jak płótno staje się migawką, a migawka staje się plikiem.
---

Eksporter to most między danymi w edytorze drawtonomy a zewnętrznymi
formatami — OpenDRIVE, OpenSCENARIO, Lanelet2 lub czymkolwiek
podłączysz dalej. Zrozumienie potoku jest warunkiem wstępnym do
dodania nowego formatu docelowego.

## Potok

```
Stan edytora ──► DrawtonomySnapshot ──► Eksporter ──► Plik / blob
                  (serializowalny)        (czysty)
```

### 1. `DrawtonomySnapshot`

Migawka to zwykły obiekt: lista kształtów plus znacznik wersji i
sygnatura czasowa. Jest serializowalna, nie ma odwołań do DOM i jest
jedynym wejściem, jakie pobiera eksporter.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Migawkę budujesz za pomocą `createSnapshot(shapes)` lub przez
parsowanie zapisanego `drawtonomy.svg` za pomocą
`parseDrawtonomySvg(svg)`.

### 2. Moduły eksportera

Każdy format docelowy to osobna czysta funkcja:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Pobierają migawkę, zwracają ciąg lub blob. Brak dostępu do edytora,
brak DOM, brak zależności asynchronicznych. To samo wejście, to samo
wyjście.

### 3. Round-trip

Dla Lanelet2 SDK dostarcza również parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

To zasila przepływ
[importu Lanelet2](/pl/guides/import-lanelet2/).

## Dlaczego czyste funkcje

Eksporter uruchamia tę samą ścieżkę kodu w przeglądarce, w skrypcie
CI Node, w potoku po stronie serwera lub w rozszerzeniu przeglądarki.
Testy uruchamiają się względem fixture'ów migawek bez headless
browser.

Dlatego eksporter żyje w `@drawtonomy/sdk`, a nie wewnątrz edytora —
edytor zależy od SDK, a nie odwrotnie.

## Dodawanie formatu docelowego

Eksporter to główny punkt rozszerzenia dla nowych celów — CARLA,
Unity, SUMO, niestandardowych DSL. Receptura:

1. Dodaj nowy moduł pod `packages/drawtonomy-sdk/src/exporter/`.
2. Pobierz `DrawtonomySnapshot` na wejście, zwróć ciąg lub blob.
3. Dodaj testy pod `packages/drawtonomy-sdk/__tests__/exporter/` z
   użyciem fixture'ów migawek.
4. Podłącz punkt wejścia UI, jeśli chcesz, aby menu Eksportu
   edytora o nim wiedziało (opcjonalne — wielu użytkowników wywoła
   go programistycznie).

Pełny przewodnik dewelopera znajduje się w publicznym repo:
[Przewodnik Dewelopera Eksportera](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Zobacz także

- [Eksport do OpenDRIVE / OpenSCENARIO / esmini](/pl/guides/export-asam/) —
  przepływ dla użytkownika.
- [Przegląd `@drawtonomy/sdk`](/pl/reference/sdk/)
- [API Exporter SDK](/pl/extend/exporter-sdk/)
