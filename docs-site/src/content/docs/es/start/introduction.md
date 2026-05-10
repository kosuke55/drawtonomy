---
title: Introducción — pizarra para escenarios de conducción
description: drawtonomy es una pizarra gratuita en el navegador para escenarios de conducción. Dibuja carriles, intersecciones, vehículos y peatones para artículos, presentaciones, debates de diseño y creación de escenarios. Exporta a OpenDRIVE, OpenSCENARIO y Lanelet2.
sidebar:
  label: Introducción
  order: 1
keywords:
  - pizarra para escenarios de conducción
  - herramienta diagrama escenario de conducción
  - herramienta diagrama conducción autónoma
  - figura conducción autónoma para artículo
  - figura conducción autónoma para presentación
  - dibujar escenario conducción autónoma online
  - herramienta boceto escenario tráfico
  - editor diagrama de carriles navegador
  - diagrama escenario para revisión de diseño
  - pizarra equipos conducción autónoma
  - drawtonomy qué es
---

drawtonomy es una pizarra para escenarios de conducción. El tipo
de figura que pones en un artículo, la diapositiva que esbozas
antes de una revisión de diseño, el diagrama que dibujas en una
llamada cuando estás explicando un caso límite al resto del
equipo, o la escena que esbozas antes de escribir el archivo
OpenSCENARIO.

Carriles, intersecciones, vehículos, peatones, semáforos, marcas
viales y pasos de peatones son formas integradas. Los carriles son
conscientes de la topología — llevan conexiones Siguiente /
Anterior / Izquierda / Derecha — así que el diagrama es una red
que puedes editar, no una imagen que redibujas cada vez que cambia
la geometría de la carretera.

La aplicación está en [drawtonomy.com](https://drawtonomy.com). El
SDK, las extensiones y el código fuente de este sitio de
documentación están en
[GitHub](https://github.com/kosuke55/drawtonomy).

## Para qué se usa

- **Figuras para artículos, tesis e informes técnicos.** Salida
  vectorial (`drawtonomy.svg`, PDF, EPS) que se incrusta limpiamente
  en LaTeX, Markdown y presentaciones.
- **Diapositivas y presentaciones.** Diagramas de maniobras de
  cambio de carril, intersecciones, casos de oclusión y otros
  escenarios de conducción — dibujados en segundos en lugar de
  minutos por forma.
- **Debates de diseño y algoritmos.** Una superficie de boceto
  compartida para hablar sobre el comportamiento de conducción,
  casos límite y argumentos de seguridad con compañeros de equipo.
- **Creación de escenarios.** Esboza la escena antes de escribir
  el XML de OpenSCENARIO, o importa un `.xosc` existente y edítalo
  visualmente.
- **Anotación de mapas y ROS.** Traza carriles sobre un fondo
  satelital, edita mapas OSM Lanelet2 o anota una cuadrícula de
  ocupación ROS con trayectorias y obstáculos.

## Para quién es

- **Ingenieros de conducción autónoma y ADAS** que dibujan
  diagramas para documentación interna, revisiones de diseño y
  análisis de incidentes.
- **Investigadores y estudiantes de AV** que producen figuras para
  artículos, tesis y charlas en conferencias.
- **Autores de escenarios** que trabajan con simuladores como
  [esmini](https://github.com/esmini/esmini), CARLA o herramientas
  internas.
- **Usuarios de mapas HD y Lanelet2** que esbozan cambios sobre
  una red vial existente.
- **Equipos de ROS y robótica** que dibujan sobre cuadrículas de
  ocupación construidas con nav2, Cartographer o Gmapping.
- **Instructores y docentes de conducción** que producen diagramas
  para material didáctico.
- **Constructores de herramientas** que extienden el editor con
  nuevos exportadores, importadores o funciones asistidas por IA
  mediante el [SDK de extensiones](/es/extend/).

## Cómo está organizada esta documentación

El sitio sigue la división [Diátaxis](https://diataxis.fr/). Elige
la sección que coincida con lo que estás haciendo.

| Sección | Cuándo leerla |
|---|---|
| [Tutoriales](/es/tutorials/) | Eres nuevo y quieres aprender haciendo. |
| [Guías prácticas](/es/guides/) | Sabes qué quieres conseguir y necesitas los pasos. |
| [Referencia](/es/reference/) | Necesitas consultar un dato exacto — un atajo, un formato, una API. |
| [Explicación](/es/explanation/) | Quieres entender por qué drawtonomy funciona como funciona. |
| [Extender drawtonomy](/es/extend/) | Estás construyendo sobre drawtonomy. |

Si no sabes por dónde empezar, el
[Inicio rápido](/es/start/quickstart/) son cinco minutos desde un
lienzo en blanco hasta una escena exportada.
