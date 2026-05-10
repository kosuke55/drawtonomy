---
title: Extension architecture
description: drawtonomy तीसरे पक्ष के एक्सटेंशन को कैसे load, isolate, और बात करता है।
---

drawtonomy एक्सटेंशन एडिटर में compiled plugins नहीं हैं।
वे एक iframe में load किए गए अलग web apps हैं, जो
`postMessage` के माध्यम से host के साथ communicate करते हैं।
यह पेज समझाता है क्यों, और उस choice से क्या निकलता है।

## Loading

एक एक्सटेंशन एक `manifest.json` पर pointing करने वाला URL है।
उपयोगकर्ता (या एक deep-link) `?ext=<manifestUrl>` के साथ
एडिटर खोलता है:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

एडिटर manifest fetch करता है, एक iframe बनाता है, और एक्सटेंशन
का entry HTML load करता है। एक साथ कई एक्सटेंशन repeated
`?ext=` parameters के साथ load किए जा सकते हैं।

## Isolation

एक्सटेंशन अपने own origin के साथ एक iframe के अंदर चलते हैं।
वे नहीं कर सकते:

- एडिटर के DOM को सीधे touch नहीं कर सकते।
- drawtonomy के localStorage को पढ़ नहीं सकते।
- host के CSP से past resources load नहीं कर सकते।

वे वह कर सकते हैं जो वे manifest के `capabilities` array में
मांगते हैं (`shapes:read`, `shapes:write`, `ui:panel`, …) और
जो `postMessage` `@drawtonomy/sdk` के `ExtensionClient` के
माध्यम से expose करता है।

यह intentional है। एक्सटेंशन third-party code हैं; एडिटर
उन्हें untrusted मानता है।

## Communication

SDK `postMessage` को एक `ExtensionClient` में wrap करता है जो
आपको एक typed, promise-based API देता है:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Hood के नीचे:

- एक्सटेंशन host iframe को एक request post करता है।
- Host एक्सटेंशन की capabilities के विरुद्ध validate करता है।
- Host respond करता है, या request rejected होती है।

## iframes क्यों

विकल्प — npm-style plugins, Webpack module federation,
in-process scripts — सभी को आपके एडिटर के साथ एक्सटेंशन के
code पर भरोसा करने की आवश्यकता होती है। वे एक्सटेंशन
lifetimes को एडिटर के build के साथ couple भी करते हैं।

iframes आपको देते हैं:

- **Origin isolation**, browser-enforced — कोई JS sandbox
  maintain नहीं करना है।
- **Independent deploy cycles** — एक्सटेंशन अपनी गति से
  ship होते हैं।
- **कोई भी framework** — React, Vue, Svelte, vanilla JS;
  host को परवाह नहीं है।
- **Dev और prod में समान code** — dev server एडिटर को
  `localhost:3000` पर host करता है; आप इसे अपने एक्सटेंशन को
  `localhost:3001` पर point करते हैं। समान `?ext=` flag,
  समान protocol।

Trade-off यह है कि `postMessage` async है। ऐसे calls जो
free दिखते हैं (`getShapes()`) एक iframe round-trip cost
करते हैं। SDK जहां कर सकता है वहां batch और cache करता है;
एक tight loop के अंदर एक call न डालें।

## Local development

`@drawtonomy/dev-server` package एडिटर को locally serve करता
है ताकि आप network round-trip के बिना इसके विरुद्ध develop
कर सकें:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor on :3000
cd my-extension && pnpm dev --port 3001        # extension on :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

पूरा गाइड public repo में है:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)।

## इसे भी देखें

- [Extension SDK API](/hi/extend/extension-sdk/)
- [`@drawtonomy/sdk` overview](/hi/reference/sdk/)
