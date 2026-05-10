---
title: Vorlagen beisteuern
description: Eine neue Fahrzeug-, Fußgänger-, Schilder- oder Fahrbahnmarkierungs-Vorlage hinzufügen.
keywords:
  - drawtonomy Vorlage
  - SVG Fahrzeugvorlage
  - Fußgängervorlage
  - Schilder-Vorlage
  - Fahrbahnmarkierung Vorlage
  - drawtonomy beitragen
  - Whiteboard für autonomes Fahren
---

Vorlagen sind SVG-Dateien plus ein Manifest-Eintrag. Einmal
beigesteuert erscheinen sie im Editor in den Menüs Participants und
Shape neben den eingebauten Vorlagen.

Der Beitrags-Workflow liegt im öffentlichen Repo:

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Kategorien

| Ordner | Beispiele |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Lkw, Motorrad |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Zebrastreifen, Pfeilmarkierungen |
| `templates/sign/` | Stop, Vorfahrt gewähren, Signalköpfe |
| `templates/other/` | Alles andere |

## Ablauf

1. Legen Sie Ihr SVG im passenden Kategorien-Ordner ab.
2. Registrieren Sie es in `templates/manifest.json`.
3. Öffnen Sie einen PR. Fügen Sie einen Screenshot der auf dem
   Canvas platzierten Vorlage bei.

## Was eine gute Vorlage ausmacht

- In sinnvoller Standardgröße gezeichnet (Fahrzeuge etwa 4–5 m
  für einen Sedan).
- Eine einzelne, farblich änderbare Region mit bekannter Füllung,
  damit der Farbwähler im Attribute Panel sie umfärben kann.
- Keine externen Schriftartenreferenzen — Text wird, falls
  vorhanden, in Pfade umgewandelt.
- Vernünftige Dateigröße (unter ~30 KB für eine
  fahrzeuggroße Vorlage).
