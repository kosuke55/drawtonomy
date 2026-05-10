---
title: Formats d'export pris en charge
description: Ce que drawtonomy peut lire et écrire.
---

| Format | Export | Import | Notes |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG standard. |
| **PNG** | ✓ | ✓ | Raster sans perte. |
| **JPG** | ✓ | ✓ | Raster avec perte. |
| **PDF** | ✓ |  | Vectoriel, prend en charge la transparence. |
| **EPS** | ✓ |  | Vectoriel. **Pas de transparence** — utilisez plutôt PDF. |
| **drawtonomy.svg** | ✓ | ✓ | Ré-éditable : conserve connexions, points partagés, groupes d'empreintes, style. |
| **OSM (Lanelet2)** | ✓ | ✓ | Réseaux routiers [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Carte OccupancyGrid, format ROS `map_server`. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **Archive esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` réunis, prêts pour `esmini`. |

## Ce qui est préservé

| Caractéristique | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Géométrie | ✓ | ✓ | ✓ | ✓ | ✓ |
| Connexions de voies | ✓ | ✓ | ✓ | partiel | – |
| Points partagés | ✓ | – | – | – | – |
| Groupes d'empreintes | ✓ | – | – | partiel | – |
| Style (couleur, opacité) | ✓ | – | – | – | ✓ |
| Aller-retour | ✓ | ✓ | – | – | – |

## Voir aussi

- [Exporter votre scène](/fr/guides/export/)
- [Exporter vers OpenDRIVE / OpenSCENARIO / esmini](/fr/guides/export-asam/)
