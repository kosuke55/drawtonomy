---
title: Formatos de exportação suportados
description: O que o drawtonomy pode ler e escrever.
---

| Formato | Exportar | Importar | Notas |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG padrão. |
| **PNG** | ✓ | ✓ | Raster sem perdas. |
| **JPG** | ✓ | ✓ | Raster com perdas. |
| **PDF** | ✓ |  | Vetor, suporta transparência. |
| **EPS** | ✓ |  | Vetor. **Sem transparência** — use PDF em vez disso. |
| **drawtonomy.svg** | ✓ | ✓ | Reeditável: mantém conexões, pontos compartilhados, grupos de pegadas, estilo. |
| **OSM (Lanelet2)** | ✓ | ✓ | Redes viárias [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Mapa OccupancyGrid, formato `map_server` do ROS. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **Pacote esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` juntos, prontos para `esmini`. |

## O que é preservado

| Recurso | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometria | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conexões de faixa | ✓ | ✓ | ✓ | parcial | – |
| Pontos compartilhados | ✓ | – | – | – | – |
| Grupos de pegadas | ✓ | – | – | parcial | – |
| Estilo (cor, opacidade) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Veja também

- [Exportar sua cena](/pt/guides/export/)
- [Exportar para OpenDRIVE / OpenSCENARIO / esmini](/pt/guides/export-asam/)
