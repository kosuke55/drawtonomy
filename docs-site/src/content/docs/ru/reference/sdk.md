---
title: 'Обзор @drawtonomy/sdk'
description: Пакеты, точки входа и как SDK сочетается с редактором.
---

`@drawtonomy/sdk` — это пакет, против которого работают авторы
расширений и headless-инструменты. Он предоставляет:

| Модуль | Назначение |
|---|---|
| `ExtensionClient` | Клиент postMessage для расширений в iframe. |
| Фабричные функции фигур | `createLane()`, `createVehicle()` и т. д. |
| `createSnapshot()` | Построить `DrawtonomySnapshot` из массива фигур. |
| `exporter.*` | Чистые функции, превращающие снимок в OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM. Включает парсер Lanelet2. |
| Типы | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Установка

```bash
pnpm add @drawtonomy/sdk
```

## Сопутствующие пакеты

| Пакет | Назначение |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Сам SDK. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Локальный dev-сервер, размещающий редактор для разработки расширений. |

## Исходный код

Исходный код SDK, тесты и примеры находятся в
[GitHub-репозитории drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## См. также

- [API SDK расширений](/ru/extend/extension-sdk/) — построение
  iframe-расширений.
- [API SDK экспортёра](/ru/extend/exporter-sdk/) — добавление новых
  целевых форматов.
