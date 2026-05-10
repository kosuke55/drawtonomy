---
title: SDK de Extensões
description: Construa extensões iframe com @drawtonomy/sdk e @drawtonomy/dev-server.
---

As extensões do drawtonomy são aplicações web hospedadas em iframe
que conversam com o editor através de `postMessage`. O SDK lhe dá
um cliente tipado; o dev-server lhe dá um editor local para
desenvolver contra.

Esta página é uma orientação rápida. O guia completo — esquema do
manifesto, lista de capacidades, protocolo de mensagens — está no
repositório público:

➡ **[Guia de Desenvolvimento de Extensões](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Início rápido

```bash
# Editor em :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Sua extensão em :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Extensão mínima

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

## Extensões de referência

As extensões in-tree são exemplos completos:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — geração de cena em linguagem natural e OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — pré-visualizar um modelo de forma.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — exercitar o exportador contra uma tela ao vivo.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — experimentação com Pegada de Trajetória.

## Veja também

- [Arquitetura de extensões](/pt/explanation/extension-architecture/) —
  por que iframes, por que postMessage.
- [Visão geral do `@drawtonomy/sdk`](/pt/reference/sdk/) — o pacote e
  seus módulos.
