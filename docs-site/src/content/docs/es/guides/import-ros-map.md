---
title: Importar una OccupancyGrid de ROS (.pgm + .yaml)
description: Carga una cuadrícula de ocupación map_server de ROS (.pgm + .yaml) — construida con nav2, Cartographer o Gmapping — en drawtonomy como capa de fondo, luego esboza trayectorias, carriles y obstáculos encima.
keywords:
  - anotación cuadrícula de ocupación ROS
  - editor de mapas nav2
  - visor de mapas cartographer
  - dibujar sobre mapa pgm
  - herramienta anotación de mapas SLAM
---

drawtonomy entiende el formato `map_server` de ROS usado por
[nav2](https://navigation.ros.org/), Cartographer, Gmapping y
herramientas SLAM similares.

![Una cuadrícula de ocupación ROS importada en drawtonomy con flechas y estanterías dibujadas encima](/img/ros-occupancy-grid.png)

La captura muestra una cuadrícula de ocupación real de un almacén
(celdas ocupadas en negro, celdas libres en blanco) con
trayectorias y obstáculos dibujados directamente sobre ella dentro
de drawtonomy.

## Importar

1. Abre el menú **Archivo** → **Importar**.
2. Selecciona **ambos** archivos `.pgm` y el `.yaml` correspondiente
   juntos en el diálogo de archivos.
3. drawtonomy lee los metadatos YAML (resolución, umbrales) y
   renderiza la cuadrícula en el lienzo.

Si seleccionas solo el `.pgm` y no el `.yaml`, drawtonomy usa
valores por defecto (`resolution = 0,05 m/px`, umbrales de
ocupación estándar).

## Coloreado de celdas

| Celda | Color |
|---|---|
| Ocupada | Negro |
| Libre | Blanco |
| Desconocida | Gris |

Las celdas se renderizan a una escala que coincide con las
dimensiones de los carriles de drawtonomy, así que puedes dibujar
carriles, trayectorias y formas directamente encima — exactamente
como en la captura de arriba.

## Herramientas probadas

drawtonomy se ha usado con mapas de nav2, Cartographer y Gmapping.
Otros productores deberían funcionar siempre que emitan el par
estándar `.pgm` + `.yaml` de `map_server`.

## Véase también

- [Importar un archivo Lanelet2 (.osm)](/es/guides/import-lanelet2/)
