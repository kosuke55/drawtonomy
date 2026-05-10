---
title: drawtonomy erweitern
description: Erweiterungen entwickeln, neue Zielformate hinzufügen, Vorlagen beisteuern.
sidebar:
  order: 0
---

drawtonomy ist auf Erweiterbarkeit ausgelegt. Dasselbe SDK, das die
mitgelieferten Erweiterungen (AI Scene Generator, Template Preview,
Exporter Playground) antreibt, steht auch Ihnen zur Verfügung.

## Wählen Sie Ihren Erweiterungspunkt

| Sie möchten… | Lesen Sie |
|---|---|
| Ein Panel, einen Generator oder ein Werkzeug ergänzen, das neben dem Editor läuft | [Extension SDK](/de/extend/extension-sdk/) |
| Ein neues Exportziel hinzufügen (CARLA, Unity, SUMO, …) | [Exporter SDK](/de/extend/exporter-sdk/) |
| Eine neue SVG-Vorlage beisteuern (Fahrzeug, Fußgänger, Schild) | [Templates](/de/extend/templates/) |

## Wo der Quellcode liegt

Alles befindet sich im öffentlichen
[drawtonomy-GitHub-Repository](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — das SDK
- `packages/drawtonomy-dev-server/` — lokaler Editor für die
  Entwicklung
- `extensions/` — mitgelieferte Erweiterungen, nützlich als
  Referenzen
- `templates/` — integrierte Formvorlagen

PRs sind willkommen. Der
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
führt durch das End-to-End-Hinzufügen einer eigenen Form.
