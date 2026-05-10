---
title: Extension SDK
description: Iframe-Erweiterungen mit @drawtonomy/sdk und @drawtonomy/dev-server entwickeln.
keywords:
  - drawtonomy SDK
  - Extension SDK
  - drawtonomy Erweiterung entwickeln
  - postMessage Editor
  - drawtonomy dev-server
  - Whiteboard für autonomes Fahren
---

drawtonomy-Erweiterungen sind in Iframes gehostete Web-Apps, die mit
dem Editor über `postMessage` kommunizieren. Das SDK liefert einen
typisierten Client; der Dev-Server liefert einen lokalen Editor zum
Entwickeln.

Diese Seite ist eine schnelle Orientierung. Die vollständige
Anleitung — Manifest-Schema, Capability-Liste, Nachrichtenprotokoll
— liegt im öffentlichen Repo:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Schnellstart

```bash
# Editor auf :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Ihre Erweiterung auf :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Minimale Erweiterung

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

## Referenz-Erweiterungen

Die mitgelieferten Erweiterungen sind vollständige Beispiele:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — Szenenerzeugung aus natürlicher Sprache und OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — Vorschau einer Formvorlage.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — den Exporter gegen einen lebenden Canvas testen.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path-Footprint-Experimente.

## Siehe auch

- [Erweiterungs-Architektur](/de/explanation/extension-architecture/)
  — warum Iframes, warum postMessage.
- [`@drawtonomy/sdk`-Übersicht](/de/reference/sdk/) — das Paket und
  seine Module.
