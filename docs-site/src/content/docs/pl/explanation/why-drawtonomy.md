---
title: Dlaczego drawtonomy — tablica zbudowana dla scenariuszy jazdy
description: Dlaczego drawtonomy istnieje i wybory projektowe za nim stojące. Zbudowana specjalnie dla scenariuszy jazdy — rysunków, które trafiają do publikacji o jeździe autonomicznej, prezentacji, przeglądów projektów i tworzenia scenariuszy.
keywords:
  - dlaczego drawtonomy
  - tablica jazda autonomiczna
  - narzędzie diagramu jazdy autonomicznej
  - narzędzie rysunków do publikacji AV
  - oprogramowanie ilustracji jazdy autonomicznej
  - alternatywa narzędzi prezentacji do diagramów drogowych
  - tablica dla zespołów jazdy autonomicznej
---

drawtonomy to tablica zbudowana specjalnie dla scenariuszy jazdy.
Większość zespołów dziś szkicuje te diagramy w ogólnych narzędziach
do rysowania lub w prezentacjach — to działa dobrze dla ogólnych
kształtów, ale nie wiedzą, czym jest pas, więc geometria musi być
rysowana na nowo, gdy droga zakręca, skrzyżowanie zyskuje ramię lub
przejście dla pieszych musi się zrównać z drogą.

Ta strona wyjaśnia wybory projektowe wynikające z prowadzenia z
„tablicą do scenariuszy jazdy" zamiast „narzędziem, które
eksportuje do symulatora".

## Problem, wokół którego jest zbudowany

Większość rzeczywistej komunikacji o jeździe autonomicznej odbywa się
poprzez diagramy: w publikacjach, przeglądach projektów, spotkaniach
planistycznych, raportach incydentów, klasach szkolnych i
prezentacjach. Diagram to artefakt, na który ludzie patrzą, o którym
dyskutują i który zapamiętują.

Ogólne narzędzia do rysowania na tym poziomie dają tylko ogólne
kształty. Pas to prostokąt, który rysujesz na nowo za każdym razem,
gdy droga zakręca; przejście dla pieszych to stos prostokątów, które
ciągle wyrównujesz ręcznie; skrzyżowanie to pół godziny dłubania.
Co gorsza, w momencie, gdy geometria drogi się zmienia — a w pracy AV
zmienia się stale — zaczynasz od nowa.

drawtonomy istnieje, aby ta pętla była szybka. Klocki budowlane,
które rzeczywiście ma domena — pasy, skrzyżowania, przejścia dla
pieszych, sygnalizacja świetlna, oznakowanie poziome, pojazdy, piesi
— są kształtami pierwszej klasy, więc rysunek pozostaje poprawny w
trakcie iteracji.

## Gdzie drawtonomy się mieści

Praca nad scenariuszami jazdy odbywa się na kilku różnych poziomach:

1. **Diagramy.** Publikacje, prezentacje, szkice na tablicy, rysunki
   w dokumentach projektowych, materiały dydaktyczne. Szybkie i
   łatwe w zasadzie, ale w ogólnym narzędziu geometria drogi musi
   być odbudowywana za każdym razem, gdy coś się przesuwa.
2. **Narzędzia tworzenia.** Edytory OpenSCENARIO, edytory sieci
   drogowych, pakiety w stylu CAD. Precyzyjne, wolne, drogie do
   nauki.
3. **Symulatory.** esmini, CARLA, narzędzia wewnętrzne. Uruchamiają
   scenariusz, produkują dane.

drawtonomy żyje na poziomie 1 i przekracza poziom 2, gdy
potrzebujesz: zaimportować mapę Lanelet2, naszkicować zmiany,
wyeksportować OpenDRIVE/OpenSCENARIO, przekazać wynik do esmini.

## Priorytety projektowe

### Tablica na pierwszym miejscu

