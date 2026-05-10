---
title: Extension SDK
description: Bygg iframe-tillägg med @drawtonomy/sdk och @drawtonomy/dev-server.
---

drawtonomy-tillägg är iframe-hostade webbappar som pratar med
redigeraren via `postMessage`. SDK:n ger dig en typad klient;
utvecklingsservern ger dig en lokal redigerare att utveckla mot.

Den här sidan är en snabborientering. Den fullständiga guiden —
manifestschema, capabilities-lista, meddelandeprotokoll — finns
i det publika arkivet:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Snabbstart

```bash
# Redigerare på :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Ditt tillägg på :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Minsta tillägg

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

## Referenstillägg

De inbyggda tilläggen är fullkvalitativa exempel:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — scen-generering på naturligt språk och OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — förhandsgranska en formmall.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — träna exportören mot en levande canvas.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint-experimentation.

## Se även

- [Tilläggsarkitektur](/sv/explanation/extension-architecture/) —
  varför iframes, varför postMessage.
- [`@drawtonomy/sdk`-översikt](/sv/reference/sdk/) — paketet och dess
  moduler.
