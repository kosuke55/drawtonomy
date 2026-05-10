---
title: Importuj ROS OccupancyGrid (.pgm + .yaml)
description: Załaduj siatkę zajętości ROS map_server (.pgm + .yaml) — zbudowaną z nav2, Cartographer lub Gmapping — do drawtonomy jako warstwę tła, a następnie szkicuj trasy, pasy i przeszkody na niej.
keywords:
  - adnotacja siatki zajętości ROS
  - edytor map nav2
  - przeglądarka map cartographer
  - rysuj na mapie pgm
  - narzędzie adnotacji map SLAM
---

drawtonomy rozumie format ROS `map_server` używany przez
[nav2](https://navigation.ros.org/), Cartographer, Gmapping i podobne
narzędzia SLAM.

![Siatka zajętości ROS zaimportowana do drawtonomy ze strzałkami i regałami narysowanymi na wierzchu](/img/ros-occupancy-grid.png)

Zrzut ekranu pokazuje rzeczywistą siatkę zajętości magazynu (komórki
zajęte czarne, komórki wolne białe) z trasami i przeszkodami
narysowanymi bezpośrednio na niej w drawtonomy.

## Importuj

1. Otwórz menu **Plik** → **Importuj**.
2. Wybierz **oba** pliki `.pgm` i pasujący `.yaml` razem w oknie
   dialogowym pliku.
3. drawtonomy odczytuje metadane YAML (rozdzielczość, progi) i
   renderuje siatkę na płótnie.

Jeśli wybierzesz tylko `.pgm` i żadnego `.yaml`, drawtonomy używa
wartości domyślnych (`resolution = 0.05 m/px`, standardowe progi
zajętości).

## Kolorowanie komórek

| Komórka | Kolor |
|---|---|
| Zajęta | Czarna |
| Wolna | Biała |
| Nieznana | Szara |

Komórki renderują się w skali odpowiadającej wymiarom pasa drawtonomy,
więc można rysować pasy, trasy i kształty bezpośrednio na nich —
dokładnie jak na zrzucie ekranu powyżej.

## Przetestowane narzędzia

drawtonomy był używany z mapami z nav2, Cartographer i Gmapping. Inne
producenty powinny działać, o ile emitują standardową parę
`map_server` `.pgm` + `.yaml`.

## Zobacz także

- [Importuj plik Lanelet2 (.osm)](/pl/guides/import-lanelet2/)
