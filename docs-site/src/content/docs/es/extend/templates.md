---
title: Contribuir con plantillas
description: Añade una nueva plantilla de vehículo, peatón, señal o marca vial.
---

Las plantillas son archivos SVG más una entrada en el manifest.
Una vez contribuidas, aparecen en los menús de Participantes y
formas del editor junto a las plantillas integradas.

El flujo de contribución está en el repo público:

➡ **[Guía de Plantillas](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categorías

| Carpeta | Ejemplos |
|---|---|
| `templates/vehicle/` | Sedán, Autobús, Camión, Motocicleta |
| `templates/pedestrian/` | Caminando, Simple |
| `templates/road_marking/` | Paso de peatones, marcas con flechas |
| `templates/sign/` | Stop, ceda el paso, cabezales de señal |
| `templates/other/` | Cualquier otra cosa |

## Proceso

1. Añade tu SVG en la carpeta de la categoría correcta.
2. Regístralo en `templates/manifest.json`.
3. Abre un PR. Incluye una captura de la plantilla colocada en el
   lienzo.

## Qué hace una buena plantilla

- Dibujada a un tamaño por defecto sensato (vehículos en torno a
  4–5 m para un sedán).
- Una única región de color cambiable marcada con un fill
  conocido, para que el selector de color del Panel de Atributos
  pueda recolorearla.
- Sin referencias a fuentes externas — el texto se convierte a
  paths si está presente.
- Tamaño de archivo razonable (por debajo de unos 30 KB para una
  plantilla del tamaño de un vehículo).
