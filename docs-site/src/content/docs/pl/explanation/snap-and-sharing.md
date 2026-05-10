---
title: Przyciąganie i współdzielenie punktów
description: Dwa pokrewne, ale różne mechanizmy do utrzymywania kształtów w linii.
---

Przyciąganie i współdzielenie punktów oba zajmują się „ten punkt
idzie na tej rzeczy". Wyglądają podobnie w UI, ale mają różne
konsekwencje. Mylenie ich to najczęstsze źródło błędów typu
„dlaczego moje kształty się rozjechały?".

## Przyciąganie = te same współrzędne

Przyciąganie przesuwa twój kursor (lub wierzchołek, który
przeciągasz), aby trafił na istniejący cel. Wynik to dwa odrębne
punkty, które *przypadkowo* dzielą współrzędne.

Przesuń oryginalny cel później, a twój przyciągnięty punkt nie
podąża. Nigdy nie były połączone.

Tego chcesz, gdy szkicujesz: precyzyjne wyrównanie, brak ukrytego
sprzężenia.

## Współdzielenie = ta sama tożsamość

Punkt współdzielony to jeden obiekt odwołujący się przez kilka
kształtów. Przesuń go raz, każdy kształt, który trzyma odwołanie,
przesuwa się z nim.

Punkty współdzielone tworzysz, przytrzymując <kbd>Alt</kbd> podczas
klikania lub przeciągając wierzchołek na istniejący w trybie edycji
segmentów.

Tego chcesz dla granic, które nigdy nie powinny się rozdzielić — dwie
sąsiadujące krawędzie pasów, dwa narożniki wielokąta, które muszą
pozostać zespolone, koniec jednej trasy i początek drugiej.

## Dlaczego rozróżniać

Jeśli dwie krawędzie kształtów, które powinny być takie same, są w
rzeczywistości dwoma punktami przyciągniętymi, przeciągnij jeden z
nich, wyeksportuj do OpenDRIVE, a sieć drogowa otworzy się w tym
wierzchołku. Symulator może zinterpretować lukę jako nieciągłość lub
ją rozmazać, w zależności od narzędzia.

Sąsiedzi Lewy/Prawy pasów, którzy dzielą granicę, zawsze używają
punktów współdzielonych wewnętrznie — to nie jest opcjonalne i nie
jest kontrolowane przez użytkownika. Dla dowolnych kształtów
(Łamana, Wielokąt, Trasa) wybór należy do ciebie.

## Wskaźniki wizualne

- Cel przyciągania pokazuje pojedynczy podświetlony uchwyt i
  przyciąga kursor.
- Punkt współdzielony renderuje się jako podwojony uchwyt w trybie
  edycji segmentów.

## Zobacz także

- [Przyciągaj do istniejącej geometrii](/pl/guides/snap/)
- [Współdziel punkty między kształtami](/pl/guides/point-sharing/)
