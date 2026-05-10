---
title: Extension SDK
description: Build iframe extensions with @drawtonomy/sdk and @drawtonomy/dev-server.
---

drawtonomy extensions are iframe-hosted web apps that talk to the
editor through `postMessage`. The SDK gives you a typed client;
the dev-server gives you a local editor to develop against.

This page is a quick orientation. The full guide — manifest
schema, capabilities list, message protocol — is in the public
repo:

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

## Minimum extension

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

## Reference extensions

The in-tree extensions are full-fidelity examples:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — natural-language and OpenSCENARIO scene generation.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — preview a shape template.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — exercise the exporter against a live canvas.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint experimentation.

## See also

- [Extension architecture](/explanation/extension-architecture/) —
  why iframes, why postMessage.
- [`@drawtonomy/sdk` overview](/reference/sdk/) — the package and
  its modules.
