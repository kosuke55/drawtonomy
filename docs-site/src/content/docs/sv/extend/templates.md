---
title: Bidra med mallar
description: Lägg till en ny mall för fordon, fotgängare, skylt eller vägmarkering.
---

Mallar är SVG-filer plus en manifestpost. När de väl bidragits
visas de i redigerarens Participants- och formmenyer bredvid de
inbyggda mallarna.

Bidragsflödet finns i det publika arkivet:

➡ **[Mallguide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Kategorier

| Mapp | Exempel |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, pilmarkeringar |
| `templates/sign/` | Stop, väjningsplikt, signalhuvuden |
| `templates/other/` | Allt annat |

## Process

1. Lägg till din SVG under rätt kategorimapp.
2. Registrera den i `templates/manifest.json`.
3. Öppna en PR. Inkludera en skärmdump av mallen placerad på
   canvasen.

## Vad som gör en bra mall

- Ritad i en rimlig standardstorlek (fordon runt 4–5 m för en
  sedan).
- En enskild färgändringsbar region markerad med en känd fyllning,
  så att attributpanelens färgväljare kan färga om den.
- Inga externa typsnittsreferenser — text konverteras till paths
  om den finns.
- Rimlig filstorlek (under ~30 KB för en mall i fordonsstorlek).
