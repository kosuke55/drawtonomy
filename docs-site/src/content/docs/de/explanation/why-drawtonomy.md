---
title: Warum drawtonomy — ein Whiteboard für Fahrszenarien
description: Warum drawtonomy existiert und welche Designentscheidungen dahinterstehen. Speziell für Fahrszenarien gebaut — die Abbildungen, die in Paper, Foliensätze, Design-Reviews und Szenario-Authoring rund um autonomes Fahren einfließen.
keywords:
  - warum drawtonomy
  - Whiteboard für autonomes Fahren
  - Diagramm-Tool autonomes Fahren
  - Paper-Abbildung AV-Forschung
  - Software Visualisierung autonomes Fahren
  - Alternative zu Folientools für Straßendiagramme
  - Whiteboard für AV-Teams
  - Designentscheidungen drawtonomy
---

drawtonomy ist ein Whiteboard, das speziell für Fahrszenarien
gebaut ist. Die meisten Teams skizzieren solche Diagramme heute in
generischen Zeichenwerkzeugen oder Foliensätzen — die funktionieren
gut für allgemeine Formen, aber sie wissen nicht, was eine Fahrspur
ist. Deshalb muss die Geometrie immer wieder neu gezeichnet werden,
sobald die Straße eine Kurve macht, die Kreuzung einen weiteren
Schenkel bekommt oder ein Zebrastreifen mit der Straße fluchten soll.

Diese Seite erklärt die Designentscheidungen, die sich daraus
ergeben, dass die Leitidee „Whiteboard für Fahrszenarien" lautet
und nicht „Tool, das in einen Simulator exportiert".

## Das Problem, um das es gebaut ist

Die meiste tatsächliche Kommunikation rund um autonomes Fahren
geschieht über Diagramme: in Paper, Design-Reviews, Planungsmeetings,
Incident-Berichten, Lehrräumen und Foliensätzen. Das Diagramm ist
das Artefakt, das man ansieht, über das man diskutiert und an das
man sich erinnert.

Generische Zeichenwerkzeuge bieten auf dieser Ebene nur generische
Formen. Eine Fahrspur ist ein Rechteck, das Sie bei jeder Kurve neu
zeichnen; ein Zebrastreifen ist ein Stapel Rechtecke, den Sie
ständig per Hand ausrichten; eine Kreuzung sind eine halbe Stunde
Frickelei. Schlimmer noch: Sobald sich die Straßengeometrie ändert
— und in der AV-Arbeit ändert sie sich ständig — fangen Sie von
vorn an.

drawtonomy existiert, um diese Schleife schnell zu machen. Die
Bausteine, die die Domäne tatsächlich kennt — Fahrspuren,
Kreuzungen, Zebrastreifen, Ampeln, Fahrbahnmarkierungen, Fahrzeuge,
Fußgänger — sind erstklassige Formen, sodass die Abbildung beim
Iterieren korrekt bleibt.

## Wo drawtonomy verortet ist

Arbeit an Fahrszenarien spielt sich auf mehreren Ebenen ab:

1. **Diagramme.** Paper, Folien, Whiteboard-Skizzen,
   Design-Doc-Abbildungen, Lehrmaterial. Im Prinzip schnell und
   einfach, aber in einem generischen Tool muss die
   Straßengeometrie bei jeder Bewegung neu aufgebaut werden.
2. **Authoring-Tools.** OpenSCENARIO-Editoren,
   Straßennetz-Editoren, CAD-ähnliche Pakete. Präzise, langsam,
   aufwendig zu erlernen.
3. **Simulatoren.** esmini, CARLA, Inhouse-Werkzeuge. Szenario
   ausführen, Daten erzeugen.

drawtonomy lebt auf Ebene 1 und greift in Ebene 2 hinüber, wenn es
darauf ankommt: eine Lanelet2-Karte importieren, Änderungen
skizzieren, OpenDRIVE/OpenSCENARIO exportieren, das Ergebnis an
esmini weitergeben.

## Designprioritäten

### Whiteboard zuerst

Der Vergleichsmaßstab ist eine schnelle Whiteboard- oder
Folienskizze, kein CAD-Werkzeug. Das setzt die Latte für die
Reibung: URL öffnen, zeichnen, teilen. Keine Installation, kein
Konto, kein Projektdateiformat. Alles, was drawtonomy schwerer
wirken ließe als eine schnelle Skizze, fliegt raus.

