---
title: Waarom drawtonomy — een whiteboard gebouwd voor rijscenario's
description: Waarom drawtonomy bestaat en de ontwerpkeuzes erachter. Speciaal gebouwd voor rijscenario's — de figuren die in papers, slidedecks, ontwerpevaluaties en scenariocreatie over autonoom rijden terechtkomen.
keywords:
  - waarom drawtonomy
  - whiteboard voor rijscenario's
  - whiteboard autonoom rijden
  - figuurtool voor AV-onderzoekspapers
  - illustratiesoftware autonoom rijden
  - alternatief voor slidetools voor wegdiagrammen
  - whiteboard ADAS team
---

drawtonomy is een whiteboard speciaal gebouwd voor rijscenario's.
De meeste teams schetsen deze diagrammen vandaag in generieke
tekentools of slidedecks — die werken prima voor algemene vormen,
maar ze weten niet wat een rijstrook is, dus moet de geometrie
opnieuw worden getekend zodra de weg afbuigt, het kruispunt een
been krijgt of een zebrapad op de weg moet aansluiten.

Deze pagina legt de ontwerpkeuzes uit die voortvloeien uit het
voorop stellen van "whiteboard voor rijscenario's" in plaats van
"tool die naar een simulator exporteert".

## Het probleem waar het omheen is gebouwd

De meeste daadwerkelijke communicatie over autonoom rijden
gebeurt via diagrammen: in papers, ontwerpevaluaties,
planningsvergaderingen, incidentrapportages, klaslokalen en
slidedecks. Het diagram is het artefact waar mensen naar kijken,
over discussiëren en zich herinneren.

Generieke tekentools geven u op dat niveau alleen generieke
vormen. Een rijstrook is een rechthoek die u opnieuw tekent zodra
de weg afbuigt; een zebrapad is een stapel rechthoeken die u
steeds met de hand uitlijnt; een kruispunt is een half uur
gepriegel. Erger nog, op het moment dat de weggeometrie verandert
— en bij AV-werk verandert die voortdurend — begint u opnieuw.

drawtonomy bestaat om die loop snel te maken. De bouwstenen die
het domein eigenlijk heeft — rijstroken, kruispunten, zebrapaden,
verkeerslichten, wegmarkeringen, voertuigen, voetgangers — zijn
first-class vormen, zodat de figuur correct blijft terwijl u
itereert.

## Waar drawtonomy zich bevindt

Werk aan rijscenario's gebeurt op verschillende niveaus:

1. **Diagrammen.** Papers, dia's, whiteboardschetsen, figuren in
   ontwerpdocumenten, lesmateriaal. In principe snel en
   makkelijk, maar in een generieke tool moet de weggeometrie
   steeds opnieuw worden opgebouwd.
2. **Authoring tools.** OpenSCENARIO-editors, wegennet-editors,
   CAD-achtige pakketten. Precies, traag, duur om te leren.
3. **Simulators.** esmini, CARLA, in-house tools. Voer het
   scenario uit, produceer data.

drawtonomy bevindt zich op niveau 1 en kruist niveau 2 wanneer u:
een Lanelet2-kaart wilt importeren, wijzigingen wilt schetsen,
OpenDRIVE/OpenSCENARIO wilt exporteren en het resultaat wilt
overdragen aan esmini.

## Ontwerpprioriteiten

### Whiteboard-first

Het vergelijkingspunt is een snelle whiteboard- of
slidedeckschets, geen CAD-tool. Dat zet de lat voor frictie:
open een URL, teken, deel. Geen installatie, geen account, geen
projectbestandsformaat. Alles wat drawtonomy zwaarder zou maken
dan een snelle schets, sneuvelt.

### Topologiebewust

Een weg is niet een zak met polylijnen. drawtonomy modelleert
rijstrookverbindingen (Volgende / Vorige / Links / Rechts) zodat
het verplaatsen van een grenslijn de naburige rijstroken
automatisch bijwerkt. Twee rijstroken die een grens delen, delen
dezelfde grenspunten — één keer slepen, beide bewegen mee. Zie
[Rijstrookverbindingsmodel](/nl/explanation/lane-model/).

### Sjablonen uit het rijdomein

Voertuigen (sedan, bus, vrachtwagen, motor…), voetgangers
(walking, simple), verkeerslichten voor voertuigen en
voetgangers, zebrapaden, wegmarkeringen, borden,
kruispuntsjablonen. Het zijn ingebouwde vormen in plaats van
generieke-rechthoek-benaderingen. Aangepaste SVG-sjablonen kunnen
worden toegevoegd via een PR.

### Bewerkbaar op de weg eruit, net als erin

Elk uitvoerformaat dat drawtonomy produceert behoudt voldoende
state om opnieuw bewerkt te kunnen worden. `drawtonomy.svg` is de
verliesvrije canonieke vorm: een gewone SVG die overal werkt
(browsers, GitHub, slidedecks, paper-figuren) en in drawtonomy
heropent met elke verbinding en overlap-relatie intact. Niets zit
opgesloten in een formaat dat u niet terug kunt lezen.

### Headless wanneer nodig

De exporter- en parsercode is onderdeel van `@drawtonomy/sdk` en
draait zonder de editor. CI-pijplijnen, browserextensies en
AI-tools kunnen scènes programmatisch genereren en valideren.

## Bruggen naar de rest van de workflow

Zodra u een diagram heeft, wilt u er meestal iets mee doen.
drawtonomy levert verschillende bruggen zodat de figuur niet
opgesloten blijft in de editor:

- **`drawtonomy.svg`** — de standaard. Insluiten in papers,
  dia's, Markdown-documentatie; later opnieuw openen om te
  blijven bewerken.
- **Lanelet2 round-trip** — open een Lanelet2 OSM-kaart
  (inclusief Autoware-voorbeeldkaarten), bewerk, exporteer terug.
  Handig om wijzigingen te schetsen tegen een bestaande HD-kaart.
- **ASAM-export** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, optioneel
  gebundeld als een [esmini](https://github.com/esmini/esmini)-klaar
  zip.
- **AI Scene Generator** — beschrijf een scenario in natuurlijke
  taal of plak OpenSCENARIO XML, en krijg een bewerkbaar canvas
  om vanaf te beginnen verfijnen.

Deze bruggen zijn nuttig, maar het diagram zelf is de reden
waarom drawtonomy bestaat. Een figuur in drawtonomy is al
waardevol als figuur; deze formaten laten het naar de volgende
fase van de workflow stromen wanneer dat nodig is.

## Wat drawtonomy niet is

- **Geen simulator.** Het draait geen scenario's. Exporteer naar
  esmini, CARLA of uw eigen tool daarvoor.
- **Geen CAD-tool.** Het dwingt geen technische precisie af
  (clothoïde-splines, helling, hoogte). Geometrie is rechttoe
  rechtaan 2D.
- **Geen real-time samenwerkingssuite.** Het is een
  single-user-editor. Opslaan, delen, opnieuw openen.

## Zie ook

- [Rijstrookverbindingsmodel](/nl/explanation/lane-model/)
- [Exporter-architectuur](/nl/explanation/exporter-architecture/)
- [Extensie-architectuur](/nl/explanation/extension-architecture/)
