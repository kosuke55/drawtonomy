---
title: SDK rozszerzeń
description: Buduj rozszerzenia iframe za pomocą @drawtonomy/sdk i @drawtonomy/dev-server.
---

Rozszerzenia drawtonomy to aplikacje webowe hostowane w iframe, które
rozmawiają z edytorem przez `postMessage`. SDK daje ci typowanego
klienta; dev-server daje ci lokalny edytor do rozwoju.

Ta strona to szybkie wprowadzenie. Pełny przewodnik — schemat
manifestu, lista zdolności, protokół wiadomości — znajduje się w
publicznym repo:

➡ **[Przewodnik Rozwoju Rozszerzeń](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Szybki start

```bash
# Edytor na :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Twoje rozszerzenie na :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Minimalne rozszerzenie

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

## Rozszerzenia referencyjne

Wbudowane rozszerzenia są przykładami pełnej wierności:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — generowanie scen w języku naturalnym i OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — podgląd szablonu kształtu.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — testowanie eksportera względem żywego płótna.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — eksperymentowanie ze Śladem Trasy.

## Zobacz także

- [Architektura rozszerzeń](/pl/explanation/extension-architecture/) —
  dlaczego iframe, dlaczego postMessage.
- [Przegląd `@drawtonomy/sdk`](/pl/reference/sdk/) — pakiet i jego
  moduły.
