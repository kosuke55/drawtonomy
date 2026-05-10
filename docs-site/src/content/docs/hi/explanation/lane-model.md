---
title: लेन कनेक्शन मॉडल
description: drawtonomy सड़क topology का प्रतिनिधित्व कैसे करता है, और वह आपको क्या देता है।
---

एक drawtonomy Lane में दो बाउंड्री और एक centerline से अधिक है;
यह चार कनेक्शन slots भी रखती है — **Next**, **Previous**,
**Left**, और **Right** — जो इसे एक सड़क नेटवर्क से जोड़ते हैं।

## चार slots

| Slot | अर्थ |
|---|---|
| **Next** | वह लेन जिसमें इस लेन पर ट्रैफिक flow करता है। |
| **Previous** | वह लेन जो इस लेन में flow करती है। |
| **Left** | तुरंत बाईं तरफ की लेन, एक बाउंड्री साझा करती हुई। |
| **Right** | तुरंत दाईं तरफ की लेन, एक बाउंड्री साझा करती हुई। |

कनेक्शन bidirectional हैं: Lane A का Next B पर सेट करना B का
Previous A पर भी सेट करता है। एडिटर आपके लिए यह invariant
बनाए रखता है।

## कनेक्शन क्या enable करते हैं

### Coordinated एडिटिंग

जब दो लेन एक बाउंड्री साझा करती हैं — क्योंकि वे Left/Right
पड़ोसी हैं, या क्योंकि Next/Previous लेन end-to-end मिलती हैं
— वह बाउंड्री एक single object है। उस पर एक पॉइंट खींचें और
दोनों लेन update होती हैं।

Topology पहले से बताती है कि क्या किससे glued है, इसलिए जब
आप एक लेन को tweak करते हैं तो ज्योमेट्री को हाथ से repair
करने की आवश्यकता नहीं होती।

### Coherent एक्सपोर्ट

[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
और
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
दोनों लेन connectivity encode करते हैं। drawtonomy के
exporters कनेक्शन slots का सीधे उपयोग करते हैं, बिना किसी
inference या heuristics के जो edge cases पर fail हो जाएं।
एडिटर में सही दिखने वाला एक दृश्य polylines के बैग के बजाय
एक वास्तविक सड़क नेटवर्क के रूप में एक्सपोर्ट होता है।

### इम्पोर्ट के साथ Round-trip

Lanelet2 importer `.osm` फ़ाइलों से समान कनेक्शन मॉडल पढ़ता है।
आप drawtonomy में एक Lanelet2 मैप एडिट कर सकते हैं और इसे
topology खोए बिना वापस एक्सपोर्ट कर सकते हैं।

## जब कनेक्शन inferred होते हैं

drawtonomy कनेक्शन स्वचालित रूप से सेट करता है जब intent
स्पष्ट हो:

- एक लेन बनाना जो किसी मौजूदा लेन के endpoint पर शुरू होती है
  **Previous** सेट करती है।
- Parallel-lane शॉर्टकट (Lane टूल के साथ <kbd>Alt</kbd>+click)
  **Left** या **Right** सेट करता है।
- एक [चौराहा टेम्पलेट](/hi/guides/participants/) रखना हर
  approach लेन wire up करता है।
- [Lane Generator](/hi/guides/lane-from-map/) OSM topology से
  कनेक्शन infer करता है जहां unambiguous हो।

बाकी सब के लिए, उन्हें Attribute Panel में हाथ से सेट करें —
[लेन कनेक्शन प्रबंधित करें](/hi/guides/lane-connections/) देखें।

## कनेक्शन क्या encode नहीं करते

- **Travel की दिशा** Next/Previous से implied है, लेकिन
  separately encoded नहीं। Bidirectional सड़कें अपनी स्वयं
  की Next/Previous chains वाली दो विरोधी लेन के रूप में
  modelled होती हैं।
- **चौराहों पर Turn restrictions** drawtonomy में स्वयं
  modelled नहीं होते। वे उस चौराहा टेम्पलेट के माध्यम से
  OpenDRIVE/OpenSCENARIO एक्सपोर्ट में दिखाई देते हैं जिसने
  उन्हें produce किया।
- **गति limits, surface type, lighting** — इनमें से कोई नहीं।
  drawtonomy ज्योमेट्री plus topology है; semantic attributes
  scope से बाहर हैं।

## इसे भी देखें

- [लेन कनेक्शन प्रबंधित करें](/hi/guides/lane-connections/) —
  एडिटर steps।
- [drawtonomy.svg फ़ॉर्मैट](/hi/reference/drawtonomy-svg/) —
  कनेक्शन save पर कैसे persist होते हैं।
