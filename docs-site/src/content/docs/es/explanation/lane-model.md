---
title: Modelo de conexión de carriles
description: Cómo representa drawtonomy la topología vial, y qué te aporta.
---

Un Carril de drawtonomy tiene más que dos bordes y una línea
central; también lleva cuatro espacios de conexión —
**Siguiente**, **Anterior**, **Izquierda** y **Derecha** — que lo
enlazan a una red vial.

## Los cuatro espacios

| Espacio | Significado |
|---|---|
| **Siguiente** | El carril al que fluye el tráfico de este carril. |
| **Anterior** | El carril que fluye a este carril. |
| **Izquierda** | El carril inmediatamente a la izquierda, que comparte un borde. |
| **Derecha** | El carril inmediatamente a la derecha, que comparte un borde. |

Las conexiones son bidireccionales: establecer Siguiente del
Carril A a B también establece Anterior de B a A. El editor
mantiene este invariante por ti.

## Lo que permiten las conexiones

### Edición coordinada

Cuando dos carriles comparten un borde — porque son vecinos
Izquierdo/Derecho, o porque carriles Siguiente/Anterior se unen
extremo con extremo — ese borde es un único objeto. Arrastra un
punto en él y ambos carriles se actualizan.

La topología ya dice qué está pegado a qué, así que la geometría
no necesita repararse a mano cada vez que ajustas un carril.

### Exportación coherente

Tanto [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
como
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
codifican la conectividad de carriles. Los exportadores de
drawtonomy usan los espacios de conexión directamente, sin
inferencias o heurísticas que fallarían en casos límite. Una
escena que se ve correcta en el editor se exporta como una red
vial real en lugar de una bolsa de polilíneas.

### Round-trip con importaciones

El importador de Lanelet2 lee el mismo modelo de conexión de los
archivos `.osm`. Puedes editar un mapa Lanelet2 en drawtonomy y
exportarlo de vuelta sin perder la topología.

## Cuándo se infieren las conexiones

drawtonomy establece conexiones automáticamente cuando la
intención está clara:

- Dibujar un carril que empieza en el punto final de un carril
  existente establece **Anterior**.
- El atajo de carril paralelo (<kbd>Alt</kbd>+clic con la
  herramienta Carril) establece **Izquierda** o **Derecha**.
- Colocar una [plantilla de intersección](/es/guides/participants/)
  conecta cada carril de aproximación.
- El [Generador de Carriles](/es/guides/lane-from-map/) infiere
  conexiones de la topología de OSM cuando son inequívocas.

Para todo lo demás, configúralas a mano en el Panel de Atributos —
consulta [Gestionar conexiones de carriles](/es/guides/lane-connections/).

## Lo que las conexiones no codifican

- **Dirección de marcha** está implícita por Siguiente/Anterior,
  pero no se codifica por separado. Las carreteras
  bidireccionales se modelan como dos carriles opuestos con sus
  propias cadenas Siguiente/Anterior.
- **Restricciones de giro** en las intersecciones no se modelan en
  drawtonomy en sí. Aparecen en la exportación
  OpenDRIVE/OpenSCENARIO a través de la plantilla de intersección
  que las produjo.
- **Límites de velocidad, tipo de superficie, iluminación** —
  ninguno de estos. drawtonomy es geometría más topología; los
  atributos semánticos están fuera del alcance.

## Véase también

- [Gestionar conexiones de carriles](/es/guides/lane-connections/) —
  los pasos del editor.
- [Formato drawtonomy.svg](/es/reference/drawtonomy-svg/) — cómo se
  persisten las conexiones al guardar.
