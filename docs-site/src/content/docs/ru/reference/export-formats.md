---
title: Поддерживаемые форматы экспорта
description: Что drawtonomy умеет читать и записывать.
---

| Формат | Экспорт | Импорт | Замечания |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Стандартный SVG. |
| **PNG** | ✓ | ✓ | Растровый без потерь. |
| **JPG** | ✓ | ✓ | Растровый с потерями. |
| **PDF** | ✓ |  | Векторный, поддерживает прозрачность. |
| **EPS** | ✓ |  | Векторный. **Без прозрачности** — используйте PDF. |
| **drawtonomy.svg** | ✓ | ✓ | Повторно редактируемый: сохраняет связи, общие точки, группы footprint, стиль. |
| **OSM (Lanelet2)** | ✓ | ✓ | Дорожные сети [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Карта OccupancyGrid, формат ROS `map_server`. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini bundle (.zip)** | ✓ |  | `.xodr` + `.xosc` вместе, готово для `esmini`. |

## Что сохраняется

| Возможность | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Геометрия | ✓ | ✓ | ✓ | ✓ | ✓ |
| Связи полос | ✓ | ✓ | ✓ | частично | – |
| Общие точки | ✓ | – | – | – | – |
| Группы footprint | ✓ | – | – | частично | – |
| Стиль (цвет, прозрачность) | ✓ | – | – | – | ✓ |
| Двусторонний обмен | ✓ | ✓ | – | – | – |

## См. также

- [Экспорт сцены](/ru/guides/export/)
- [Экспорт в OpenDRIVE / OpenSCENARIO / esmini](/ru/guides/export-asam/)
