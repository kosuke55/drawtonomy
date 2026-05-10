---
title: Model połączeń pasów
description: Jak drawtonomy reprezentuje topologię drogi i co to daje.
---

Pas drawtonomy ma więcej niż dwie granice i oś; niesie również cztery
sloty połączeń — **Następny**, **Poprzedni**, **Lewy** i **Prawy** —
które łączą go w sieć drogową.

## Cztery sloty

| Slot | Znaczenie |
|---|---|
| **Następny** | Pas, do którego przepływa ruch z tego pasa. |
| **Poprzedni** | Pas, który przepływa do tego pasa. |
| **Lewy** | Pas bezpośrednio po lewej, dzielący granicę. |
| **Prawy** | Pas bezpośrednio po prawej, dzielący granicę. |

Połączenia są dwukierunkowe: ustawienie Następnego Pasa A na B
ustawia również Poprzedni B na A. Edytor utrzymuje ten niezmiennik
za ciebie.

## Co umożliwiają połączenia

### Skoordynowana edycja

Gdy dwa pasy dzielą granicę — ponieważ są sąsiadami Lewym/Prawym lub
ponieważ pasy Następny/Poprzedni stykają się od końca do końca — ta
granica jest pojedynczym obiektem. Przeciągnij na niej punkt, a oba
pasy się aktualizują.

Topologia już mówi, co jest sklejone z czym, więc geometria nie musi
być naprawiana ręcznie za każdym razem, gdy poprawiasz pas.

### Spójny eksport

Zarówno [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/),
jak i
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
kodują łączność pasów. Eksportery drawtonomy używają slotów połączeń
bezpośrednio, bez wnioskowania ani heurystyk, które zawiodłyby na
przypadkach brzegowych. Scena, która wygląda dobrze w edytorze,
eksportuje się jako prawdziwa sieć drogowa, a nie worek łamanych.

### Round-trip z importami

Importer Lanelet2 odczytuje ten sam model połączeń z plików `.osm`.
Możesz edytować mapę Lanelet2 w drawtonomy i wyeksportować ją z
powrotem bez utraty topologii.

## Kiedy połączenia są wnioskowane

drawtonomy ustawia połączenia automatycznie, gdy zamiar jest jasny:

- Rysowanie pasa, który zaczyna się na końcu istniejącego pasa,
  ustawia **Poprzedni**.
- Skrót pasa równoległego (<kbd>Alt</kbd>+kliknięcie z narzędziem
  Pas) ustawia **Lewy** lub **Prawy**.
- Umieszczanie [szablonu skrzyżowania](/pl/guides/participants/)
  podłącza każdy pas dojazdowy.
- [Generator Pasów](/pl/guides/lane-from-map/) wnioskuje połączenia
  z topologii OSM, gdy są jednoznaczne.

Dla wszystkiego innego ustaw je ręcznie w Panelu Atrybutów — zobacz
[Zarządzaj połączeniami pasów](/pl/guides/lane-connections/).

## Czego połączenia nie kodują

- **Kierunek ruchu** jest dorozumiany przez Następny/Poprzedni, ale
  nie kodowany osobno. Drogi dwukierunkowe są modelowane jako dwa
  przeciwstawne pasy z własnymi łańcuchami Następny/Poprzedni.
- **Ograniczenia skrętu** na skrzyżowaniach nie są modelowane w samym
  drawtonomy. Pojawiają się w eksporcie OpenDRIVE/OpenSCENARIO
  poprzez szablon skrzyżowania, który je wyprodukował.
- **Limity prędkości, typ nawierzchni, oświetlenie** — żadne z nich.
  drawtonomy to geometria plus topologia; atrybuty semantyczne są
  poza zakresem.

## Zobacz także

- [Zarządzaj połączeniami pasów](/pl/guides/lane-connections/) —
  kroki w edytorze.
- [Format drawtonomy.svg](/pl/reference/drawtonomy-svg/) — jak
  połączenia są utrwalane przy zapisie.
