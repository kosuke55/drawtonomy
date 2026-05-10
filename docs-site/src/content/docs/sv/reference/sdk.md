---
title: '@drawtonomy/sdk-översikt'
description: Paket, ingångspunkter och hur SDK:n passar med redigeraren.
---

`@drawtonomy/sdk` är paketet som tilläggsutvecklare och headless-verktyg
bygger mot. Det exponerar:

| Modul | Syfte |
|---|---|
| `ExtensionClient` | postMessage-klient för iframe-hostade tillägg. |
| Form-fabrikfunktioner | `createLane()`, `createVehicle()` etc. |
| `createSnapshot()` | Bygg en `DrawtonomySnapshot` från en array av former. |
| `exporter.*` | Rena funktioner som gör om en ögonblicksbild till OpenDRIVE / OpenSCENARIO / esmini-zip / Lanelet2 OSM. Inkluderar en Lanelet2-parser. |
| Typer | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Installera

```bash
pnpm add @drawtonomy/sdk
```

## Följeslagarpaket

| Paket | Syfte |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Själva SDK:n. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Lokal utvecklingsserver som hostar redigeraren för tilläggsutveckling. |

## Källkod

SDK:ns källkod, tester och exempel finns i
[drawtonomy GitHub-arkivet](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Se även

- [Extension SDK API](/sv/extend/extension-sdk/) — bygga
  iframe-tillägg.
- [Exporter SDK API](/sv/extend/exporter-sdk/) — lägga till nya
  målformat.
