---
title: Introduktion — whiteboard för körscenarier
description: drawtonomy är en gratis, webbläsarbaserad whiteboard för körscenarier. Skissa körfält, korsningar, fordon och fotgängare för artiklar, presentationer, designdiskussioner och scenarioskapande. Exporterar till OpenDRIVE, OpenSCENARIO och Lanelet2.
sidebar:
  label: Introduktion
  order: 1
keywords:
  - whiteboard för körscenarier
  - körscenariodiagramverktyg
  - whiteboard för självkörande
  - självkörande figur till artikel
  - självkörande figur till presentation
  - rita självkörande scenario online
  - skissverktyg trafikscenario
  - körfältsdiagramredigerare webbläsare
  - scenariodiagram för designgranskning
  - whiteboard för team inom autonom körning
  - drawtonomy vad är
---

drawtonomy är en whiteboard för körscenarier. Den typ av figur du
sätter i en artikel, sliden du skissar inför en designgranskning,
diagrammet du ritar under ett samtal när du förklarar ett hörnfall
för resten av teamet, eller scenen du skissar innan du skriver
OpenSCENARIO-filen.

Körfält, korsningar, fordon, fotgängare, trafiksignaler,
vägmarkeringar och övergångsställen är inbyggda former. Körfält
är topologimedvetna — de bär Nästa/Föregående/Vänster/Höger-kopplingar
— så diagrammet är ett nätverk du kan redigera, inte en bild du
ritar om varje gång väggeometrin ändras.

Appen finns på [drawtonomy.com](https://drawtonomy.com). SDK:n,
tilläggen och källkoden för denna dokumentationssida finns på
[GitHub](https://github.com/kosuke55/drawtonomy).

## Vad människor använder det till

- **Figurer för artiklar, avhandlingar och tekniska rapporter.**
  Vektorutdata (`drawtonomy.svg`, PDF, EPS) som bäddas in rent i
  LaTeX, Markdown och presentationer.
- **Slides och presentationer.** Diagram över filbytesmanövrar,
  korsningar, ocklusionsfall och andra körscenarier — ritade på
  sekunder snarare än minuter per form.
- **Design- och algoritmdiskussioner.** En delad skissyta för att
  prata igenom körbeteende, gränsfall och säkerhetsargument med
  kollegor.
- **Scenarioskapande.** Skissa scenen innan du skriver OpenSCENARIO-XML,
  eller importera en befintlig `.xosc` och redigera den visuellt.
- **Karta och ROS-annotering.** Spåra körfält över en
  satellitbakgrund, redigera Lanelet2 OSM-kartor, eller annotera
  en ROS occupancy grid med banor och hinder.

## Vem detta är för

- **Ingenjörer inom självkörande och ADAS** som ritar diagram för
  intern dokumentation, designgranskningar och incidentrapporter.
- **AV-forskare och studenter** som producerar figurer för
  artiklar, avhandlingar och konferenspresentationer.
- **Scenarioförfattare** som arbetar med simulatorer som
  [esmini](https://github.com/esmini/esmini), CARLA eller interna
  verktyg.
- **HD-kart- och Lanelet2-användare** som skissar ändringar mot
  ett befintligt vägnät.
- **ROS- och robotikteam** som ritar ovanpå occupancy grids
  byggda med nav2, Cartographer eller Gmapping.
- **Körinstruktörer och utbildare** som producerar diagram för
  undervisningsmaterial.
- **Verktygsbyggare** som utökar redigeraren med nya exportörer,
  importörer eller AI-assisterade funktioner via
  [tilläggs-SDK:n](/sv/extend/).

## Hur denna dokumentation är organiserad

Webbplatsen följer [Diátaxis](https://diataxis.fr/)-uppdelningen.
Välj den sektion som matchar vad du gör.

| Sektion | När du ska läsa den |
|---|---|
| [Tutorials](/sv/tutorials/) | Du är ny och vill lära dig genom att göra. |
| [Instruktionsguider](/sv/guides/) | Du vet vad du ska åstadkomma och behöver stegen. |
| [Referens](/sv/reference/) | Du behöver slå upp ett exakt faktum — en genväg, ett format, ett API. |
| [Förklaring](/sv/explanation/) | Du vill förstå varför drawtonomy fungerar som det gör. |
| [Utöka drawtonomy](/sv/extend/) | Du bygger ovanpå drawtonomy. |

Om du inte vet var du ska börja, är
[Snabbstarten](/sv/start/quickstart/) fem minuter från en tom canvas
till en exporterad scen.
