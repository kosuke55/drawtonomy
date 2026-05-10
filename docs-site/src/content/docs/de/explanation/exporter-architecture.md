---
title: Exporter-Architektur
description: Wie aus einem Canvas ein Snapshot und aus einem Snapshot eine Datei wird.
keywords:
  - drawtonomy Exporter
  - DrawtonomySnapshot
  - OpenDRIVE Export
  - OpenSCENARIO Export
  - Lanelet2 Export
  - drawtonomy SDK
  - esmini ZIP
---

Der Exporter ist die Brücke zwischen den Editor-internen Daten von
drawtonomy und externen Formaten — OpenDRIVE, OpenSCENARIO,
Lanelet2 oder was auch immer Sie als Nächstes anschließen.
Verständnis der Pipeline ist Voraussetzung dafür, ein neues
Zielformat hinzuzufügen.

## Die Pipeline

```
Editor-Zustand ──► DrawtonomySnapshot ──► Exporter ──► Datei / Blob
                    (serialisierbar)        (rein)
```

### 1. `DrawtonomySnapshot`

Ein Snapshot ist ein einfaches Objekt: eine Liste von Formen plus
einen Versionsstempel und einen Zeitstempel. Er ist serialisierbar,
hat keine DOM-Referenzen und ist die einzige Eingabe, die der
Exporter entgegennimmt.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Sie erzeugen einen Snapshot mit `createSnapshot(shapes)` oder durch
Parsen einer gespeicherten `drawtonomy.svg` mit
`parseDrawtonomySvg(svg)`.

### 2. Die Exporter-Module

Jedes Zielformat ist eine eigene reine Funktion:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM-XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Sie nehmen einen Snapshot entgegen und liefern einen String oder
ein Blob. Kein Editor-Zugriff, kein DOM, keine asynchronen
Abhängigkeiten. Gleiche Eingabe, gleiche Ausgabe.

### 3. Hin- und Rückreise

Für Lanelet2 liefert das SDK zusätzlich einen Parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Das treibt den Ablauf des
[Lanelet2-Imports](/de/guides/import-lanelet2/) an.

## Warum reine Funktionen

Der Exporter durchläuft denselben Codepfad im Browser, in einem
Node-CI-Skript, in einer serverseitigen Pipeline oder in einer
Browser-Erweiterung. Tests laufen gegen Snapshot-Fixtures ohne
Headless-Browser.

Deshalb lebt der Exporter in `@drawtonomy/sdk` und nicht im Editor
— der Editor hängt vom SDK ab, nicht umgekehrt.

## Ein Zielformat hinzufügen

Der Exporter ist der Haupterweiterungspunkt für neue Ziele — CARLA,
Unity, SUMO, eigene DSLs. Das Rezept:

1. Ein neues Modul unter
   `packages/drawtonomy-sdk/src/exporter/` anlegen.
2. `DrawtonomySnapshot` als Eingabe nehmen, einen String oder ein
   Blob zurückgeben.
3. Tests unter `packages/drawtonomy-sdk/__tests__/exporter/` mit
   Snapshot-Fixtures hinzufügen.
4. Optional einen UI-Einstiegspunkt verkabeln, wenn das Export-Menü
   des Editors davon wissen soll (viele Anwender werden ihn
   programmatisch aufrufen).

Die vollständige Entwickleranleitung liegt im öffentlichen Repo:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Siehe auch

- [Export nach OpenDRIVE / OpenSCENARIO / esmini](/de/guides/export-asam/)
  — der nutzerseitige Ablauf.
- [`@drawtonomy/sdk`-Übersicht](/de/reference/sdk/)
- [Exporter-SDK-API](/de/extend/exporter-sdk/)
