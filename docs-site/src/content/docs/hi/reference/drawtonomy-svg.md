---
title: drawtonomy.svg फ़ॉर्मैट
description: एक पुनः-संपादन योग्य drawtonomy फ़ाइल की on-disk संरचना।
---

एक `drawtonomy.svg` फ़ाइल एक नियमित SVG है जो editor-only
state record करने वाले metadata के साथ augmented है।

## संरचना

- visual content (paths, text, images) plain SVG है। कोई भी
  SVG व्यूअर इसे सही ढंग से render करता है।
- document के शीर्ष पर एक `<metadata>` block drawtonomy-specific
  डेटा रखता है:
  - shape ID और per-shape props (template, style, etc.)
  - लेन कनेक्शन slots (`next`, `previous`, `left`, `right`)
  - साझा-पॉइंट references
  - Footprint group membership
  - z-order

## Compatibility

एक generic SVG editor (Illustrator, Inkscape, ब्राउज़र) में
`drawtonomy.svg` एडिट करना save पर metadata block drop कर देता
है जब तक आप इसे explicitly preserve नहीं करते। drawtonomy अभी
भी परिणाम खोल सकता है, लेकिन कनेक्शन और साझा पॉइंट गायब होंगे।

drawtonomy के बाहर round-trippable edits के लिए, SDK
([`@drawtonomy/sdk`](/hi/reference/sdk/)) का उपयोग करें — यह एडिटर
के माध्यम से जाए बिना फ़ॉर्मैट पढ़ और लिख सकता है।

## Versioning

पुरानी फ़ाइलें इम्पोर्ट पर स्वचालित रूप से migrate होती हैं।
SDK में `resolveColorKey()` helper legacy color keys (उदाहरण
के लिए, v1.x `grey-700`) को वर्तमान वालों में बदलता है।

## इसे भी देखें

- [अपना दृश्य एक्सपोर्ट करें](/hi/guides/export/)
- [`@drawtonomy/sdk` overview](/hi/reference/sdk/)