Punkt porównania to szybki szkic na tablicy lub w prezentacji, a nie
narzędzie CAD. To ustanawia poziom tarcia: otwórz adres URL, narysuj,
udostępnij. Bez instalacji, bez konta, bez formatu pliku projektu.
Wszystko, co sprawiałoby, że drawtonomy wydaje się cięższe niż szybki
szkic, zostaje wycięte.

### Świadome topologii

Droga to nie worek łamanych. drawtonomy modeluje połączenia pasów
(Następny / Poprzedni / Lewy / Prawy), więc przesunięcie granicy
automatycznie aktualizuje sąsiadujące pasy. Dwa pasy, które dzielą
granicę, dzielą te same punkty graniczne — przeciągnij raz, oba
przesuwają się. Zobacz [Model połączeń pasów](/pl/explanation/lane-model/).

### Szablony z domeny jazdy

Pojazdy (sedan, autobus, ciężarówka, motocykl…), piesi (idący,
prosty), sygnalizacja świetlna dla pojazdów i pieszych, przejścia
dla pieszych, oznakowanie poziome, znaki, szablony skrzyżowań. Są
wbudowanymi kształtami, a nie ogólnymi-prostokątowymi przybliżeniami.
Niestandardowe szablony SVG można dodać przez PR.

### Edytowalne na wyjściu, jak i na wejściu

Każdy format wyjściowy, który drawtonomy produkuje, zachowuje
wystarczająco stanu, aby był ponownie edytowalny. `drawtonomy.svg`
to bezstratna forma kanoniczna: zwykły SVG, który wyświetla się
wszędzie (przeglądarki, GitHub, prezentacje, rysunki publikacji) i
otwiera się ponownie w drawtonomy z każdym połączeniem i relacją
nakładania nienaruszonymi. Nic nie jest uwięzione w formacie, którego
nie można odczytać z powrotem.

### Headless w razie potrzeby

Kod eksportera i parsera jest częścią `@drawtonomy/sdk` i działa
bez edytora. Potoki CI, rozszerzenia przeglądarki i narzędzia AI mogą
generować i walidować sceny programistycznie.

## Mosty do reszty przepływu pracy

Gdy masz diagram, zwykle chcesz coś z nim zrobić. drawtonomy
oferuje kilka mostów, więc rysunek nie pozostaje zamknięty wewnątrz
edytora:

- **`drawtonomy.svg`** — domyślny. Osadzaj w publikacjach,
  prezentacjach, dokumentach Markdown; otwórz ponownie później, aby
  kontynuować edycję.
- **Round-trip Lanelet2** — otwórz mapę Lanelet2 OSM (w tym
  przykładowe mapy Autoware), edytuj, eksportuj z powrotem.
  Przydatne do szkicowania zmian względem istniejącej mapy HD.
- **Eksport ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, opcjonalnie
  spakowane jako paczka zip gotowa dla
  [esmini](https://github.com/esmini/esmini).
- **Generator Sceny AI** — opisz scenariusz w języku naturalnym lub
  wklej XML OpenSCENARIO i otrzymaj edytowalne płótno do dopracowania.

Te mosty są przydatne, ale sam diagram jest powodem istnienia
drawtonomy. Rysunek w drawtonomy jest już wartościowy jako rysunek;
te formaty pozwalają mu przepłynąć do następnego etapu przepływu
pracy w razie potrzeby.

## Czym drawtonomy nie jest

- **Nie symulatorem.** Nie uruchamia scenariuszy. Eksportuj do
  esmini, CARLA lub własnego narzędzia w tym celu.
- **Nie narzędziem CAD.** Nie wymusza dokładności inżynierskiej
  (klotoidalne splajny, przechylenia, wzniesienia). Geometria jest
  prostym 2D.
- **Nie pakietem do współpracy w czasie rzeczywistym.** To edytor
  jednoużytkownikowy. Zapisz, udostępnij, otwórz ponownie.

## Zobacz także

- [Model połączeń pasów](/pl/explanation/lane-model/)
- [Architektura eksportera](/pl/explanation/exporter-architecture/)
- [Architektura rozszerzeń](/pl/explanation/extension-architecture/)
