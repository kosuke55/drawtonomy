---
title: Een ROS OccupancyGrid (.pgm + .yaml) importeren
description: Laad een ROS map_server occupancy grid (.pgm + .yaml) — gebouwd met nav2, Cartographer of Gmapping — als achtergrondlaag in drawtonomy en schets vervolgens paden, rijstroken en obstakels eroverheen.
keywords:
  - ROS occupancy grid annotatie
  - nav2 kaart editor
  - cartographer kaart viewer
  - tekenen op pgm-kaart
  - SLAM-kaart annotatietool
---

drawtonomy begrijpt het ROS `map_server`-formaat dat door
[nav2](https://navigation.ros.org/), Cartographer, Gmapping en
vergelijkbare SLAM-tools wordt gebruikt.

![Een ROS occupancy grid geïmporteerd in drawtonomy met pijlen en stellingen erbovenop getekend](/img/ros-occupancy-grid.png)

De screenshot toont een echt warehouse occupancy grid (bezette
cellen zwart, vrije cellen wit) met paden en obstakels er direct
overheen getekend in drawtonomy.

## Importeren

1. Open het **File**-menu → **Import**.
2. Selecteer **zowel** het `.pgm`- als het bijpassende
   `.yaml`-bestand samen in het bestandsdialoogvenster.
3. drawtonomy leest de YAML-metadata (resolutie, drempelwaarden)
   en geeft het grid weer op het canvas.

Als u alleen het `.pgm` selecteert en geen `.yaml`, gebruikt
drawtonomy standaardwaarden (`resolution = 0.05 m/px`,
standaard occupancy-drempelwaarden).

## Celkleuring

| Cel | Kleur |
|---|---|
| Bezet | Zwart |
| Vrij | Wit |
| Onbekend | Grijs |

Cellen worden weergegeven op een schaal die overeenkomt met de
rijstrookafmetingen van drawtonomy, zodat u rijstroken, paden en
vormen er direct overheen kunt tekenen — precies zoals de
screenshot hierboven.

## Geteste tools

drawtonomy is gebruikt met kaarten van nav2, Cartographer en
Gmapping. Andere producenten zouden moeten werken zolang ze het
standaard `map_server` `.pgm` + `.yaml`-paar uitsturen.

## Zie ook

- [Een Lanelet2 (.osm)-bestand importeren](/nl/guides/import-lanelet2/)
