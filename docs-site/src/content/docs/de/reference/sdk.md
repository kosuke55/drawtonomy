---
title: '@drawtonomy/sdk-Übersicht'
description: Pakete, Einstiegspunkte und wie das SDK mit dem Editor zusammenspielt.
keywords:
  - drawtonomy SDK
  - drawtonomy npm
  - ExtensionClient
  - DrawtonomySnapshot
  - drawtonomy dev-server
  - Whiteboard für autonomes Fahren
---

`@drawtonomy/sdk` ist das Paket, gegen das Erweiterungs-Autoren und
Headless-Tooling bauen. Es stellt bereit:

| Modul | Zweck |
|---|---|
| `ExtensionClient` | postMessage-Client für in Iframes gehostete Erweiterungen. |
| Form-Factory-Funktionen | `createLane()`, `createVehicle()` usw. |
| `createSnapshot()` | Erzeugt ein `DrawtonomySnapshot` aus einem Formen-Array. |
| `exporter.*` | Reine Funktionen, die einen Snapshot in OpenDRIVE / OpenSCENARIO / esmini-ZIP / Lanelet2-OSM verwandeln. Enthält einen Lanelet2-Parser. |
| Typen | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Installation

```bash
pnpm add @drawtonomy/sdk
```

## Begleitpakete

| Paket | Zweck |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Das SDK selbst. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Lokaler Dev-Server, der den Editor für die Erweiterungs-Entwicklung hostet. |

## Quellcode

Der SDK-Quellcode, Tests und Beispiele liegen im
[drawtonomy-GitHub-Repository](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Siehe auch

- [Extension-SDK-API](/de/extend/extension-sdk/) — Iframe-Erweiterungen
  bauen.
- [Exporter-SDK-API](/de/extend/exporter-sdk/) — neue Zielformate
  hinzufügen.
