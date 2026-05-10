---
title: Por qué drawtonomy — una pizarra construida para escenarios de conducción
description: Por qué existe drawtonomy y las decisiones de diseño detrás de él. Construido específicamente para escenarios de conducción — las figuras que van en artículos de conducción autónoma, presentaciones, revisiones de diseño y creación de escenarios.
keywords:
  - por qué drawtonomy
  - pizarra para escenarios de conducción
  - herramienta diagrama conducción autónoma
  - herramienta de figuras para artículos de investigación AV
  - software ilustración conducción autónoma
  - alternativa herramientas de presentación para diagramas viales
  - pizarra equipos conducción autónoma
---

drawtonomy es una pizarra construida específicamente para
escenarios de conducción. La mayoría de los equipos esbozan estos
diagramas hoy en herramientas genéricas de dibujo o en
presentaciones — esas funcionan bien para formas generales, pero
no saben qué es un carril, así que la geometría tiene que
redibujarse cada vez que la carretera gira, la intersección crece
una rama o un paso de peatones tiene que alinearse con la
carretera.

Esta página explica las decisiones de diseño que se siguen de
liderar con "pizarra para escenarios de conducción" en lugar de
"herramienta que exporta a un simulador".

## El problema sobre el que está construido

La mayor parte de la comunicación real sobre conducción autónoma
ocurre a través de diagramas: en artículos, revisiones de diseño,
reuniones de planificación, análisis de incidentes, aulas y
presentaciones. El diagrama es el artefacto que la gente mira,
debate y recuerda.

Las herramientas genéricas de dibujo a ese nivel solo te dan
formas genéricas. Un carril es un rectángulo que redibujas cada
vez que la carretera gira; un paso de peatones es una pila de
rectángulos que sigues alineando a mano; una intersección es media
hora de toqueteo. Peor aún, en el momento en que cambia la
geometría de la carretera — y en el trabajo de AV cambia
constantemente — empiezas de nuevo.

drawtonomy existe para hacer ese bucle rápido. Los bloques de
construcción que el dominio realmente tiene — carriles,
intersecciones, pasos de peatones, semáforos, marcas viales,
vehículos, peatones — son formas de primera clase, así que la
figura sigue siendo correcta a medida que iteras.

## Dónde se sitúa drawtonomy

El trabajo de escenarios de conducción ocurre en distintos
niveles:

1. **Diagramas.** Artículos, presentaciones, bocetos en pizarra,
   figuras de documentos de diseño, material de aula. Rápido y
   fácil en principio, pero en una herramienta genérica la
   geometría de la carretera tiene que reconstruirse cada vez que
   algo se mueve.
2. **Herramientas de creación.** Editores de OpenSCENARIO,
   editores de redes viales, paquetes tipo CAD. Precisos, lentos,
   caros de aprender.
3. **Simuladores.** esmini, CARLA, herramientas internas. Ejecutan
   el escenario, producen datos.

drawtonomy vive en el nivel 1, y cruza al nivel 2 cuando lo
necesitas: importar un mapa Lanelet2, esbozar cambios, exportar
OpenDRIVE/OpenSCENARIO, entregar el resultado a esmini.

## Prioridades de diseño

### Pizarra primero

El punto de comparación es un boceto rápido en pizarra o
presentación, no una herramienta CAD. Eso establece el listón de
la fricción: abre una URL, dibuja, comparte. Sin instalación, sin
cuenta, sin formato de archivo de proyecto. Cualquier cosa que
hiciera que drawtonomy se sintiera más pesado que un boceto rápido
se elimina.

### Consciente de la topología

Una carretera no es una bolsa de polilíneas. drawtonomy modela las
conexiones de carril (Siguiente / Anterior / Izquierda / Derecha)
de modo que mover un borde actualiza los carriles vecinos
automáticamente. Dos carriles que comparten un borde comparten
los mismos puntos del borde — arrastra una vez, ambos se mueven.
Consulta [Modelo de conexión de carriles](/es/explanation/lane-model/).

### Plantillas del dominio de la conducción

Vehículos (sedán, autobús, camión, motocicleta…), peatones
(caminando, simple), semáforos para vehículos y peatones, pasos
de peatones, marcas viales, señales, plantillas de intersección.
Son formas integradas en lugar de aproximaciones con rectángulos
genéricos. Se pueden añadir plantillas SVG personalizadas mediante
PR.

### Editable a la salida tanto como a la entrada

Cada formato de salida que produce drawtonomy preserva suficiente
estado para ser reeditado. `drawtonomy.svg` es la forma canónica
sin pérdidas: un SVG normal que se previsualiza en todas partes
(navegadores, GitHub, presentaciones, figuras de artículos) y se
reabre en drawtonomy con cada conexión y relación de solapamiento
intactas. Nada queda atrapado en un formato que no puedas leer de
vuelta.

### Headless cuando se necesita

El código del exportador y del parser es parte de
`@drawtonomy/sdk` y se ejecuta sin el editor. Los pipelines de CI,
las extensiones del navegador y las herramientas de IA pueden
generar y validar escenas programáticamente.

## Puentes al resto del flujo de trabajo

Una vez que tienes un diagrama, normalmente quieres hacer algo
con él. drawtonomy incluye varios puentes para que la figura no
se quede encerrada en el editor:

- **`drawtonomy.svg`** — el predeterminado. Incrústalo en
  artículos, presentaciones, docs de Markdown; reábrelo más tarde
  para seguir editando.
- **Round-trip Lanelet2** — abre un mapa OSM Lanelet2 (incluidos
  mapas de muestra de Autoware), edita, exporta de vuelta. Útil
  para esbozar cambios sobre un mapa HD existente.
- **Exportación ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3,
  opcionalmente empaquetado como un zip listo para
  [esmini](https://github.com/esmini/esmini).
- **AI Scene Generator** — describe un escenario en lenguaje
  natural, o pega XML de OpenSCENARIO, y obtén un lienzo editable
  desde el que empezar a refinar.

Estos puentes son útiles, pero el diagrama en sí es la razón por
la que existe drawtonomy. Una figura en drawtonomy ya es valiosa
como figura; estos formatos le permiten fluir a la siguiente etapa
del flujo de trabajo cuando sea necesario.

## Lo que drawtonomy no es

- **No es un simulador.** No ejecuta escenarios. Exporta a
  esmini, CARLA o tu propia herramienta para eso.
- **No es una herramienta CAD.** No impone precisión de ingeniería
  (splines clotoides, peraltes, elevación). La geometría es 2D
  directa.
- **No es una suite de colaboración en tiempo real.** Es un
  editor de un solo usuario. Guarda, comparte, reabre.

## Véase también

- [Modelo de conexión de carriles](/es/explanation/lane-model/)
- [Arquitectura del exportador](/es/explanation/exporter-architecture/)
- [Arquitectura de extensiones](/es/explanation/extension-architecture/)
