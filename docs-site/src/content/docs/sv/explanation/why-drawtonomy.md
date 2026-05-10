---
title: Varför drawtonomy — en whiteboard byggd för körscenarier
description: Varför drawtonomy finns och designvalen bakom det. Byggd specifikt för körscenarier — figurerna som hamnar i artiklar om självkörande, presentationer, designgranskningar och scenarioskapande.
keywords:
  - varför drawtonomy
  - whiteboard för körscenarier
  - körscenariodiagramverktyg
  - figurverktyg för AV-forskningsartiklar
  - illustrationsmjukvara för självkörande
  - alternativ till presentationsverktyg för vägdiagram
  - whiteboard för team inom autonom körning
  - självkörande figur till artikel
---

drawtonomy är en whiteboard byggd specifikt för körscenarier. De
flesta team skissar dessa diagram idag i generiska ritverktyg
eller presentationsprogram — de fungerar bra för allmänna former,
men de vet inte vad ett körfält är, så geometrin måste ritas om
varje gång vägen svänger, korsningen får ett ben, eller ett
övergångsställe behöver linjeras med vägen.

Den här sidan förklarar designvalen som följer av att leda med
"whiteboard för körscenarier" snarare än "verktyg som exporterar
till en simulator".

## Problemet det är byggt kring

Det mesta av faktisk kommunikation om självkörande sker genom
diagram: i artiklar, designgranskningar, planeringsmöten,
incidentrapporter, klassrum och presentationer. Diagrammet är den
artefakt människor tittar på, argumenterar om och kommer ihåg.

Generiska ritverktyg på den nivån ger dig bara generiska former.
Ett körfält är en rektangel du ritar om varje gång vägen svänger;
ett övergångsställe är en stapel rektanglar du fortsätter linjera
för hand; en korsning är en halvtimme av pillande. Värre,
ögonblicket väggeometrin ändras — och i AV-arbete ändras den
ständigt — börjar du om.

drawtonomy finns för att göra den loopen snabb. Byggblocken
domänen faktiskt har — körfält, korsningar, övergångsställen,
trafiksignaler, vägmarkeringar, fordon, fotgängare — är
förstklassiga former, så figuren förblir korrekt när du itererar.

## Var drawtonomy sitter

Körscenarioarbete sker på ett par olika nivåer:

1. **Diagram.** Artiklar, slides, whiteboard-skisser,
   designdokumentfigurer, klassrumsmaterial. Snabbt och enkelt i
   princip, men i ett generiskt verktyg måste väggeometrin byggas
   om varje gång något flyttar sig.
2. **Skapelseverktyg.** OpenSCENARIO-redigerare,
   vägnätsredigerare, CAD-liknande paket. Precist, långsamt, dyrt
   att lära sig.
3. **Simulatorer.** esmini, CARLA, interna verktyg. Kör scenariot,
   producera data.

drawtonomy bor på nivå 1 och korsar in på nivå 2 när du behöver:
importera en Lanelet2-karta, skissa ändringar, exportera
OpenDRIVE/OpenSCENARIO, lämna resultatet till esmini.

## Designprioriteringar

### Whiteboard-först

Jämförelsepunkten är en snabb whiteboard- eller
presentationsskiss, inte ett CAD-verktyg. Det sätter ribban för
friktion: öppna en URL, rita, dela. Ingen installation, inget
konto, inget projektfilformat. Allt som skulle få drawtonomy att
kännas tyngre än en snabb skiss skärs bort.

### Topologimedvetet

En väg är inte en påse polylinjer. drawtonomy modellerar
körfältskopplingar (Nästa/Föregående/Vänster/Höger) så att att
flytta en gräns uppdaterar angränsande körfält automatiskt. Två
körfält som delar en gräns delar samma gränspunkter — dra en
gång, båda flyttar sig. Se
[Körfältskopplingsmodell](/sv/explanation/lane-model/).

### Domänspecifika mallar

Fordon (sedan, buss, lastbil, motorcykel…), fotgängare (gående,
enkel), trafiksignaler för fordon och fotgängare,
övergångsställen, vägmarkeringar, skyltar, korsningsmallar. De är
inbyggda former snarare än approximationer av generiska
rektanglar. Anpassade SVG-mallar kan läggas till via PR.

### Redigerbart på vägen ut såväl som in

Varje utdataformat drawtonomy producerar bevarar tillräckligt med
tillstånd för att kunna redigeras igen. `drawtonomy.svg` är den
förlustfria kanoniska formen: en vanlig SVG som förhandsvisas
överallt (webbläsare, GitHub, presentationer, artikelfigurer) och
öppnas igen i drawtonomy med varje koppling och överlappsrelation
intakt. Inget är fångat i ett format du inte kan läsa tillbaka.

### Headless när det behövs

Exportör- och parsingkoden är en del av `@drawtonomy/sdk` och
körs utan redigeraren. CI-pipelines, webbläsartillägg och
AI-verktyg kan generera och validera scener programmatiskt.

## Bryggor till resten av arbetsflödet

När du har ett diagram vill du oftast göra något med det.
drawtonomy levererar flera bryggor så att figuren inte stannar
inlåst i redigeraren:

- **`drawtonomy.svg`** — standarden. Bädda in i artiklar, slides,
  Markdown-dokument; öppna igen senare för att fortsätta
  redigera.
- **Lanelet2 tur och retur** — öppna en Lanelet2 OSM-karta
  (inklusive Autoware-exempelkartor), redigera, exportera
  tillbaka. Användbart för att skissa ändringar mot en befintlig
  HD-karta.
- **ASAM-export** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, valfritt
  paketerat som en
  [esmini](https://github.com/esmini/esmini)-färdig zip.
- **AI Scene Generator** — beskriv ett scenario på naturligt
  språk, eller klistra in OpenSCENARIO-XML, och få en redigerbar
  canvas att börja förfina från.

Dessa bryggor är användbara, men diagrammet i sig är anledningen
till att drawtonomy finns. En figur i drawtonomy är redan värdefull
som figur; dessa format låter den flöda in i nästa steg av
arbetsflödet när det behövs.

## Vad drawtonomy inte är

- **Inte en simulator.** Det kör inte scenarier. Exportera till
  esmini, CARLA eller ditt eget verktyg för det.
- **Inte ett CAD-verktyg.** Det driver inte teknisk noggrannhet
  (klotoidsplines, banking, höjd). Geometri är rakt på 2D.
- **Inte en svit för realtidssamarbete.** Det är en
  enkelanvändarredigerare. Spara, dela, öppna igen.

## Se även

- [Körfältskopplingsmodell](/sv/explanation/lane-model/)
- [Exportörarkitektur](/sv/explanation/exporter-architecture/)
- [Tilläggsarkitektur](/sv/explanation/extension-architecture/)
