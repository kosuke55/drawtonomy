---
title: 'Panoramica @drawtonomy/sdk'
description: Pacchetti, punti di ingresso e come l'SDK si integra con l'editor.
---

`@drawtonomy/sdk` è il pacchetto contro cui sviluppano gli autori
di estensioni e gli strumenti headless. Espone:

| Modulo | Scopo |
|---|---|
| `ExtensionClient` | Client postMessage per estensioni ospitate in iframe. |
| Funzioni factory delle forme | `createLane()`, `createVehicle()`, ecc. |
| `createSnapshot()` | Costruisce un `DrawtonomySnapshot` da un array di forme. |
| `exporter.*` | Funzioni pure che trasformano uno snapshot in OpenDRIVE / OpenSCENARIO / zip esmini / Lanelet2 OSM. Include un parser Lanelet2. |
| Tipi | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Installazione

```bash
pnpm add @drawtonomy/sdk
```

## Pacchetti companion

| Pacchetto | Scopo |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | L'SDK stesso. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Dev server locale che ospita l'editor per lo sviluppo di estensioni. |

## Sorgente

Il sorgente dell'SDK, i test e gli esempi si trovano nel
[repository GitHub di drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Vedi anche

- [API SDK delle estensioni](/it/extend/extension-sdk/) — costruire
  estensioni iframe.
- [API SDK degli esportatori](/it/extend/exporter-sdk/) —
  aggiungere nuovi formati target.
