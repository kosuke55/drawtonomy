---
title: Einführung — Whiteboard für Fahrszenarien
description: drawtonomy ist ein kostenloses, browserbasiertes Whiteboard für Fahrszenarien. Skizzieren Sie Fahrspuren, Kreuzungen, Fahrzeuge und Fußgänger für Paper, Folien, Designdiskussionen und Szenario-Authoring. Export nach OpenDRIVE, OpenSCENARIO und Lanelet2.
sidebar:
  label: Einführung
  order: 1
keywords:
  - Whiteboard für autonomes Fahren
  - Fahrszenario-Diagramm
  - Diagramm-Tool autonomes Fahren
  - Paper-Abbildung autonomes Fahren
  - Präsentation autonomes Fahren
  - Fahrszenario online zeichnen
  - Verkehrsszenario Skizze
  - Spurdiagramm Browser-Editor
  - Szenariodiagramm Designreview
  - Whiteboard für AV-Teams
  - was ist drawtonomy
  - ADAS Diagramm
---

drawtonomy ist ein Whiteboard für Fahrszenarien. Die Art von
Abbildung, die Sie in ein Paper einfügen, die Folie, die Sie vor einem
Design-Review skizzieren, das Diagramm, das Sie während eines Calls
zeichnen, wenn Sie dem Team einen Sonderfall erklären, oder die Szene,
die Sie skizzieren, bevor Sie die OpenSCENARIO-Datei schreiben.

Fahrspuren, Kreuzungen, Fahrzeuge, Fußgänger, Ampeln,
Fahrbahnmarkierungen und Zebrastreifen sind integrierte Formen.
Fahrspuren sind topologiebewusst — sie tragen Verbindungen Next /
Previous / Left / Right —, sodass das Diagramm ein bearbeitbares Netz
ist und kein Bild, das Sie jedes Mal neu zeichnen, wenn sich die
Straßengeometrie ändert.

Die App ist auf [drawtonomy.com](https://drawtonomy.com) verfügbar.
Das SDK, die Erweiterungen und die Quelldateien dieser
Dokumentationssite liegen auf
[GitHub](https://github.com/kosuke55/drawtonomy).

## Wofür Anwender es nutzen

- **Abbildungen für Paper, Abschlussarbeiten und technische
  Berichte.** Vektorausgabe (`drawtonomy.svg`, PDF, EPS), die sich
  sauber in LaTeX, Markdown und Foliensätze einbetten lässt.
- **Folien und Präsentationen.** Diagramme von
  Spurwechselmanövern, Kreuzungen, Verdeckungsfällen und anderen
  Fahrszenarien — in Sekunden statt Minuten pro Form gezeichnet.
- **Design- und Algorithmusdiskussionen.** Eine geteilte
  Skizzenfläche, um mit Teamkollegen über Fahrverhalten,
  Sonderfälle und Sicherheitsargumente zu sprechen.
- **Szenario-Authoring.** Skizzieren Sie die Szene, bevor Sie
  OpenSCENARIO-XML schreiben, oder importieren Sie eine bestehende
  `.xosc`-Datei und bearbeiten Sie sie visuell.
- **Karten- und ROS-Annotation.** Zeichnen Sie Fahrspuren über
  einem Satellitenhintergrund nach, bearbeiten Sie
  Lanelet2-OSM-Karten oder annotieren Sie ein ROS-Belegungsgitter
  mit Pfaden und Hindernissen.

## Für wen das ist

- **AV- und ADAS-Ingenieure**, die Diagramme für interne Dokumente,
  Design-Reviews und Incident-Berichte zeichnen.
- **AV-Forschende und Studierende**, die Abbildungen für Paper,
  Abschlussarbeiten und Konferenzbeiträge erstellen.
- **Szenario-Autoren**, die mit Simulatoren wie
  [esmini](https://github.com/esmini/esmini), CARLA oder
  Inhouse-Werkzeugen arbeiten.
- **HD-Karten- und Lanelet2-Anwender**, die Änderungen an einem
  bestehenden Straßennetz skizzieren.
- **ROS- und Robotik-Teams**, die auf Belegungsgittern aus nav2,
  Cartographer oder Gmapping zeichnen.
- **Fahrlehrkräfte und Ausbildende**, die Diagramme für
  Lehrmaterial erstellen.
- **Tool-Entwickler**, die den Editor über das
  [Extension SDK](/de/extend/) um neue Exporter, Importer oder
  KI-gestützte Funktionen erweitern.

## Wie diese Dokumentation gegliedert ist

Die Site folgt der [Diátaxis](https://diataxis.fr/)-Aufteilung.
Wählen Sie den Abschnitt, der zu Ihrem aktuellen Vorhaben passt.

| Abschnitt | Wann lesen |
|---|---|
| [Tutorials](/de/tutorials/) | Sie sind neu und möchten durch Tun lernen. |
| [How-to-Anleitungen](/de/guides/) | Sie wissen, was Sie erreichen wollen, und brauchen die Schritte. |
| [Referenz](/de/reference/) | Sie müssen einen exakten Fakt nachschlagen — ein Tastenkürzel, ein Format, eine API. |
| [Erläuterung](/de/explanation/) | Sie möchten verstehen, warum drawtonomy so arbeitet, wie es arbeitet. |
| [drawtonomy erweitern](/de/extend/) | Sie bauen auf drawtonomy auf. |

Wenn Sie nicht wissen, wo Sie anfangen sollen, führt der
[Schnellstart](/de/start/quickstart/) Sie in fünf Minuten vom leeren
Canvas zur exportierten Szene.
