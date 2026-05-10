---
title: Snap y compartir puntos
description: Dos mecanismos relacionados pero diferentes para mantener las formas alineadas.
---

Snap y compartir puntos tratan ambos de "este punto va sobre esa
cosa." Se ven similares en la interfaz, pero tienen consecuencias
diferentes. Mezclarlos es la fuente más común de errores tipo
"¿por qué se han desplazado mis formas?".

## Snap = misma coordenada

Snap mueve tu cursor (o un vértice que estás arrastrando) para
que caiga sobre un objetivo existente. El resultado son dos
puntos distintos que *casualmente* comparten coordenadas.

Mueve el objetivo original más tarde y tu punto con snap no le
sigue. Nunca estuvieron enlazados.

Esto es lo que quieres cuando estás esbozando: alineación precisa,
sin acoplamiento oculto.

## Compartir = misma identidad

Un punto compartido es un objeto referenciado por varias formas.
Muévelo una vez y cada forma que tiene la referencia se mueve con
él.

Creas puntos compartidos manteniendo pulsado <kbd>Alt</kbd> al
hacer clic, o arrastrando un vértice sobre uno existente en el
modo de edición de segmentos.

Esto es lo que quieres para bordes que nunca deberían separarse —
dos bordes de carril adyacentes, dos esquinas de polígono que
necesitan permanecer soldadas, el final de una trayectoria y el
inicio de otra.

## Por qué distinguirlos

Si dos bordes de forma que deberían ser el mismo son en realidad
dos puntos con snap, arrastra uno de ellos, exporta a OpenDRIVE y
la red vial se abre en ese vértice. El simulador puede interpretar
el hueco como una discontinuidad, o difuminarlo según la
herramienta.

Los vecinos Izquierda/Derecha de los carriles que comparten un
borde siempre usan puntos compartidos internamente — eso no es
opcional ni controlado por el usuario. Para formas arbitrarias
(Linestring, Polígono, Trayectoria), la elección depende de ti.

## Indicadores visuales

- Un objetivo de snap muestra un único controlador resaltado y
  atrae el cursor.
- Un punto compartido se renderiza como un controlador doble en
  el modo de edición de segmentos.

## Véase también

- [Snap a geometría existente](/es/guides/snap/)
- [Compartir puntos entre formas](/es/guides/point-sharing/)
