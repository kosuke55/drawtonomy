---
title: 'Resumen de @drawtonomy/sdk'
description: Paquetes, puntos de entrada y cómo encaja el SDK con el editor.
---

`@drawtonomy/sdk` es el paquete contra el que construyen los
autores de extensiones y las herramientas headless. Expone:

| Módulo | Propósito |
|---|---|
| `ExtensionClient` | Cliente postMessage para extensiones alojadas en iframe. |
| Funciones de fábrica de formas | `createLane()`, `createVehicle()`, etc. |
| `createSnapshot()` | Construye un `DrawtonomySnapshot` a partir de un array de formas. |
| `exporter.*` | Funciones puras que convierten un snapshot en OpenDRIVE / OpenSCENARIO / zip esmini / Lanelet2 OSM. Incluye un parser Lanelet2. |
| Tipos | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Instalar

```bash
pnpm add @drawtonomy/sdk
```

## Paquetes complementarios

| Paquete | Propósito |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | El SDK en sí. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Servidor de desarrollo local que aloja el editor para el desarrollo de extensiones. |

## Código fuente

El código fuente del SDK, las pruebas y los ejemplos están en el
[repositorio drawtonomy de GitHub](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Véase también

- [API SDK de extensiones](/es/extend/extension-sdk/) — construcción
  de extensiones en iframe.
- [API SDK del exportador](/es/extend/exporter-sdk/) — añadir nuevos
  formatos de destino.
