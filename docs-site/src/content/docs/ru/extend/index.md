---
title: Расширение drawtonomy
description: Создавайте расширения, добавляйте целевые форматы, вносите шаблоны.
sidebar:
  order: 0
---

drawtonomy построен с расчётом на расширения. Тот же SDK, который
питает встроенные расширения (AI Scene Generator, Template Preview,
Exporter Playground), — это то, что используете и вы.

## Выберите свою точку расширения

| Вы хотите… | Читайте |
|---|---|
| Добавить панель, генератор или инструмент, работающий рядом с редактором | [SDK расширений](/ru/extend/extension-sdk/) |
| Добавить новый целевой формат экспорта (CARLA, Unity, SUMO, …) | [SDK экспортёра](/ru/extend/exporter-sdk/) |
| Внести новый SVG-шаблон (транспорт, пешеход, знак) | [Шаблоны](/ru/extend/templates/) |

## Где находится исходный код

Всё в публичном
[GitHub-репозитории drawtonomy](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — локальный редактор для
  разработки
- `extensions/` — встроенные расширения, полезные как образцы
- `templates/` — встроенные шаблоны фигур

PR приветствуются.
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
проводит через добавление пользовательской фигуры от начала до конца.
