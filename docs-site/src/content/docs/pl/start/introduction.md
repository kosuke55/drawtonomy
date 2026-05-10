---
title: Wprowadzenie — tablica do scenariuszy jazdy
description: drawtonomy to darmowa, działająca w przeglądarce tablica do scenariuszy jazdy. Szkicuj pasy, skrzyżowania, pojazdy i pieszych do publikacji, prezentacji, dyskusji projektowych i tworzenia scenariuszy. Eksport do OpenDRIVE, OpenSCENARIO i Lanelet2.
sidebar:
  label: Wprowadzenie
  order: 1
keywords:
  - tablica jazda autonomiczna
  - diagram scenariusza jazdy
  - narzędzie diagramu jazdy autonomicznej
  - rysunek jazdy autonomicznej do publikacji
  - rysunek jazdy autonomicznej do prezentacji
  - rysuj scenariusz jazdy autonomicznej online
  - narzędzie szkicowania scenariusza ruchu
  - edytor diagramów pasów ruchu w przeglądarce
  - diagram scenariusza do przeglądu projektu
  - tablica dla zespołów jazdy autonomicznej
  - drawtonomy co to jest
---

drawtonomy to tablica do scenariuszy jazdy. Rodzaj rysunku, który
umieszczasz w publikacji, slajd, który szkicujesz przed przeglądem
projektu, diagram, który rysujesz podczas rozmowy, gdy wyjaśniasz
przypadek brzegowy reszcie zespołu, lub scena, którą szkicujesz
przed napisaniem pliku OpenSCENARIO.

Pasy, skrzyżowania, pojazdy, piesi, sygnalizacja świetlna, oznakowanie
poziome i przejścia dla pieszych są wbudowanymi kształtami. Pasy są
świadome topologii — niosą połączenia Następny / Poprzedni / Lewy /
Prawy — więc diagram jest siecią, którą można edytować, a nie obrazem,
który rysujesz na nowo, gdy zmienia się geometria drogi.

Aplikacja jest pod adresem [drawtonomy.com](https://drawtonomy.com).
SDK, rozszerzenia i źródła tej strony dokumentacji są na
[GitHub](https://github.com/kosuke55/drawtonomy).

## Do czego ludzie tego używają

- **Rysunki do publikacji, prac dyplomowych i raportów technicznych.**
  Wektorowy format wyjściowy (`drawtonomy.svg`, PDF, EPS), który
  elegancko osadza się w LaTeX, Markdown i prezentacjach.
- **Slajdy i prezentacje.** Diagramy manewrów zmiany pasa, skrzyżowań,
  przypadków przesłonięcia i innych scenariuszy jazdy — narysowane
  w sekundy, a nie minuty na kształt.
- **Dyskusje projektowe i algorytmiczne.** Wspólna powierzchnia
  szkicowa do omawiania zachowania jazdy, przypadków brzegowych i
  argumentów bezpieczeństwa z członkami zespołu.
- **Tworzenie scenariuszy.** Naszkicuj scenę przed napisaniem XML
  OpenSCENARIO lub zaimportuj istniejący `.xosc` i edytuj go
  wizualnie.
- **Adnotacja map i ROS.** Obrysuj pasy na tle satelitarnym, edytuj
  mapy Lanelet2 OSM lub adnotuj siatkę zajętości ROS z trasami i
  przeszkodami.

## Dla kogo jest to przeznaczone

- **Inżynierowie jazdy autonomicznej i ADAS** rysujący diagramy do
  wewnętrznej dokumentacji, przeglądów projektów i raportów
  incydentów.
- **Badacze i studenci AV** tworzący rysunki do publikacji, prac
  dyplomowych i prelekcji konferencyjnych.
- **Twórcy scenariuszy** pracujący z symulatorami takimi jak
  [esmini](https://github.com/esmini/esmini), CARLA lub narzędziami
  wewnętrznymi.
- **Użytkownicy map HD i Lanelet2** szkicujący zmiany względem
  istniejącej sieci drogowej.
- **Zespoły ROS i robotyki** rysujące na siatkach zajętości
  zbudowanych za pomocą nav2, Cartographer lub Gmapping.
- **Instruktorzy jazdy i edukatorzy** tworzący diagramy do materiałów
  dydaktycznych.
- **Twórcy narzędzi** rozszerzający edytor o nowe eksportery,
  importery lub funkcje wspomagane przez AI poprzez
  [SDK rozszerzeń](/pl/extend/).

## Jak zorganizowana jest ta dokumentacja

Strona stosuje podział [Diátaxis](https://diataxis.fr/). Wybierz
sekcję, która pasuje do tego, co robisz.

| Sekcja | Kiedy ją czytać |
|---|---|
| [Tutoriale](/pl/tutorials/) | Jesteś nowy i chcesz uczyć się przez działanie. |
| [Przewodniki praktyczne](/pl/guides/) | Wiesz, co osiągnąć, i potrzebujesz kroków. |
| [Materiały referencyjne](/pl/reference/) | Musisz sprawdzić dokładny fakt — skrót, format, API. |
| [Wyjaśnienia](/pl/explanation/) | Chcesz zrozumieć, dlaczego drawtonomy działa tak, jak działa. |
| [Rozszerzanie drawtonomy](/pl/extend/) | Budujesz na bazie drawtonomy. |

Jeśli nie wiesz, od czego zacząć,
[Szybki start](/pl/start/quickstart/) to pięć minut od pustego
płótna do wyeksportowanej sceny.
