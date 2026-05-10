---
title: Importera en ROS OccupancyGrid (.pgm + .yaml)
description: Ladda en ROS map_server occupancy grid (.pgm + .yaml) — byggd med nav2, Cartographer eller Gmapping — i drawtonomy som ett bakgrundslager och skissa sedan banor, körfält och hinder ovanpå.
keywords:
  - ROS occupancy grid annotering
  - nav2 kartredigerare
  - cartographer kart-viewer
  - rita på pgm-karta
  - SLAM-kartannoteringsverktyg
  - robotik kartannotering
---

drawtonomy förstår ROS `map_server`-formatet som används av
[nav2](https://navigation.ros.org/), Cartographer, Gmapping och
liknande SLAM-verktyg.

![En ROS occupancy grid importerad till drawtonomy med pilar och hyllor ritade ovanpå](/img/ros-occupancy-grid.png)

Skärmdumpen visar ett verkligt lageroccupancy grid (upptagna
celler svarta, fria celler vita) med banor och hinder ritade
direkt över det inuti drawtonomy.

## Importera

1. Öppna **File**-menyn → **Import**.
2. Välj **både** `.pgm`- och matchande `.yaml`-filen tillsammans
   i fildialogrutan.
3. drawtonomy läser YAML-metadata (upplösning, trösklar) och
   renderar rutnätet på canvasen.

Om du bara väljer `.pgm` och ingen `.yaml`, använder drawtonomy
standardvärden (`resolution = 0.05 m/px`, standardupptagningströsklar).

## Cellfärgning

| Cell | Färg |
|---|---|
| Upptagen | Svart |
| Fri | Vit |
| Okänd | Grå |

Celler renderas i en skala som matchar drawtonomys
körfältsdimensioner, så att du kan rita körfält, banor och former
direkt ovanpå — exakt som skärmdumpen ovan.

## Verktyg som testats

drawtonomy har använts med kartor från nav2, Cartographer och
Gmapping. Andra producenter bör fungera så länge de emitterar
standardparet `map_server` `.pgm` + `.yaml`.

## Se även

- [Importera en Lanelet2 (.osm)-fil](/sv/guides/import-lanelet2/)
