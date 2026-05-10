---
title: drawtonomy uitbreiden
description: Bouw extensies, voeg doelformaten toe, draag sjablonen bij.
sidebar:
  order: 0
---

drawtonomy is gebouwd om uitgebreid te worden. Dezelfde SDK die
de in-tree extensies aandrijft (AI Scene Generator, Template
Preview, Exporter Playground) is wat u gebruikt.

## Kies uw uitbreidingspunt

| U wilt… | Lees |
|---|---|
| Een paneel, generator of tool toevoegen die naast de editor draait | [Extensie-SDK](/nl/extend/extension-sdk/) |
| Een nieuw exportdoel toevoegen (CARLA, Unity, SUMO, …) | [Exporter-SDK](/nl/extend/exporter-sdk/) |
| Een nieuw SVG-sjabloon bijdragen (voertuig, voetganger, bord) | [Sjablonen](/nl/extend/templates/) |

## Waar de broncode staat

Alles staat in de openbare
[drawtonomy GitHub-repository](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — de SDK
- `packages/drawtonomy-dev-server/` — lokale editor voor
  ontwikkeling
- `extensions/` — in-tree extensies, handig als referentie
- `templates/` — ingebouwde vormsjablonen

PR's zijn welkom. De
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
loopt end-to-end door het toevoegen van een aangepaste vorm.
