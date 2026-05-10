---
title: drawtonomy को विस्तारित करना
description: एक्सटेंशन बनाएं, target फ़ॉर्मैट जोड़ें, टेम्पलेट योगदान करें।
sidebar:
  order: 0
---

drawtonomy को विस्तारित किया जा सकता है। वही SDK जो in-tree
एक्सटेंशन (AI सीन जनरेटर, Template Preview, Exporter Playground)
को powers करता है वही आप उपयोग करते हैं।

## अपना extension point चुनें

| आप चाहते हैं… | पढ़ें |
|---|---|
| एक पैनल, generator, या टूल जोड़ें जो एडिटर के साथ चले | [Extension SDK](/hi/extend/extension-sdk/) |
| एक नया एक्सपोर्ट target जोड़ें (CARLA, Unity, SUMO, …) | [Exporter SDK](/hi/extend/exporter-sdk/) |
| एक नया SVG टेम्पलेट योगदान करें (वाहन, पैदल यात्री, sign) | [Templates](/hi/extend/templates/) |

## स्रोत कहां रहता है

सब कुछ public
[drawtonomy GitHub repository](https://github.com/kosuke55/drawtonomy)
में है:

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — development के लिए
  local एडिटर
- `extensions/` — in-tree एक्सटेंशन, references के रूप में
  उपयोगी
- `templates/` — बिल्ट-इन shape टेम्पलेट

PRs का स्वागत है।
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
एक custom shape जोड़ने को end-to-end walks करता है।
