---
title: Formato drawtonomy.svg
description: La struttura su disco di un file drawtonomy modificabile.
---

Un file `drawtonomy.svg` è un normale SVG arricchito di metadati
che registrano lo stato esclusivo dell'editor.

## Struttura

- Il contenuto visivo (path, testo, immagini) è SVG semplice.
  Qualsiasi visualizzatore SVG lo rende correttamente.
- Un blocco `<metadata>` in cima al documento contiene i dati
  specifici di drawtonomy:
  - ID delle forme e proprietà per ogni forma (template, stile,
    ecc.)
  - slot di connessione delle corsie (`next`, `previous`, `left`,
    `right`)
  - riferimenti ai punti condivisi
  - appartenenza ai gruppi footprint
  - z-order

## Compatibilità

Modificare un `drawtonomy.svg` in un editor SVG generico
(Illustrator, Inkscape, il browser) elimina il blocco di
metadati al salvataggio a meno che tu non lo preservi
esplicitamente. drawtonomy può comunque aprire il risultato, ma
le connessioni e i punti condivisi mancheranno.

Per modifiche con round-trip al di fuori di drawtonomy, usa
l'SDK ([`@drawtonomy/sdk`](/it/reference/sdk/)) — può leggere e
scrivere il formato senza passare per l'editor.

## Versioning

I file più vecchi vengono migrati automaticamente
all'importazione. L'helper `resolveColorKey()` nell'SDK converte
le chiavi di colore legacy (per esempio, v1.x `grey-700`) a
quelle correnti.

## Vedi anche

- [Esporta la tua scena](/it/guides/export/)
- [Panoramica `@drawtonomy/sdk`](/it/reference/sdk/)
