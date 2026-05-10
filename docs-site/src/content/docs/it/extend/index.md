---
title: Estendere drawtonomy
description: Costruisci estensioni, aggiungi formati target, contribuisci con template.
sidebar:
  order: 0
---

drawtonomy è costruito per essere esteso. Lo stesso SDK che
alimenta le estensioni in-tree (AI Scene Generator, Template
Preview, Exporter Playground) è quello che usi tu.

## Scegli il tuo punto di estensione

| Vuoi… | Leggi |
|---|---|
| Aggiungere un pannello, un generatore o uno strumento che gira insieme all'editor | [SDK delle estensioni](/it/extend/extension-sdk/) |
| Aggiungere un nuovo target di esportazione (CARLA, Unity, SUMO, …) | [SDK degli esportatori](/it/extend/exporter-sdk/) |
| Contribuire con un nuovo template SVG (veicolo, pedone, segnale) | [Template](/it/extend/templates/) |

## Dove vive il sorgente

Tutto è nel
[repository GitHub di drawtonomy](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — l'SDK
- `packages/drawtonomy-dev-server/` — editor locale per lo
  sviluppo
- `extensions/` — estensioni in-tree, utili come riferimento
- `templates/` — template integrati delle forme

Le PR sono benvenute. La
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
guida nell'aggiunta di una forma personalizzata dall'inizio alla
fine.
