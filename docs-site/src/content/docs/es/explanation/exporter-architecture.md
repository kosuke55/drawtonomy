---
title: Arquitectura del exportador
description: Cómo un lienzo se convierte en un snapshot, y un snapshot se convierte en un archivo.
---

El exportador es el puente entre los datos en el editor de
drawtonomy y los formatos externos — OpenDRIVE, OpenSCENARIO,
Lanelet2 o lo que conectes a continuación. Entender el pipeline es
el prerrequisito para añadir un nuevo formato de destino.

## El pipeline

```
Estado del editor ──► DrawtonomySnapshot ──► Exportador ──► Archivo / blob
                       (serializable)        (puro)
```

### 1. `DrawtonomySnapshot`

Un snapshot es un objeto plano: una lista de formas más una marca
de versión y una marca de tiempo. Es serializable, no tiene
referencias al DOM y es la única entrada que toma el exportador.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Construyes un snapshot con `createSnapshot(shapes)`, o parseando
un `drawtonomy.svg` guardado con `parseDrawtonomySvg(svg)`.

### 2. Los módulos del exportador

Cada formato de destino es una función pura separada:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Toman un snapshot, devuelven una cadena o un blob. Sin acceso al
editor, sin DOM, sin dependencias asíncronas. Misma entrada,
misma salida.

### 3. Round-trip

Para Lanelet2, el SDK también incluye un parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Esto es lo que impulsa el flujo de
[Importación Lanelet2](/es/guides/import-lanelet2/).

## Por qué funciones puras

El exportador ejecuta el mismo camino de código en el navegador,
en un script de CI de Node, en un pipeline del lado del servidor
o en una extensión del navegador. Las pruebas se ejecutan contra
fixtures de snapshot sin navegador headless.

Por eso el exportador vive en `@drawtonomy/sdk` y no dentro del
editor — el editor depende del SDK, no al revés.

## Añadir un formato de destino

El exportador es el principal punto de extensión para nuevos
destinos — CARLA, Unity, SUMO, DSLs personalizados. La receta:

1. Añadir un nuevo módulo bajo
   `packages/drawtonomy-sdk/src/exporter/`.
2. Tomar `DrawtonomySnapshot` como entrada, devolver una cadena o
   blob.
3. Añadir pruebas bajo
   `packages/drawtonomy-sdk/__tests__/exporter/` usando fixtures de
   snapshot.
4. Conectar un punto de entrada de UI si quieres que el menú
   Exportar del editor lo conozca (opcional — muchos usuarios lo
   llamarán programáticamente).

La guía completa para desarrolladores está en el repo público:
[Guía de Desarrollador del Exportador](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Véase también

- [Exportar a OpenDRIVE / OpenSCENARIO / esmini](/es/guides/export-asam/) —
  el flujo de cara al usuario.
- [Resumen de `@drawtonomy/sdk`](/es/reference/sdk/)
- [API SDK del exportador](/es/extend/exporter-sdk/)
