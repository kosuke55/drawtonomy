---
title: Архитектура экспортёра
description: Как холст становится снимком, а снимок — файлом.
---

Экспортёр — это мост между данными drawtonomy внутри редактора и
внешними форматами — OpenDRIVE, OpenSCENARIO, Lanelet2 или чем
угодно, что вы подключите следующим. Понимание пайплайна — это
предусловие для добавления нового целевого формата.

## Пайплайн

```
Состояние редактора ──► DrawtonomySnapshot ──► Экспортёр ──► Файл / blob
                        (сериализуемый)        (чистый)
```

### 1. `DrawtonomySnapshot`

Снимок — это обычный объект: список фигур плюс штамп версии и
временная метка. Он сериализуем, не имеет ссылок на DOM и является
единственным входом, который принимает экспортёр.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Снимок строится через `createSnapshot(shapes)` или парсингом
сохранённого `drawtonomy.svg` через `parseDrawtonomySvg(svg)`.

### 2. Модули экспортёра

Каждый целевой формат — отдельная чистая функция:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Они принимают снимок и возвращают строку или blob. Никакого доступа
к редактору, DOM или асинхронных зависимостей. Тот же вход — тот же
выход.

### 3. Обмен

Для Lanelet2 SDK также поставляет парсер:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Это то, что обеспечивает работу
[импорта Lanelet2](/ru/guides/import-lanelet2/).

## Почему чистые функции

Экспортёр выполняет один и тот же путь кода в браузере, в
Node-CI-скрипте, в серверном пайплайне или в браузерном расширении.
Тесты прогоняются против фикстур-снимков без headless-браузера.

Поэтому экспортёр живёт в `@drawtonomy/sdk`, а не внутри редактора —
редактор зависит от SDK, а не наоборот.

## Добавление целевого формата

Экспортёр — это основная точка расширения для новых целей — CARLA,
Unity, SUMO, кастомные DSL. Рецепт:

1. Добавьте новый модуль под `packages/drawtonomy-sdk/src/exporter/`.
2. Принимайте `DrawtonomySnapshot` на входе, возвращайте строку или
   blob.
3. Добавьте тесты под `packages/drawtonomy-sdk/__tests__/exporter/`,
   используя фикстуры-снимки.
4. Подключите UI-точку входа, если хотите, чтобы меню Export
   редактора знало о ней (опционально — многие пользователи будут
   вызывать программно).

Полное руководство разработчика — в публичном репозитории:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## См. также

- [Экспорт в OpenDRIVE / OpenSCENARIO / esmini](/ru/guides/export-asam/) —
  пользовательский поток.
- [Обзор `@drawtonomy/sdk`](/ru/reference/sdk/)
- [API SDK экспортёра](/ru/extend/exporter-sdk/)
