---
title: Wnoszenie szablonów
description: Dodaj nowy szablon pojazdu, pieszego, znaku lub oznakowania poziomego.
---

Szablony to pliki SVG plus wpis w manifeście. Po wniesieniu pojawiają
się w menu Uczestnicy i menu kształtów edytora obok wbudowanych
szablonów.

Przepływ wnoszenia znajduje się w publicznym repo:

➡ **[Przewodnik Szablonów](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Kategorie

| Folder | Przykłady |
|---|---|
| `templates/vehicle/` | Sedan, Autobus, Ciężarówka, Motocykl |
| `templates/pedestrian/` | Idący, Prosty |
| `templates/road_marking/` | Przejście dla pieszych, oznakowania strzałek |
| `templates/sign/` | Stop, ustąp pierwszeństwa, głowice sygnalizatorów |
| `templates/other/` | Cokolwiek innego |

## Proces

1. Dodaj swój SVG pod właściwym folderem kategorii.
2. Zarejestruj go w `templates/manifest.json`.
3. Otwórz PR. Dołącz zrzut ekranu szablonu umieszczonego na płótnie.

## Co czyni dobry szablon

- Narysowany w sensownym domyślnym rozmiarze (pojazdy około 4–5 m
  dla sedana).
- Pojedynczy obszar ze zmienialnym kolorem oznaczony znanym
  wypełnieniem, dzięki czemu wybierak kolorów Panelu Atrybutów może
  go przekolorować.
- Brak zewnętrznych odwołań do czcionek — tekst jest konwertowany na
  ścieżki, jeśli jest obecny.
- Rozsądny rozmiar pliku (poniżej ~30 KB dla szablonu wielkości
  pojazdu).
