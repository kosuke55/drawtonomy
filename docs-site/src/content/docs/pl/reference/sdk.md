---
title: Przegląd @drawtonomy/sdk
description: Pakiety, punkty wejścia i jak SDK pasuje do edytora.
---

`@drawtonomy/sdk` to pakiet, na podstawie którego budują autorzy
rozszerzeń i narzędzia headless. Udostępnia:

| Moduł | Cel |
|---|---|
| `ExtensionClient` | Klient postMessage dla rozszerzeń hostowanych w iframe. |
| Funkcje fabryki kształtów | `createLane()`, `createVehicle()` itp. |
| `createSnapshot()` | Zbuduj `DrawtonomySnapshot` z tablicy kształtów. |
| `exporter.*` | Czyste funkcje, które zamieniają migawkę w OpenDRIVE / OpenSCENARIO / paczkę zip esmini / OSM Lanelet2. Zawiera parser Lanelet2. |
| Typy | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Instalacja

```bash
pnpm add @drawtonomy/sdk
```

## Pakiety towarzyszące

| Pakiet | Cel |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Sam SDK. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Lokalny serwer deweloperski, który hostuje edytor do rozwoju rozszerzeń. |

## Źródło

Źródło SDK, testy i przykłady są w
[repozytorium drawtonomy na GitHub](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Zobacz także

- [API SDK rozszerzeń](/pl/extend/extension-sdk/) — budowanie
  rozszerzeń iframe.
- [API Exporter SDK](/pl/extend/exporter-sdk/) — dodawanie nowych
  formatów docelowych.
