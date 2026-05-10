---
title: Utöka drawtonomy
description: Bygg tillägg, lägg till målformat, bidra med mallar.
sidebar:
  order: 0
---

drawtonomy är byggt för att utökas. Samma SDK som driver de
inbyggda tilläggen (AI Scene Generator, Template Preview, Exporter
Playground) är vad du använder.

## Välj din förlängningspunkt

| Du vill… | Läs |
|---|---|
| Lägga till en panel, generator eller verktyg som körs vid sidan av redigeraren | [Extension SDK](/sv/extend/extension-sdk/) |
| Lägga till ett nytt exportmål (CARLA, Unity, SUMO, …) | [Exporter SDK](/sv/extend/exporter-sdk/) |
| Bidra med en ny SVG-mall (fordon, fotgängare, skylt) | [Mallar](/sv/extend/templates/) |

## Var källkoden bor

Allt finns i det publika
[drawtonomy GitHub-arkivet](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK:n
- `packages/drawtonomy-dev-server/` — lokal redigerare för
  utveckling
- `extensions/` — inbyggda tillägg, användbara som referenser
- `templates/` — inbyggda formmallar

PR:er välkomnas.
[Mallguiden](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
går igenom att lägga till en anpassad form från början till slut.
