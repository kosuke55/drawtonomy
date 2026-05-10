---
title: Inleiding — whiteboard voor rijscenario's
description: drawtonomy is een gratis, browsergebaseerd whiteboard voor rijscenario's. Schets rijstroken, kruispunten, voertuigen en voetgangers voor papers, dia's, ontwerpdiscussies en scenariocreatie. Exporteert naar OpenDRIVE, OpenSCENARIO en Lanelet2.
sidebar:
  label: Inleiding
  order: 1
keywords:
  - whiteboard voor rijscenario's
  - rijscenario diagramtool
  - whiteboard voor autonoom rijden
  - autonoom rijden figuur paper
  - autonoom rijden figuur presentatie
  - zelfrijdend scenario online tekenen
  - verkeerssituatie schetstool
  - rijstrook diagram editor browser
  - scenariodiagram voor ontwerpevaluatie
  - whiteboard ADAS team
  - drawtonomy wat is het
  - simulatie autonoom voertuig
---

drawtonomy is een whiteboard voor rijscenario's. Het soort figuur
dat u in een paper plaatst, de dia die u schetst voor een
ontwerpevaluatie, het diagram dat u tijdens een gesprek tekent
om een randgeval aan de rest van het team uit te leggen, of de
scène die u uitwerkt voordat u het OpenSCENARIO-bestand schrijft.

Rijstroken, kruispunten, voertuigen, voetgangers, verkeerslichten,
wegmarkeringen en zebrapaden zijn ingebouwde vormen. Rijstroken
zijn topologiebewust — ze bevatten verbindingen voor Volgende /
Vorige / Links / Rechts — zodat het diagram een netwerk is dat u
kunt bewerken, niet een afbeelding die u opnieuw tekent zodra de
weggeometrie verandert.

De app staat op [drawtonomy.com](https://drawtonomy.com). De SDK,
extensies en de broncode voor deze documentatiesite staan op
[GitHub](https://github.com/kosuke55/drawtonomy).

## Waar mensen het voor gebruiken

- **Figuren voor papers, scripties en technische rapporten.**
  Vectoruitvoer (`drawtonomy.svg`, PDF, EPS) die netjes is in te
  bedden in LaTeX, Markdown en slidedecks.
- **Dia's en presentaties.** Diagrammen van
  rijstrookwisselingsmanoeuvres, kruispunten, afdekkingscasussen
  en andere rijscenario's — getekend in seconden in plaats van
  minuten per vorm.
- **Ontwerp- en algoritmediscussies.** Een gedeeld schetsoppervlak
  om met teamgenoten over rijgedrag, randgevallen en
  veiligheidsargumenten te praten.
- **Scenariocreatie.** Schets de scène voordat u OpenSCENARIO XML
  schrijft, of importeer een bestaande `.xosc` en bewerk deze
  visueel.
- **Kaart- en ROS-annotatie.** Trek rijstroken over een
  satellietachtergrond, bewerk Lanelet2 OSM-kaarten of annoteer een
  ROS occupancy grid met paden en obstakels.

## Voor wie dit bedoeld is

- **Ingenieurs voor autonoom rijden en ADAS** die diagrammen
  tekenen voor interne documentatie, ontwerpevaluaties en
  incidentrapportages.
- **AV-onderzoekers en studenten** die figuren produceren voor
  papers, scripties en conferentielezingen.
- **Scenario-auteurs** die werken met simulatoren zoals
  [esmini](https://github.com/esmini/esmini), CARLA of
  in-house-tools.
- **Gebruikers van HD-kaarten en Lanelet2** die wijzigingen
  schetsen tegen een bestaand wegennet.
- **ROS- en robotica-teams** die op occupancy grids tekenen
  gebouwd met nav2, Cartographer of Gmapping.
- **Rijinstructeurs en docenten** die diagrammen produceren voor
  lesmateriaal.
- **Toolbouwers** die de editor uitbreiden met nieuwe exporters,
  importers of AI-ondersteunde functies via de
  [extensie-SDK](/nl/extend/).

## Hoe deze documentatie is georganiseerd

De site volgt de [Diátaxis](https://diataxis.fr/)-indeling. Kies
de sectie die past bij wat u doet.

| Sectie | Wanneer u het leest |
|---|---|
| [Tutorials](/nl/tutorials/) | U bent nieuw en wilt leren door te doen. |
| [How-to-handleidingen](/nl/guides/) | U weet wat u wilt bereiken en heeft de stappen nodig. |
| [Referentie](/nl/reference/) | U moet een exact feit opzoeken — een sneltoets, een formaat, een API. |
| [Uitleg](/nl/explanation/) | U wilt begrijpen waarom drawtonomy werkt zoals het werkt. |
| [drawtonomy uitbreiden](/nl/extend/) | U bouwt voort op drawtonomy. |

Als u niet weet waar u moet beginnen, brengt de
[Snelstart](/nl/start/quickstart/) u in vijf minuten van een leeg
canvas naar een geëxporteerde scène.
