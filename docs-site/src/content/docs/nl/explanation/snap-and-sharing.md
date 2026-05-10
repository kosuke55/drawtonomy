---
title: Snap- en puntdeling
description: Twee gerelateerde maar verschillende mechanismen om vormen uitgelijnd te houden.
---

Snap en puntdeling gaan beide over "dit punt komt op dat ding".
Ze zien er in de UI hetzelfde uit, maar ze hebben verschillende
gevolgen. Ze door elkaar halen is de meest voorkomende oorzaak van
"waarom zijn mijn vormen verschoven?"-bugs.

## Snap = zelfde coördinaat

Snapping verplaatst uw cursor (of een vertex die u sleept) zodat
deze op een bestaand doel landt. Het resultaat zijn twee
afzonderlijke punten die *toevallig* dezelfde coördinaten delen.

Verplaats het oorspronkelijke doel later en uw gesnapte punt
volgt niet. Ze waren nooit gekoppeld.

Dit is wat u wilt wanneer u schetst: nauwkeurige uitlijning, geen
verborgen koppeling.

## Sharing = zelfde identiteit

Een gedeeld punt is één object dat door meerdere vormen wordt
gerefereerd. Verplaats het één keer, elke vorm die de referentie
bevat, beweegt mee.

U creëert gedeelde punten door <kbd>Alt</kbd> ingedrukt te houden
tijdens het klikken, of door een vertex op een bestaand vertex te
slepen in segmentbewerkingsmodus.

Dit is wat u wilt voor grenzen die nooit zouden mogen scheiden —
twee aangrenzende rijstrookranden, twee polygoonhoeken die aan
elkaar gelast moeten blijven, het einde van het ene pad en het
begin van een ander.

## Waarom onderscheid maken

Als twee vormranden die hetzelfde zouden moeten zijn, eigenlijk
twee gesnapte punten zijn, sleept u er een, exporteert u naar
OpenDRIVE, en het wegennet opent zich op die vertex. De simulator
kan de kloof als discontinuïteit interpreteren, of erover
heensmeren afhankelijk van de tool.

Lane Links/Rechts-buren die een grens delen, gebruiken intern
altijd gedeelde punten — dat is niet optioneel en niet
gebruikersgestuurd. Voor willekeurige vormen (Linestring,
Polygon, Path) is de keuze aan u.

## Visuele aanwijzingen

- Een snap-doel toont één gemarkeerd handvat en trekt aan de
  cursor.
- Een gedeeld punt wordt weergegeven als een dubbel handvat in
  segmentbewerkingsmodus.

## Zie ook

- [Snap naar bestaande geometrie](/nl/guides/snap/)
- [Punten delen tussen vormen](/nl/guides/point-sharing/)
