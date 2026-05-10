---
title: Importare una OccupancyGrid ROS (.pgm + .yaml)
description: Carica una griglia di occupazione map_server di ROS (.pgm + .yaml) — costruita con nav2, Cartographer o Gmapping — in drawtonomy come livello di sfondo, poi disegna percorsi, corsie e ostacoli sopra.
keywords:
  - annotazione griglia di occupazione ROS
  - editor mappa nav2
  - visualizzatore mappa Cartographer
  - disegnare su mappa pgm
  - strumento annotazione mappa SLAM
  - annotazione griglia di occupazione
---

drawtonomy comprende il formato `map_server` di ROS usato da
[nav2](https://navigation.ros.org/), Cartographer, Gmapping e
strumenti SLAM simili.

![Una griglia di occupazione ROS importata in drawtonomy con frecce e scaffali disegnati sopra](/img/ros-occupancy-grid.png)

Lo screenshot mostra una vera griglia di occupazione di un
magazzino (celle occupate in nero, celle libere in bianco) con
percorsi e ostacoli disegnati direttamente sopra all'interno di
drawtonomy.

## Importazione

1. Apri il menu **File** → **Import**.
2. Seleziona **insieme** il file `.pgm` e il file `.yaml`
   corrispondente nella finestra di dialogo dei file.
3. drawtonomy legge i metadati YAML (risoluzione, soglie) e
   visualizza la griglia sulla tela.

Se selezioni solo il `.pgm` e nessun `.yaml`, drawtonomy usa
valori predefiniti (`resolution = 0.05 m/px`, soglie di
occupazione standard).

## Colorazione delle celle

| Cella | Colore |
|---|---|
| Occupata | Nero |
| Libera | Bianco |
| Sconosciuta | Grigio |

Le celle vengono visualizzate a una scala che corrisponde alle
dimensioni delle corsie di drawtonomy, in modo da poter disegnare
corsie, percorsi e forme direttamente sopra — esattamente come
nello screenshot qui sopra.

## Strumenti testati

drawtonomy è stato usato con mappe da nav2, Cartographer e
Gmapping. Altri produttori dovrebbero funzionare purché emettano
la coppia standard `map_server` `.pgm` + `.yaml`.

## Vedi anche

- [Importare un file Lanelet2 (.osm)](/it/guides/import-lanelet2/)
