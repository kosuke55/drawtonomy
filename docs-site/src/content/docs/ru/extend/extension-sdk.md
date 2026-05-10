---
title: SDK расширений
description: Создавайте iframe-расширения с @drawtonomy/sdk и @drawtonomy/dev-server.
---

Расширения drawtonomy — это веб-приложения в iframe, которые
общаются с редактором через `postMessage`. SDK даёт типизированного
клиента; dev-сервер даёт локальный редактор для разработки.

Эта страница — быстрая ориентация. Полное руководство — схема
манифеста, список capabilities, протокол сообщений — в публичном
репозитории:

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Быстрый старт

```bash
# Редактор на :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Ваше расширение на :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Минимальное расширение

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

## Эталонные расширения

Встроенные расширения — это полноценные образцы:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — генерация сцен из естественного языка и OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — превью шаблона фигуры.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — отработка экспортёра против живого холста.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — экспериментирование с Path Footprint.

## См. также

- [Архитектура расширений](/ru/explanation/extension-architecture/) —
  почему iframe, почему postMessage.
- [Обзор `@drawtonomy/sdk`](/ru/reference/sdk/) — пакет и его
  модули.
