---
title: Ein ROS OccupancyGrid (.pgm + .yaml) importieren
description: Laden Sie ein ROS-map_server-Belegungsgitter (.pgm + .yaml) — gebaut mit nav2, Cartographer oder Gmapping — als Hintergrundebene in drawtonomy und skizzieren Sie Pfade, Fahrspuren und Hindernisse darüber.
keywords:
  - ROS Belegungsgitter-Annotation
  - nav2 Karteneditor
  - cartographer Kartenviewer
  - auf pgm Karte zeichnen
  - SLAM Karte Annotation
  - Whiteboard für autonomes Fahren
  - ROS map_server
---

drawtonomy versteht das ROS-`map_server`-Format, das von
[nav2](https://navigation.ros.org/), Cartographer, Gmapping und
ähnlichen SLAM-Tools verwendet wird.

![Ein ROS-Belegungsgitter, in drawtonomy importiert, mit darübergezeichneten Pfeilen und Regalen](/img/ros-occupancy-grid.png)

Der Screenshot zeigt ein reales Belegungsgitter eines Lagers
(belegte Zellen schwarz, freie Zellen weiß) mit Pfaden und
Hindernissen, die in drawtonomy direkt darüber gezeichnet sind.

## Import

1. Öffnen Sie das Menü **File** → **Import**.
2. Wählen Sie im Dateidialog **beide** Dateien gemeinsam aus:
   die `.pgm` und die zugehörige `.yaml`.
3. drawtonomy liest die YAML-Metadaten (Auflösung, Schwellwerte)
   und rendert das Gitter auf dem Canvas.

Wenn Sie nur die `.pgm` ohne `.yaml` auswählen, verwendet drawtonomy
Standardwerte (`resolution = 0.05 m/px`, Standard-Belegungsschwellen).

## Zellfärbung

| Zelle | Farbe |
|---|---|
| Belegt | Schwarz |
| Frei | Weiß |
| Unbekannt | Grau |

Die Zellen werden in einem Maßstab gerendert, der zu den
Spurmaßen von drawtonomy passt, sodass Sie Fahrspuren, Pfade und
Formen direkt darüber zeichnen können — genau wie im Screenshot
oben.

## Getestete Tools

drawtonomy wurde mit Karten von nav2, Cartographer und Gmapping
verwendet. Andere Erzeuger sollten funktionieren, solange sie das
Standard-`map_server`-Paar `.pgm` + `.yaml` ausgeben.

## Siehe auch

- [Eine Lanelet2-Datei (.osm) importieren](/de/guides/import-lanelet2/)
