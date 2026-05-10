---
title: टेम्पलेट योगदान
description: एक नया वाहन, पैदल यात्री, sign, या सड़क marking टेम्पलेट जोड़ें।
---

टेम्पलेट SVG फ़ाइलें plus एक manifest entry हैं। एक बार
contributed होने पर, वे बिल्ट-इन टेम्पलेट के बगल में एडिटर
के Participants और shape menus में दिखाई देते हैं।

योगदान flow public repo में है:

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categories

| Folder | Examples |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, arrow markings |
| `templates/sign/` | Stop, yield, signal heads |
| `templates/other/` | कुछ और |

## Process

1. अपनी SVG को सही category folder के तहत जोड़ें।
2. इसे `templates/manifest.json` में register करें।
3. एक PR खोलें। कैनवस पर रखे गए टेम्पलेट का एक स्क्रीनशॉट
   शामिल करें।

## क्या एक अच्छा टेम्पलेट बनाता है

- एक उचित डिफ़ॉल्ट आकार पर ड्रॉ किया गया (sedan के लिए वाहन
  लगभग 4–5 m)।
- एक ज्ञात fill के साथ marked एक single colour-changeable
  region, ताकि Attribute Panel का colour picker इसे recolour
  कर सके।
- कोई external font references नहीं — यदि मौजूद हो तो text
  paths में convert किया जाता है।
- उचित फ़ाइल size (एक vehicle-sized टेम्पलेट के लिए ~30 KB
  से कम)।
