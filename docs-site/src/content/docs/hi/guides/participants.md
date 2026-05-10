---
title: वाहन, पैदल यात्री, और ट्रैफिक लाइट जोड़ें
description: बिल्ट-इन टेम्पलेट का उपयोग करके कैनवस पर actors और ट्रैफिक elements रखें।
---

drawtonomy में ड्राइविंग सिनारियो में आपके लिए आवश्यक actors
और ट्रैफिक elements के लिए टेम्पलेट उपलब्ध हैं।

## वाहन

1. **Participants** खोलने के लिए <kbd>P</kbd> दबाएं।
2. एक वाहन टेम्पलेट चुनें (Sedan, Bus, Truck, Motorcycle)।
3. रखने के लिए कैनवस पर क्लिक करें। वाहन अपने टेम्पलेट के
   डिफ़ॉल्ट आकार पर drop होता है।

आकार बदलने के लिए corner handle खींचें। एक लेन के साथ align
करने के लिए rotation handle खींचें।

## पैदल यात्री

उसी Participants मेनू में, एक पैदल यात्री टेम्पलेट चुनें
(Walking, Simple)।

## ट्रैफिक लाइट

Participants मेनू में वाहन और पैदल यात्री signals भी शामिल हैं।
उन्हें चौराहे के corners पर रखें। वे static shapes हैं; वे
signal phase नहीं चलाते।

## कस्टम टेम्पलेट

आप अपने स्वयं के SVG टेम्पलेट जोड़ सकते हैं और PR के माध्यम से
योगदान कर सकते हैं।
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
देखें।

## एक पाथ को वाहनों से populate करना

एक पाथ के साथ वाहनों की एक row रखने के लिए (headway आरेखों या
follow-the-leader scenes के लिए),
[Path Footprint](/hi/guides/path-footprint/) का उपयोग करें।
