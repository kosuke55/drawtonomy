---
title: ROS OccupancyGrid (.pgm + .yaml) इम्पोर्ट करें
description: nav2, Cartographer, या Gmapping के साथ बने ROS map_server occupancy grid (.pgm + .yaml) को drawtonomy में एक बैकग्राउंड लेयर के रूप में load करें, फिर ऊपर पाथ, लेन, और बाधाएं स्केच करें।
keywords:
  - ROS occupancy grid एनोटेशन
  - nav2 मैप संपादक
  - cartographer मैप व्यूअर
  - pgm मैप पर ड्रॉ करें
  - SLAM मैप एनोटेशन टूल
  - रोबोटिक्स मैप आरेख
---

drawtonomy [nav2](https://navigation.ros.org/), Cartographer,
Gmapping, और इसी तरह के SLAM टूल्स द्वारा उपयोग किए जाने वाले
ROS `map_server` फ़ॉर्मैट को समझता है।

![drawtonomy में इम्पोर्ट किया गया एक ROS occupancy grid जिस पर तीर और शेल्फ ड्रॉ की गई हैं](/img/ros-occupancy-grid.png)

स्क्रीनशॉट एक वास्तविक warehouse occupancy grid (occupied cells
black, free cells white) दिखाता है जिस पर drawtonomy के अंदर
सीधे पाथ और बाधाएं ड्रॉ की गई हैं।

## इम्पोर्ट

1. **File** मेनू → **Import** खोलें।
2. file dialog में **दोनों** `.pgm` और matching `.yaml` फ़ाइल
   एक साथ चुनें।
3. drawtonomy YAML metadata (resolution, thresholds) पढ़ता है
   और कैनवस पर ग्रिड को render करता है।

यदि आप केवल `.pgm` और कोई `.yaml` नहीं चुनते हैं, तो drawtonomy
डिफ़ॉल्ट का उपयोग करता है (`resolution = 0.05 m/px`, मानक
occupancy thresholds)।

## Cell colouring

| Cell | रंग |
|---|---|
| Occupied | काला |
| Free | सफेद |
| Unknown | ग्रे |

Cells एक scale पर render होते हैं जो drawtonomy के लेन
dimensions से match करता है, इसलिए आप सीधे ऊपर लेन, पाथ, और
shapes ड्रॉ कर सकते हैं — ठीक ऊपर के स्क्रीनशॉट की तरह।

## Tools जो tested हैं

drawtonomy को nav2, Cartographer, और Gmapping से बने मैप के
साथ उपयोग किया गया है। अन्य producers काम करने चाहिए जब तक वे
मानक `map_server` `.pgm` + `.yaml` pair emit करते हैं।

## इसे भी देखें

- [Lanelet2 (.osm) फ़ाइल इम्पोर्ट करें](/hi/guides/import-lanelet2/)
