---
title: Sjablonen bijdragen
description: Voeg een nieuw voertuig-, voetganger-, bord- of wegmarkeringssjabloon toe.
---

Sjablonen zijn SVG-bestanden plus een manifest-vermelding. Eenmaal
bijgedragen, verschijnen ze in de Participants- en vormmenu's
van de editor naast de ingebouwde sjablonen.

De bijdrageprocedure staat in de openbare repo:

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categorieën

| Map | Voorbeelden |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, pijlmarkeringen |
| `templates/sign/` | Stop, voorrang, signaalkoppen |
| `templates/other/` | Iets anders |

## Proces

1. Voeg uw SVG toe onder de juiste categoriemap.
2. Registreer het in `templates/manifest.json`.
3. Open een PR. Voeg een screenshot toe van het sjabloon op het
   canvas.

## Wat een goed sjabloon maakt

- Getekend op een redelijke standaardgrootte (voertuigen rond
  4–5 m voor een sedan).
- Een enkel kleurveranderbaar gebied gemarkeerd met een bekende
  fill, zodat de kleurkiezer van het Attribuutpaneel het kan
  herkleuren.
- Geen externe lettertype-referenties — tekst wordt indien
  aanwezig naar paths geconverteerd.
- Redelijke bestandsgrootte (onder ~30 KB voor een
  voertuiggrootte sjabloon).
