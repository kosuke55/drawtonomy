---
title: Snap और पॉइंट साझाकरण
description: shapes को aligned रखने के लिए दो संबंधित लेकिन अलग mechanisms।
---

Snap और पॉइंट साझाकरण दोनों "यह पॉइंट उस चीज़ पर जाता है" से
deal करते हैं। वे UI में समान दिखते हैं, लेकिन उनके अलग
consequences हैं। उन्हें मिलाना "मेरी shapes drift क्यों
हुईं?" बग का सबसे आम स्रोत है।

## Snap = समान coordinate

Snapping आपके cursor (या एक vertex जिसे आप drag कर रहे हैं)
को एक मौजूदा target पर लैंड करने के लिए हिलाता है। परिणाम
दो distinct पॉइंट हैं जो *happen to* coordinates साझा करते हैं।

बाद में original target को हिलाएं और आपका snapped पॉइंट
follow नहीं करता। वे कभी linked नहीं थे।

यह वह है जो आप तब चाहते हैं जब आप sketching कर रहे हों:
precise alignment, कोई hidden coupling नहीं।

## Sharing = समान identity

एक साझा पॉइंट एक object है जिसे कई shapes reference करते हैं।
इसे एक बार हिलाएं, हर shape जो reference रखता है उसके साथ
हिलता है।

आप क्लिक करते समय <kbd>Alt</kbd> दबाए रखकर, या segment-editing
मोड में एक vertex को मौजूदा पर drag करके, साझा पॉइंट बनाते हैं।

यह वह है जो आप उन बाउंड्री के लिए चाहते हैं जो कभी अलग नहीं
होनी चाहिए — दो आसन्न लेन edges, दो polygon corners जिन्हें
welded रहना चाहिए, एक path का end और दूसरे की start।

## क्यों भेद करें

यदि दो shape edges जो समान होने चाहिए वास्तव में दो snapped
पॉइंट हैं, उनमें से एक को drag करें, OpenDRIVE में एक्सपोर्ट
करें, और सड़क नेटवर्क उस vertex पर खुल जाता है। Simulator
gap को discontinuity के रूप में interpret कर सकता है, या
टूल के अनुसार उस पर smear कर सकता है।

एक बाउंड्री साझा करने वाले Lane Left/Right पड़ोसी हमेशा
internally साझा पॉइंट का उपयोग करते हैं — यह optional नहीं
है और user-controlled नहीं है। मनमानी shapes (Linestring,
Polygon, Path) के लिए, choice आप पर है।

## Visual cues

- एक snap target एक single highlighted handle दिखाता है और
  cursor को pull करता है।
- एक साझा पॉइंट segment-editing मोड में एक doubled handle के
  रूप में render होता है।

## इसे भी देखें

- [मौजूदा ज्योमेट्री पर snap करें](/hi/guides/snap/)
- [shapes के बीच पॉइंट साझा करें](/hi/guides/point-sharing/)
