---
title: SDK delle estensioni
description: Costruisci estensioni iframe con @drawtonomy/sdk e @drawtonomy/dev-server.
---

Le estensioni di drawtonomy sono web app ospitate in iframe che
dialogano con l'editor tramite `postMessage`. L'SDK ti fornisce
un client tipizzato; il dev-server ti fornisce un editor locale
contro cui sviluppare.

Questa pagina è un orientamento rapido. La guida completa —
schema del manifest, elenco delle capabilities, protocollo dei
messaggi — è nel repo pubblico:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Avvio rapido

```bash
# Editor su :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# La tua estensione su :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Estensione minima

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

## Estensioni di riferimento

Le estensioni in-tree sono esempi a piena fedeltà:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — generazione di scene in linguaggio naturale e OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — anteprima di un template di forma.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — eseguire l'esportatore contro una tela in tempo reale.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — sperimentazione con Path Footprint.

## Vedi anche

- [Architettura delle estensioni](/it/explanation/extension-architecture/) —
  perché iframe, perché postMessage.
- [Panoramica `@drawtonomy/sdk`](/it/reference/sdk/) — il pacchetto
  e i suoi moduli.
