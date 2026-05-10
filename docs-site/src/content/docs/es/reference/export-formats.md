---
title: Formatos de exportación soportados
description: Lo que drawtonomy puede leer y escribir.
---

| Formato | Exportar | Importar | Notas |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG estándar. |
| **PNG** | ✓ | ✓ | Ráster sin pérdidas. |
| **JPG** | ✓ | ✓ | Ráster con pérdidas. |
| **PDF** | ✓ |  | Vectorial, soporta transparencia. |
| **EPS** | ✓ |  | Vectorial. **Sin transparencia** — usa PDF en su lugar. |
| **drawtonomy.svg** | ✓ | ✓ | Reeditable: conserva conexiones, puntos compartidos, grupos de huellas, estilo. |
| **OSM (Lanelet2)** | ✓ | ✓ | Redes viales [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Mapa OccupancyGrid, formato `map_server` de ROS. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **paquete esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` juntos, listo para `esmini`. |

## Qué se conserva

| Característica | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometría | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conexiones de carril | ✓ | ✓ | ✓ | parcial | – |
| Puntos compartidos | ✓ | – | – | – | – |
| Grupos de huellas | ✓ | – | – | parcial | – |
| Estilo (color, opacidad) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Véase también

- [Exportar tu escena](/es/guides/export/)
- [Exportar a OpenDRIVE / OpenSCENARIO / esmini](/es/guides/export-asam/)
