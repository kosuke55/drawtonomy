---
title: Extension SDK
description: '@drawtonomy/sdk और @drawtonomy/dev-server के साथ iframe एक्सटेंशन बनाएं।'
---

drawtonomy एक्सटेंशन iframe-hosted web apps हैं जो एडिटर से
`postMessage` के माध्यम से बात करते हैं। SDK आपको एक typed
client देता है; dev-server आपको उसके विरुद्ध develop करने के
लिए एक local एडिटर देता है।

यह पेज एक त्वरित orientation है। पूरा गाइड — manifest schema,
capabilities list, message protocol — public repo में है:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Quick start

```bash
# Editor on :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Your extension on :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## न्यूनतम एक्सटेंशन

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## Reference एक्सटेंशन

In-tree एक्सटेंशन full-fidelity examples हैं:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — natural-language और OpenSCENARIO दृश्य generation।
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — एक shape टेम्पलेट preview करें।
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — एक live कैनवस के विरुद्ध exporter exercise करें।
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint experimentation।

## इसे भी देखें

- [Extension architecture](/hi/explanation/extension-architecture/) —
  iframes क्यों, postMessage क्यों।
- [`@drawtonomy/sdk` overview](/hi/reference/sdk/) — package और
  इसके modules।
