---
title: Extensie-SDK
description: Bouw iframe-extensies met @drawtonomy/sdk en @drawtonomy/dev-server.
---

drawtonomy-extensies zijn in een iframe gehoste web-apps die met
de editor communiceren via `postMessage`. De SDK geeft u een
getypeerde client; de dev-server geeft u een lokale editor om
tegenaan te ontwikkelen.

Deze pagina is een snelle oriëntatie. De volledige handleiding —
manifest-schema, capabilities-lijst, message-protocol — staat in
de openbare repo:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Snelstart

```bash
# Editor op :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Uw extensie op :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Minimale extensie

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

## Referentie-extensies

De in-tree extensies zijn volwaardige voorbeelden:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — scenariocreatie in natuurlijke taal en OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — preview van een vormsjabloon.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — de exporter testen op een live canvas.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint-experimenten.

## Zie ook

- [Extensie-architectuur](/nl/explanation/extension-architecture/) —
  waarom iframes, waarom postMessage.
- [`@drawtonomy/sdk`-overzicht](/nl/reference/sdk/) — het pakket en
  zijn modules.
