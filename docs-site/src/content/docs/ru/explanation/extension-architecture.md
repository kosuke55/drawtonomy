---
title: Архитектура расширений
description: Как drawtonomy загружает, изолирует и общается со сторонними расширениями.
---

Расширения drawtonomy — это не плагины, скомпилированные в редактор.
Это отдельные веб-приложения, загружаемые в iframe, общающиеся с
хостом через `postMessage`. Эта страница объясняет почему и что из
этого выбора следует.

## Загрузка

Расширение — это URL, указывающий на `manifest.json`. Пользователь
(или deep-link) открывает редактор с `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Редактор загружает манифест, создаёт iframe и подгружает HTML точки
входа расширения. Несколько расширений можно загрузить одновременно
повторяющимися параметрами `?ext=`.

## Изоляция

Расширения работают внутри iframe со своим собственным origin. Они
не могут:

- Напрямую трогать DOM редактора.
- Читать localStorage drawtonomy.
- Загружать ресурсы вне CSP хоста.

Они могут делать то, что просят в массиве `capabilities` манифеста
(`shapes:read`, `shapes:write`, `ui:panel`, …) и то, что
`postMessage` раскрывает через `ExtensionClient` из
`@drawtonomy/sdk`.

Это намеренно. Расширения — это сторонний код; редактор относится к
ним как к недоверенным.

## Коммуникация

SDK оборачивает `postMessage` в `ExtensionClient`, который даёт
типизированный API на промисах:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Под капотом:

- Расширение посылает запрос в iframe хоста.
- Хост валидирует против capabilities расширения.
- Хост отвечает или запрос отклоняется.

## Почему iframe

Альтернативы — npm-плагины, Webpack module federation, в-процессные
скрипты — все требуют доверять коду расширения в вашем редакторе.
Они также связывают жизненный цикл расширения с билдом редактора.

iframe дают:

- **Изоляцию по origin**, обеспечиваемую браузером — никакой
  JS-песочницы поддерживать не нужно.
- **Независимые циклы развёртывания** — расширения выходят в свой
  темп.
- **Любой фреймворк** — React, Vue, Svelte, чистый JS; хосту всё
  равно.
- **Тот же код в dev и prod** — dev-сервер размещает редактор на
  `localhost:3000`; вы указываете на ваше расширение по
  `localhost:3001`. Тот же флаг `?ext=`, тот же протокол.

Цена в том, что `postMessage` асинхронен. Вызовы, которые выглядят
бесплатными (`getShapes()`), стоят раунд-трипа iframe. SDK
группирует и кэширует, где может; не помещайте вызов в плотный
цикл.

## Локальная разработка

Пакет `@drawtonomy/dev-server` обслуживает редактор локально, чтобы
вы могли разрабатывать против него без сетевого раунд-трипа:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # редактор на :3000
cd my-extension && pnpm dev --port 3001        # расширение на :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Полное руководство в публичном репозитории:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## См. также

- [API SDK расширений](/ru/extend/extension-sdk/)
- [Обзор `@drawtonomy/sdk`](/ru/reference/sdk/)
