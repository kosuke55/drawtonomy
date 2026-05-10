---
title: SDK d'extension
description: Construire des extensions iframe avec @drawtonomy/sdk et @drawtonomy/dev-server.
---

Les extensions drawtonomy sont des applications web hébergées en iframe qui dialoguent avec l'éditeur via `postMessage`. Le SDK fournit un client typé ; le dev-server fournit un éditeur local sur lequel développer.

Cette page est une orientation rapide. Le guide complet — schéma du manifeste, liste des capacités, protocole des messages — est dans le dépôt public :

➡ **[Guide de développement d'extensions](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Démarrage rapide

```bash
# Éditeur sur :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Votre extension sur :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Extension minimale

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

## Extensions de référence

Les extensions intégrées sont des exemples pleine fidélité :

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — génération de scènes en langage naturel et OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — prévisualisation d'un modèle de forme.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — exercer l'exporteur face à un canevas en direct.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — expérimentation autour de l'empreinte de trajectoire.

## Voir aussi

- [Architecture des extensions](/fr/explanation/extension-architecture/) — pourquoi des iframes, pourquoi postMessage.
- [Vue d'ensemble de `@drawtonomy/sdk`](/fr/reference/sdk/) — le paquet et ses modules.
