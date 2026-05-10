---
title: Paleta de colores
description: Las claves de color de drawtonomy y sus valores HEX.
---

drawtonomy usa una paleta estilo Tailwind / Material: grey-100 (la
más clara) a grey-900 (la más oscura), más colores con nombre.

## Escala de grises

| Clave | HEX | Notas |
|---|---|---|
| `grey-100` | `#e6e6e6` | Más claro. Por defecto para Vehículo (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Por defecto para Peatón (Caminando y Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Gris medio. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Más oscuro. |

Número más bajo = más claro. Esto coincide con la convención de
Tailwind.

## Valores por defecto de plantillas

| Plantilla | Color por defecto |
|---|---|
| Peatón (Caminando) | `grey-300` |
| Peatón (Simple) | `grey-300` |
| Vehículo (Simple) | `grey-100` |
| Otras formas | `black` |

## Establecer color programáticamente

Usa `resolveColor()` del SDK para convertir una clave a un valor
HEX. Consulta la [API SDK de extensiones](/es/extend/extension-sdk/)
para los detalles.
