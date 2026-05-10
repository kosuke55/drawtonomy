---
title: Formato drawtonomy.svg
description: La estructura en disco de un archivo drawtonomy reeditable.
---

Un archivo `drawtonomy.svg` es un SVG normal aumentado con
metadatos que registran el estado solo del editor.

## Estructura

- El contenido visual (paths, texto, imágenes) es SVG plano.
  Cualquier visor SVG lo renderiza correctamente.
- Un bloque `<metadata>` en la parte superior del documento
  contiene los datos específicos de drawtonomy:
  - IDs de forma y propiedades por forma (plantilla, estilo, etc.)
  - espacios de conexión de carril (`next`, `previous`, `left`,
    `right`)
  - referencias a puntos compartidos
  - pertenencia a grupos de huellas
  - z-order

## Compatibilidad

Editar un `drawtonomy.svg` en un editor SVG genérico (Illustrator,
Inkscape, el navegador) descarta el bloque de metadatos al guardar
a menos que lo conserves explícitamente. drawtonomy aún puede
abrir el resultado, pero faltarán las conexiones y los puntos
compartidos.

Para ediciones round-trip fuera de drawtonomy, usa el SDK
([`@drawtonomy/sdk`](/es/reference/sdk/)) — puede leer y escribir el
formato sin pasar por el editor.

## Versionado

Los archivos antiguos se migran automáticamente al importar. El
helper `resolveColorKey()` del SDK convierte claves de color
heredadas (por ejemplo, `grey-700` v1.x) a las actuales.

## Véase también

- [Exportar tu escena](/es/guides/export/)
- [Resumen de `@drawtonomy/sdk`](/es/reference/sdk/)
