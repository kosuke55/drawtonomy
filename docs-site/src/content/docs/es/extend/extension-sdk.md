---
title: SDK de extensiones
description: Construye extensiones en iframe con @drawtonomy/sdk y @drawtonomy/dev-server.
---

Las extensiones de drawtonomy son aplicaciones web alojadas en
iframe que se comunican con el editor mediante `postMessage`. El
SDK te da un cliente tipado; el dev-server te da un editor local
contra el que desarrollar.

Esta página es una orientación rápida. La guía completa — esquema
del manifest, lista de capabilities, protocolo de mensajes — está
en el repo público:

➡ **[Guía de Desarrollo de Extensiones](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Inicio rápido

```bash
# Editor en :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Tu extensión en :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Extensión mínima

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

## Extensiones de referencia

Las extensiones internas son ejemplos de fidelidad completa:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — generación de escenas en lenguaje natural y OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — vista previa de una plantilla de forma.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — ejercita el exportador contra un lienzo en vivo.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — experimentación con Path Footprint.

## Véase también

- [Arquitectura de extensiones](/es/explanation/extension-architecture/) —
  por qué iframes, por qué postMessage.
- [Resumen de `@drawtonomy/sdk`](/es/reference/sdk/) — el paquete y
  sus módulos.
