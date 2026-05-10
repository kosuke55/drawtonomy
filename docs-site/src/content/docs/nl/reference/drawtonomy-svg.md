---
title: drawtonomy.svg-formaat
description: De op-schijf-structuur van een herbewerkbaar drawtonomy-bestand.
---

Een `drawtonomy.svg`-bestand is een gewone SVG, aangevuld met
metadata die de editor-only state vastlegt.

## Structuur

- De visuele inhoud (paths, tekst, afbeeldingen) is gewone SVG.
  Elke SVG-viewer geeft hem correct weer.
- Een `<metadata>`-blok bovenaan het document bevat de
  drawtonomy-specifieke gegevens:
  - vorm-ID's en per-vorm-eigenschappen (sjabloon, stijl, enz.)
  - rijstrookverbindingsvelden (`next`, `previous`, `left`,
    `right`)
  - referenties naar gedeelde punten
  - lidmaatschap van footprintgroepen
  - z-volgorde

## Compatibiliteit

Het bewerken van een `drawtonomy.svg` in een generieke SVG-editor
(Illustrator, Inkscape, de browser) verwijdert het metadatablok
bij het opslaan, tenzij u het expliciet behoudt. drawtonomy kan
het resultaat nog steeds openen, maar verbindingen en gedeelde
punten ontbreken dan.

Voor round-trippable bewerkingen buiten drawtonomy gebruikt u de
SDK ([`@drawtonomy/sdk`](/nl/reference/sdk/)) — deze kan het formaat
lezen en schrijven zonder via de editor te gaan.

## Versionering

Oudere bestanden worden automatisch gemigreerd bij de import. De
`resolveColorKey()`-helper in de SDK converteert oude kleurkeys
(bijvoorbeeld v1.x `grey-700`) naar de huidige.

## Zie ook

- [Uw scène exporteren](/nl/guides/export/)
- [`@drawtonomy/sdk`-overzicht](/nl/reference/sdk/)
