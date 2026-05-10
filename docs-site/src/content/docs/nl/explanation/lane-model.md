---
title: Rijstrookverbindingsmodel
description: Hoe drawtonomy wegtopologie weergeeft, en wat dat u oplevert.
---

Een drawtonomy-Lane heeft meer dan twee grenzen en een hartlijn;
hij bevat ook vier verbindingsvelden — **Next**, **Previous**,
**Left** en **Right** — die hem in een wegennet koppelen.

## De vier velden

| Veld | Betekenis |
|---|---|
| **Next** | De rijstrook waarin verkeer op deze rijstrook stroomt. |
| **Previous** | De rijstrook die in deze rijstrook stroomt. |
| **Left** | De rijstrook direct links, die een grens deelt. |
| **Right** | De rijstrook direct rechts, die een grens deelt. |

Verbindingen zijn bidirectioneel: Next van Lane A op B zetten
zet ook Previous van B op A. De editor onderhoudt deze
invariant voor u.

## Wat verbindingen mogelijk maken

### Gecoördineerd bewerken

Wanneer twee rijstroken een grens delen — omdat ze
Links/Rechts-buren zijn, of omdat Volgende/Vorige rijstroken
end-to-end op elkaar aansluiten — is die grens één enkel object.
Sleep een punt erop en beide rijstroken werken bij.

De topologie zegt al wat aan wat is gelijmd, dus geometrie hoeft
niet handmatig hersteld te worden telkens als u een rijstrook
aanpast.

### Coherente export

Zowel [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
als
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
coderen rijstrookconnectiviteit. De exporters van drawtonomy
gebruiken de verbindingsvelden direct, zonder inferentie of
heuristiek die in randgevallen zou omvallen. Een scène die in de
editor goed lijkt, exporteert als een echt wegennet in plaats
van een zak met polylijnen.

### Round-trip met imports

De Lanelet2-importer leest hetzelfde verbindingsmodel uit
`.osm`-bestanden. U kunt een Lanelet2-kaart in drawtonomy
bewerken en weer exporteren zonder topologie te verliezen.

## Wanneer verbindingen worden afgeleid

drawtonomy stelt verbindingen automatisch in wanneer de bedoeling
duidelijk is:

- Een rijstrook tekenen die op het eindpunt van een bestaande
  rijstrook begint, stelt **Previous** in.
- De parallel-rijstrook-shortcut (<kbd>Alt</kbd>+klik met de
  Lane-tool) stelt **Left** of **Right** in.
- Een [kruispuntsjabloon](/nl/guides/participants/) plaatsen
  bedraadt elke toegangsrijstrook.
- De [Lane Generator](/nl/guides/lane-from-map/) leidt verbindingen
  af uit OSM-topologie waar deze ondubbelzinnig is.

Voor al het andere stelt u ze handmatig in via het
Attribuutpaneel — zie
[Rijstrookverbindingen beheren](/nl/guides/lane-connections/).

## Wat verbindingen niet coderen

- **Rijrichting** wordt geïmpliceerd door Next/Previous, maar
  niet apart gecodeerd. Bidirectionele wegen worden gemodelleerd
  als twee tegengestelde rijstroken met hun eigen
  Next/Previous-ketens.
- **Afslagrestricties** op kruispunten worden niet in drawtonomy
  zelf gemodelleerd. Ze verschijnen in de
  OpenDRIVE/OpenSCENARIO-export via het kruispuntsjabloon dat ze
  heeft geproduceerd.
- **Snelheidslimieten, wegdektype, verlichting** — niets van dit
  alles. drawtonomy is geometrie plus topologie; semantische
  attributen vallen buiten de scope.

## Zie ook

- [Rijstrookverbindingen beheren](/nl/guides/lane-connections/) — de
  editor-stappen.
- [drawtonomy.svg-formaat](/nl/reference/drawtonomy-svg/) — hoe
  verbindingen bij het opslaan worden bewaard.
