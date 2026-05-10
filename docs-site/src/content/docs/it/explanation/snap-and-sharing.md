---
title: Snap e condivisione punti
description: Due meccanismi correlati ma diversi per mantenere allineate le forme.
---

Snap e condivisione punti riguardano entrambi "questo punto va su
quella cosa". Sembrano simili nell'interfaccia, ma hanno
conseguenze diverse. Confonderli è la fonte più comune di bug
del tipo "perché le mie forme si sono spostate?".

## Snap = stesse coordinate

Lo snap sposta il cursore (o un vertice che stai trascinando) per
farlo atterrare su un target esistente. Il risultato sono due
punti distinti che *casualmente* condividono le coordinate.

Sposta il target originale in seguito e il tuo punto agganciato
non lo segue. Non sono mai stati collegati.

Questo è ciò che vuoi quando stai abbozzando: allineamento
preciso, nessun accoppiamento nascosto.

## Sharing = stessa identità

Un punto condiviso è un singolo oggetto referenziato da più
forme. Spostalo una volta, ogni forma che ne possiede il
riferimento si muove con esso.

Crei punti condivisi tenendo premuto <kbd>Alt</kbd> mentre
clicchi, oppure trascinando un vertice su uno esistente in
modalità di modifica dei segmenti.

Questo è ciò che vuoi per i bordi che non dovrebbero mai
separarsi — due bordi di corsia adiacenti, due angoli di
poligono che devono restare saldati, la fine di un percorso e
l'inizio di un altro.

## Perché distinguerli

Se due bordi di forma che dovrebbero essere lo stesso sono in
realtà due punti agganciati, trascina uno di essi, esporta in
OpenDRIVE, e la rete stradale si apre in quel vertice. Il
simulatore può interpretare lo spazio come una discontinuità,
oppure smussarlo a seconda dello strumento.

I vicini Sinistra/Destra di una corsia che condividono un bordo
usano sempre internamente punti condivisi — non è opzionale e
non è controllato dall'utente. Per le forme arbitrarie
(Linestring, Polygon, Path), la scelta è tua.

## Indicatori visivi

- Un target di snap mostra una singola maniglia evidenziata e
  attira il cursore.
- Un punto condiviso viene visualizzato come una maniglia doppia
  in modalità di modifica dei segmenti.

## Vedi anche

- [Snap alla geometria esistente](/it/guides/snap/)
- [Condividere punti tra forme](/it/guides/point-sharing/)
