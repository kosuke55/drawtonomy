---
title: Introduzione — lavagna per scenari di guida
description: drawtonomy è una lavagna gratuita basata su browser per scenari di guida. Disegna corsie, incroci, veicoli e pedoni per articoli, slide, discussioni di progettazione e authoring di scenari. Esporta verso OpenDRIVE, OpenSCENARIO e Lanelet2.
sidebar:
  label: Introduzione
  order: 1
keywords:
  - lavagna per scenari di guida
  - strumento diagramma scenario di guida
  - strumento diagramma guida autonoma
  - figura guida autonoma articolo
  - figura guida autonoma presentazione
  - disegnare scenario guida autonoma online
  - strumento schizzo scenari di traffico
  - editor diagramma corsie browser
  - diagramma scenario revisione progetto
  - lavagna team guida autonoma
  - cosa è drawtonomy
---

drawtonomy è una lavagna per scenari di guida. Il tipo di figura
che inserisci in un articolo, la slide che disegni prima di una
revisione di progetto, il diagramma che traccia durante una
chiamata mentre spieghi un caso limite al resto del team, oppure
la scena che abbozzi prima di scrivere il file OpenSCENARIO.

Corsie, incroci, veicoli, pedoni, semafori, segnaletica
orizzontale e attraversamenti pedonali sono forme integrate. Le
corsie sono consapevoli della topologia — trasportano connessioni
Successiva / Precedente / Sinistra / Destra — quindi il diagramma
è una rete che puoi modificare, non un'immagine che ridisegni
ogni volta che cambia la geometria stradale.

L'app è su [drawtonomy.com](https://drawtonomy.com). L'SDK, le
estensioni e il sorgente di questo sito di documentazione sono su
[GitHub](https://github.com/kosuke55/drawtonomy).

## A cosa lo si usa

- **Figure per articoli, tesi e relazioni tecniche.** Output
  vettoriale (`drawtonomy.svg`, PDF, EPS) che si integra in modo
  pulito in LaTeX, Markdown e presentazioni.
- **Slide e presentazioni.** Diagrammi di manovre di cambio
  corsia, incroci, casi di occlusione e altri scenari di guida —
  disegnati in pochi secondi anziché in minuti per ogni forma.
- **Discussioni di progettazione e algoritmi.** Una superficie di
  schizzo condivisa per parlare di comportamento di guida, casi
  limite e argomentazioni di sicurezza con i colleghi.
- **Authoring di scenari.** Disegna la scena prima di scrivere
  l'XML OpenSCENARIO, oppure importa un `.xosc` esistente e
  modificalo visivamente.
- **Annotazione di mappe e ROS.** Ricalca corsie su uno sfondo
  satellitare, modifica mappe Lanelet2 OSM o annota una griglia
  di occupazione ROS con traiettorie e ostacoli.

## A chi è rivolto

- **Ingegneri della guida autonoma e ADAS** che disegnano
  diagrammi per documentazione interna, revisioni di progetto e
  rapporti di incidenti.
- **Ricercatori e studenti AV** che producono figure per
  articoli, tesi e conferenze.
- **Autori di scenari** che lavorano con simulatori come
  [esmini](https://github.com/esmini/esmini), CARLA o strumenti
  interni.
- **Utenti di mappe HD e Lanelet2** che abbozzano modifiche a
  una rete stradale esistente.
- **Team ROS e di robotica** che disegnano sopra griglie di
  occupazione costruite con nav2, Cartographer o Gmapping.
- **Istruttori di guida ed educatori** che producono diagrammi
  per materiale didattico.
- **Sviluppatori di strumenti** che estendono l'editor con nuovi
  esportatori, importatori o funzionalità basate su IA tramite
  l'[SDK delle estensioni](/it/extend/).

## Come è organizzata questa documentazione

Il sito segue la suddivisione [Diátaxis](https://diataxis.fr/).
Scegli la sezione che corrisponde a ciò che stai facendo.

| Sezione | Quando leggerla |
|---|---|
| [Tutorial](/it/tutorials/) | Sei nuovo e vuoi imparare facendo. |
| [Guide pratiche](/it/guides/) | Sai cosa vuoi ottenere e ti servono i passi. |
| [Riferimento](/it/reference/) | Devi cercare un fatto preciso — una scorciatoia, un formato, un'API. |
| [Spiegazione](/it/explanation/) | Vuoi capire perché drawtonomy funziona così. |
| [Estendere drawtonomy](/it/extend/) | Stai costruendo sopra drawtonomy. |

Se non sai da dove iniziare, l'[Avvio rapido](/it/start/quickstart/)
sono cinque minuti dalla tela vuota a una scena esportata.
