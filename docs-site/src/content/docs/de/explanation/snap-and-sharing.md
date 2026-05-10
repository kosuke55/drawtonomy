---
title: Snap und Punktteilung
description: Zwei verwandte, aber unterschiedliche Mechanismen, um Formen ausgerichtet zu halten.
keywords:
  - drawtonomy Snap
  - Punktteilung
  - geteilte Punkte Spureditor
  - Whiteboard für autonomes Fahren
  - Snap zu Geometrie
  - Spureditor im Browser
---

Snap und Punktteilung haben beide damit zu tun, dass „dieser Punkt
auf jenem Ding sitzen soll". Sie sehen in der UI ähnlich aus, haben
aber unterschiedliche Folgen. Sie zu verwechseln ist die häufigste
Ursache von „Warum sind meine Formen verrutscht?"-Fehlern.

## Snap = gleiche Koordinate

Snapping bewegt Ihren Cursor (oder einen gerade gezogenen
Stützpunkt), sodass er auf einem vorhandenen Ziel landet. Das
Ergebnis sind zwei eigenständige Punkte, die zufällig dieselben
Koordinaten besitzen.

Verschieben Sie das ursprüngliche Ziel später, folgt Ihr
gesnappter Punkt nicht. Sie waren nie verbunden.

Das ist es, was Sie beim Skizzieren wollen: präzise Ausrichtung,
keine versteckte Kopplung.

## Sharing = gleiche Identität

Ein geteilter Punkt ist ein Objekt, auf das mehrere Formen
verweisen. Bewegen Sie ihn einmal, bewegt sich jede Form mit, die
die Referenz hält.

Sie erzeugen geteilte Punkte, indem Sie <kbd>Alt</kbd> beim Klicken
halten oder einen Stützpunkt im Segmentbearbeitungs-Modus auf einen
vorhandenen ziehen.

Das ist es, was Sie für Ränder wollen, die nie auseinandergehen
sollen — zwei aneinandergrenzende Spurkanten, zwei Polygonecken, die
verschweißt bleiben müssen, das Ende eines Pfads und der Anfang
eines anderen.

## Warum unterscheiden

Wenn zwei Formkanten, die identisch sein sollten, in Wahrheit zwei
gesnappte Punkte sind, ziehen Sie einen davon, exportieren nach
OpenDRIVE — und das Straßennetz öffnet sich an diesem Stützpunkt.
Der Simulator interpretiert die Lücke je nach Tool als
Diskontinuität oder schmiert sie zu.

Left/Right-Nachbarspuren, die einen Rand teilen, verwenden intern
immer geteilte Punkte — das ist nicht optional und nicht vom
Anwender steuerbar. Bei beliebigen Formen (Linestring, Polygon,
Path) liegt die Wahl bei Ihnen.

## Visuelle Hinweise

- Ein Snap-Ziel zeigt einen einzelnen hervorgehobenen Anfasser und
  zieht den Cursor an.
- Ein geteilter Punkt erscheint im Segmentbearbeitungs-Modus als
  doppelter Anfasser.

## Siehe auch

- [An vorhandener Geometrie einrasten](/de/guides/snap/)
- [Punkte zwischen Formen teilen](/de/guides/point-sharing/)
