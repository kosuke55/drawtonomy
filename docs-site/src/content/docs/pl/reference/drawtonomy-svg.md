---
title: Format drawtonomy.svg
description: Struktura na dysku edytowalnego ponownie pliku drawtonomy.
---

Plik `drawtonomy.svg` to zwykły SVG wzbogacony o metadane, które
zapisują stan tylko-edytora.

## Struktura

- Treść wizualna (ścieżki, tekst, obrazy) to zwykły SVG. Każda
  przeglądarka SVG renderuje go poprawnie.
- Blok `<metadata>` u góry dokumentu zawiera dane specyficzne dla
  drawtonomy:
  - ID kształtów i właściwości per-kształt (szablon, styl itp.)
  - sloty połączeń pasów (`next`, `previous`, `left`, `right`)
  - odwołania do punktów współdzielonych
  - członkostwo w grupach śladów
  - kolejność z

## Kompatybilność

Edycja `drawtonomy.svg` w ogólnym edytorze SVG (Illustrator, Inkscape,
przeglądarka) usuwa blok metadanych przy zapisie, chyba że
zachowasz go jawnie. drawtonomy nadal może otworzyć wynik, ale
połączenia i punkty współdzielone będą brakować.

Dla edycji z możliwością round-trip poza drawtonomy użyj SDK
([`@drawtonomy/sdk`](/pl/reference/sdk/)) — może odczytywać i
zapisywać format bez przechodzenia przez edytor.

## Wersjonowanie

Starsze pliki są automatycznie migrowane przy imporcie. Pomocnik
`resolveColorKey()` w SDK konwertuje starsze klucze kolorów (na
przykład v1.x `grey-700`) na bieżące.

## Zobacz także

- [Eksport sceny](/pl/guides/export/)
- [Przegląd `@drawtonomy/sdk`](/pl/reference/sdk/)
