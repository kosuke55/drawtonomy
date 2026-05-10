---
title: समर्थित एक्सपोर्ट फ़ॉर्मैट
description: drawtonomy क्या पढ़ और लिख सकता है।
---

| फ़ॉर्मैट | एक्सपोर्ट | इम्पोर्ट | नोट्स |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | मानक SVG। |
| **PNG** | ✓ | ✓ | Lossless raster। |
| **JPG** | ✓ | ✓ | Lossy raster। |
| **PDF** | ✓ |  | वेक्टर, transparency को सपोर्ट करता है। |
| **EPS** | ✓ |  | वेक्टर। **कोई transparency नहीं** — इसके बजाय PDF का उपयोग करें। |
| **drawtonomy.svg** | ✓ | ✓ | पुनः-संपादन योग्य: कनेक्शन, साझा पॉइंट, footprint groups, शैली रखता है। |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) सड़क नेटवर्क। |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid map, ROS `map_server` फ़ॉर्मैट। |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8। |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3। |
| **esmini bundle (.zip)** | ✓ |  | `.xodr` + `.xosc` एक साथ, `esmini` के लिए तैयार। |

## क्या preserved होता है

| Feature | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| ज्योमेट्री | ✓ | ✓ | ✓ | ✓ | ✓ |
| लेन कनेक्शन | ✓ | ✓ | ✓ | partial | – |
| साझा पॉइंट | ✓ | – | – | – | – |
| Footprint groups | ✓ | – | – | partial | – |
| शैली (color, opacity) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## इसे भी देखें

- [अपना दृश्य एक्सपोर्ट करें](/hi/guides/export/)
- [OpenDRIVE / OpenSCENARIO / esmini में एक्सपोर्ट](/hi/guides/export-asam/)
