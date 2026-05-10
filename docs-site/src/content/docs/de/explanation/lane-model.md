---
title: Spurverbindungsmodell
description: Wie drawtonomy die Straßentopologie repräsentiert und welche Vorteile sich daraus ergeben.
keywords:
  - drawtonomy Spurverbindung
  - Straßentopologie
  - Lanelet2 Verbindung
  - OpenDRIVE Konnektivität
  - Whiteboard für autonomes Fahren
  - Spureditor Topologie
---

Eine drawtonomy-Lane hat mehr als zwei Ränder und eine Mittellinie;
sie trägt außerdem vier Verbindungs-Slots — **Next**, **Previous**,
**Left** und **Right** —, die sie in ein Straßennetz einbinden.

## Die vier Slots

| Slot | Bedeutung |
|---|---|
| **Next** | Die Fahrspur, in die der Verkehr dieser Fahrspur fließt. |
| **Previous** | Die Fahrspur, die in diese Fahrspur fließt. |
| **Left** | Die unmittelbar links benachbarte Fahrspur, die einen Rand teilt. |
| **Right** | Die unmittelbar rechts benachbarte Fahrspur, die einen Rand teilt. |

Verbindungen sind bidirektional: Setzt man Next von Lane A auf B,
wird auch Previous von B auf A gesetzt. Der Editor hält diese
Invariante für Sie aufrecht.

## Was Verbindungen ermöglichen

### Koordiniertes Bearbeiten

Wenn zwei Fahrspuren einen Rand teilen — weil sie Left/Right-Nachbarn
sind oder weil Next/Previous-Fahrspuren Ende an Ende treffen — ist
dieser Rand ein einziges Objekt. Ziehen Sie an einem Punkt, und
beide Fahrspuren werden aktualisiert.

Die Topologie sagt bereits, was woran klebt, sodass Geometrie nach
jedem Anpassen einer Spur nicht mehr von Hand repariert werden muss.

### Kohärenter Export

Sowohl
[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) als
auch
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
kodieren die Spurkonnektivität. Die Exporter von drawtonomy nutzen
die Verbindungs-Slots direkt, ohne Inferenz oder Heuristiken, die
bei Sonderfällen scheitern würden. Eine Szene, die im Editor stimmig
aussieht, wird als echtes Straßennetz exportiert und nicht als
Sammlung von Polylinien.

### Hin- und Rückreise mit Importen

Der Lanelet2-Importer liest dasselbe Verbindungsmodell aus
`.osm`-Dateien. Sie können eine Lanelet2-Karte in drawtonomy
bearbeiten und ohne Verlust der Topologie wieder exportieren.

## Wann Verbindungen abgeleitet werden

drawtonomy setzt Verbindungen automatisch, wenn die Absicht klar
ist:

- Eine Fahrspur, die am Endpunkt einer vorhandenen Fahrspur
  beginnt, setzt **Previous**.
- Die Parallelspur-Abkürzung (<kbd>Alt</kbd>+Klick mit dem
  Lane-Werkzeug) setzt **Left** oder **Right**.
- Das Platzieren einer
  [Kreuzungsvorlage](/de/guides/participants/) verkabelt jede
  Anfahrtspur.
- Der [Lane Generator](/de/guides/lane-from-map/) leitet Verbindungen
  aus der OSM-Topologie ab, wo es eindeutig ist.

Für alles andere setzen Sie sie manuell im Attribute Panel — siehe
[Spurverbindungen verwalten](/de/guides/lane-connections/).

## Was Verbindungen nicht kodieren

- **Fahrtrichtung** ist durch Next/Previous impliziert, wird aber
  nicht separat kodiert. Bidirektionale Straßen werden als zwei
  gegensätzliche Fahrspuren mit eigenen Next/Previous-Ketten
  modelliert.
- **Abbiegevorschriften** an Kreuzungen werden in drawtonomy selbst
  nicht modelliert. Sie erscheinen im OpenDRIVE/OpenSCENARIO-Export
  über die Kreuzungsvorlage, die sie hervorgebracht hat.
- **Geschwindigkeitsbegrenzungen, Belagsart, Beleuchtung** — nichts
  davon. drawtonomy ist Geometrie plus Topologie; semantische
  Attribute liegen außerhalb des Umfangs.

## Siehe auch

- [Spurverbindungen verwalten](/de/guides/lane-connections/) — die
  Schritte im Editor.
- [drawtonomy.svg-Format](/de/reference/drawtonomy-svg/) — wie
  Verbindungen beim Speichern persistiert werden.
