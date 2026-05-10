---
title: Extender drawtonomy
description: Construye extensiones, añade formatos de destino, contribuye con plantillas.
sidebar:
  order: 0
---

drawtonomy está construido para ser extendido. El mismo SDK que
impulsa las extensiones internas (AI Scene Generator, Template
Preview, Exporter Playground) es el que tú usas.

## Elige tu punto de extensión

| Quieres… | Lee |
|---|---|
| Añadir un panel, generador o herramienta que se ejecute junto al editor | [SDK de extensiones](/es/extend/extension-sdk/) |
| Añadir un nuevo destino de exportación (CARLA, Unity, SUMO, …) | [SDK del exportador](/es/extend/exporter-sdk/) |
| Contribuir con una nueva plantilla SVG (vehículo, peatón, señal) | [Plantillas](/es/extend/templates/) |

## Dónde vive el código fuente

Todo está en el
[repositorio drawtonomy de GitHub](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — el SDK
- `packages/drawtonomy-dev-server/` — editor local para desarrollo
- `extensions/` — extensiones internas, útiles como referencias
- `templates/` — plantillas de formas integradas

Los PRs son bienvenidos. La
[Guía de Plantillas](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
recorre la adición de una forma personalizada de principio a fin.
