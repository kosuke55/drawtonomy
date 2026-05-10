---
title: '@drawtonomy/sdk-overzicht'
description: Pakketten, entry points en hoe de SDK aansluit bij de editor.
---

`@drawtonomy/sdk` is het pakket waar extensieauteurs en headless
tooling tegenaan bouwen. Het biedt:

| Module | Doel |
|---|---|
| `ExtensionClient` | postMessage-client voor in een iframe gehoste extensies. |
| Vorm-factory-functies | `createLane()`, `createVehicle()`, enz. |
| `createSnapshot()` | Een `DrawtonomySnapshot` opbouwen uit een array van vormen. |
| `exporter.*` | Pure functies die een snapshot omzetten naar OpenDRIVE / OpenSCENARIO / esmini-zip / Lanelet2 OSM. Inclusief een Lanelet2-parser. |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Installeren

```bash
pnpm add @drawtonomy/sdk
```

## Bijbehorende pakketten

| Pakket | Doel |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | De SDK zelf. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Lokale dev-server die de editor host voor extensieontwikkeling. |

## Broncode

De SDK-broncode, tests en voorbeelden staan in de
[drawtonomy GitHub-repository](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Zie ook

- [Extensie-SDK API](/nl/extend/extension-sdk/) — iframe-extensies
  bouwen.
- [Exporter-SDK API](/nl/extend/exporter-sdk/) — nieuwe doelformaten
  toevoegen.