### Topologiebewusst

Eine Straße ist kein Sack voller Polylinien. drawtonomy modelliert
Spurverbindungen (Next / Previous / Left / Right), sodass das
Verschieben eines Rands die benachbarten Fahrspuren automatisch
mitführt. Zwei Fahrspuren, die einen Rand teilen, teilen dieselben
Randpunkte — einmal ziehen, beide bewegen sich. Siehe
[Spurverbindungsmodell](/de/explanation/lane-model/).

### Vorlagen aus der Fahrdomäne

Fahrzeuge (Sedan, Bus, Lkw, Motorrad …), Fußgänger (gehend,
einfach), Ampeln für Fahrzeuge und Fußgänger, Zebrastreifen,
Fahrbahnmarkierungen, Schilder, Kreuzungsvorlagen. Sie sind
integrierte Formen statt generischer Rechteck-Approximationen.
Eigene SVG-Vorlagen lassen sich per PR ergänzen.

### Nicht nur beim Hereinbringen, auch beim Hinausbringen bearbeitbar

Jedes Ausgabeformat, das drawtonomy erzeugt, bewahrt genug Zustand,
um wieder bearbeitbar zu sein. `drawtonomy.svg` ist die verlustfreie
kanonische Form: eine reguläre SVG-Datei, die überall vorschaubar
ist (Browser, GitHub, Foliensätze, Paper-Abbildungen) und sich in
drawtonomy mit allen Verbindungen und Überlappungsbeziehungen
wieder öffnen lässt. Nichts bleibt in einem Format gefangen, aus
dem Sie es nicht zurücklesen können.

### Headless, wenn nötig

Der Code für Exporter und Parser gehört zu `@drawtonomy/sdk` und
läuft ohne den Editor. CI-Pipelines, Browser-Erweiterungen und
KI-Tools können Szenen programmatisch erzeugen und validieren.

## Brücken zum Rest des Workflows

Wenn ein Diagramm steht, will man meist etwas damit tun. drawtonomy
bringt mehrere Brücken mit, damit die Abbildung nicht im Editor
gefangen bleibt:

- **`drawtonomy.svg`** — der Standard. Einbetten in Paper, Folien,
  Markdown-Dokumente; später erneut öffnen und weiter bearbeiten.
- **Lanelet2-Hin- und Rückexport** — eine Lanelet2-OSM-Karte
  öffnen (einschließlich Autoware-Beispielkarten), bearbeiten,
  zurück exportieren. Nützlich, um Änderungen an einer
  bestehenden HD-Karte zu skizzieren.
- **ASAM-Export** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, optional
  gebündelt als
  [esmini](https://github.com/esmini/esmini)-fertiges ZIP.
- **AI Scene Generator** — ein Szenario in natürlicher Sprache
  beschreiben oder OpenSCENARIO-XML einfügen und einen
  bearbeitbaren Canvas zur weiteren Verfeinerung erhalten.

Diese Brücken sind nützlich, aber das Diagramm selbst ist der Grund,
warum drawtonomy existiert. Eine Abbildung in drawtonomy ist
bereits als Abbildung wertvoll; diese Formate lassen sie bei Bedarf
in die nächste Phase des Workflows fließen.

## Was drawtonomy nicht ist

- **Kein Simulator.** Es führt keine Szenarien aus. Exportieren Sie
  dafür nach esmini, CARLA oder Ihr eigenes Werkzeug.
- **Kein CAD-Werkzeug.** Es erzwingt keine ingenieurmäßige
  Genauigkeit (Klothoiden-Splines, Querneigung, Höhenprofil). Die
  Geometrie ist unkompliziertes 2D.
- **Keine Echtzeit-Kollaborationssuite.** Es ist ein
  Einzelnutzer-Editor. Speichern, teilen, wieder öffnen.

## Siehe auch

- [Spurverbindungsmodell](/de/explanation/lane-model/)
- [Exporter-Architektur](/de/explanation/exporter-architecture/)
- [Erweiterungs-Architektur](/de/explanation/extension-architecture/)
