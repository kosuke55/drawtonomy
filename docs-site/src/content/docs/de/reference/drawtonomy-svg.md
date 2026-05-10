---
title: drawtonomy.svg-Format
description: Die Festplatten-Struktur einer erneut bearbeitbaren drawtonomy-Datei.
keywords:
  - drawtonomy.svg
  - SVG Metadaten
  - drawtonomy Format
  - SVG Editor Lane
  - Whiteboard für autonomes Fahren
  - drawtonomy Round-trip
---

Eine `drawtonomy.svg`-Datei ist eine reguläre SVG, ergänzt um
Metadaten, die den editor-spezifischen Zustand festhalten.

## Struktur

- Der visuelle Inhalt (Pfade, Text, Bilder) ist reines SVG. Jeder
  SVG-Viewer rendert die Datei korrekt.
- Ein `<metadata>`-Block am Anfang des Dokuments hält die
  drawtonomy-spezifischen Daten:
  - Form-IDs und Form-Eigenschaften (Vorlage, Stil usw.)
  - Spurverbindungs-Slots (`next`, `previous`, `left`, `right`)
  - Referenzen auf geteilte Punkte
  - Footprint-Gruppenzugehörigkeit
  - Z-Reihenfolge

## Kompatibilität

Das Bearbeiten einer `drawtonomy.svg` in einem generischen
SVG-Editor (Illustrator, Inkscape, Browser) verwirft den
Metadaten-Block beim Speichern, sofern Sie ihn nicht ausdrücklich
erhalten. drawtonomy kann das Ergebnis weiterhin öffnen, aber
Verbindungen und geteilte Punkte fehlen dann.

Für reisefähige Bearbeitungen außerhalb von drawtonomy nutzen Sie
das SDK ([`@drawtonomy/sdk`](/de/reference/sdk/)) — es kann das Format
lesen und schreiben, ohne den Editor zu durchlaufen.

## Versionierung

Ältere Dateien werden beim Import automatisch migriert. Der Helfer
`resolveColorKey()` im SDK wandelt Legacy-Farbschlüssel (zum
Beispiel v1.x `grey-700`) in die aktuellen um.

## Siehe auch

- [Szene exportieren](/de/guides/export/)
- [`@drawtonomy/sdk`-Übersicht](/de/reference/sdk/)
