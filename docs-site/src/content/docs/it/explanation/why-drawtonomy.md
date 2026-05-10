---
title: Perché drawtonomy — una lavagna costruita per scenari di guida
description: Perché drawtonomy esiste e le scelte di progettazione che lo guidano. Costruito specificamente per scenari di guida — le figure che entrano in articoli di guida autonoma, presentazioni, revisioni di progetto e authoring di scenari.
keywords:
  - perché drawtonomy
  - lavagna per scenari di guida
  - strumento diagramma guida autonoma
  - strumento figure articoli ricerca AV
  - software illustrazione guida autonoma
  - alternativa a strumenti slide per diagrammi stradali
  - lavagna team guida autonoma
  - figura guida autonoma articolo
---

drawtonomy è una lavagna costruita specificamente per scenari di
guida. La maggior parte dei team oggi disegna questi diagrammi in
strumenti di disegno generici o in presentazioni — funzionano
bene per forme generiche, ma non sanno cosa sia una corsia,
quindi la geometria deve essere ridisegnata ogni volta che la
strada curva, l'incrocio aggiunge un braccio o un attraversamento
pedonale deve allinearsi alla strada.

Questa pagina spiega le scelte di progettazione che derivano dal
partire da "lavagna per scenari di guida" piuttosto che da
"strumento che esporta verso un simulatore".

## Il problema attorno al quale è costruito

Gran parte della comunicazione effettiva sulla guida autonoma
avviene attraverso diagrammi: in articoli, revisioni di progetto,
riunioni di pianificazione, rapporti di incidenti, aule e
presentazioni. Il diagramma è l'artefatto che le persone guardano,
discutono e ricordano.

Gli strumenti di disegno generici a quel livello forniscono solo
forme generiche. Una corsia è un rettangolo che si ridisegna ogni
volta che la strada curva; un attraversamento pedonale è una
pila di rettangoli da allineare a mano; un incrocio è mezz'ora di
lavoro fastidioso. Peggio ancora, nel momento in cui la
geometria stradale cambia — e nel lavoro AV cambia
costantemente — si ricomincia da capo.

drawtonomy esiste per rendere veloce quel ciclo. Gli elementi
costruttivi che il dominio possiede effettivamente — corsie,
incroci, attraversamenti pedonali, semafori, segnaletica
orizzontale, veicoli, pedoni — sono forme di prima classe, così
la figura rimane corretta mentre iteri.

## Dove si colloca drawtonomy

Il lavoro sugli scenari di guida avviene a diversi livelli:

1. **Diagrammi.** Articoli, slide, schizzi su lavagna, figure di
   documenti di progetto, materiale didattico. Veloce e facile
   in linea di principio, ma in uno strumento generico la
   geometria stradale deve essere ricostruita ogni volta che
   qualcosa si sposta.
2. **Strumenti di authoring.** Editor OpenSCENARIO, editor di
   reti stradali, pacchetti in stile CAD. Precisi, lenti,
   costosi da imparare.
3. **Simulatori.** esmini, CARLA, strumenti interni. Eseguono lo
   scenario, producono dati.

drawtonomy vive al livello 1, e attraversa al livello 2 quando ne
hai bisogno: importare una mappa Lanelet2, abbozzare modifiche,
esportare OpenDRIVE/OpenSCENARIO, consegnare il risultato a
esmini.

## Priorità di progettazione

### Whiteboard-first

Il punto di confronto è uno schizzo veloce su lavagna o in una
slide, non uno strumento CAD. Questo stabilisce l'asticella per
l'attrito: apri un URL, disegna, condividi. Nessuna installazione,
nessun account, nessun formato di file di progetto. Qualunque cosa
faccia sentire drawtonomy più pesante di uno schizzo veloce viene
tagliata.

### Consapevole della topologia

Una strada non è un sacchetto di polilinee. drawtonomy modella le
connessioni delle corsie (Successiva / Precedente / Sinistra /
Destra) in modo che spostare un bordo aggiorni automaticamente le
corsie vicine. Due corsie che condividono un bordo condividono
gli stessi punti del bordo — una sola trascinata, entrambe si
muovono. Vedi
[Modello di connessione delle corsie](/it/explanation/lane-model/).

### Template del dominio della guida

Veicoli (sedan, bus, camion, motocicletta…), pedoni (camminata,
semplice), semafori per veicoli e pedoni, attraversamenti
pedonali, segnaletica orizzontale, segnali, template di incrocio.
Sono forme integrate piuttosto che approssimazioni di rettangoli
generici. I template SVG personalizzati possono essere aggiunti
tramite PR.

### Modificabili sia in entrata che in uscita

Ogni formato di output che drawtonomy produce preserva abbastanza
stato per essere ri-modificato. `drawtonomy.svg` è la forma
canonica senza perdita: un normale SVG che si visualizza ovunque
(browser, GitHub, presentazioni, figure di articoli) e si riapre
in drawtonomy con ogni connessione e relazione di sovrapposizione
intatte. Niente rimane intrappolato in un formato che non puoi
rileggere.

### Headless quando serve

Il codice dell'esportatore e del parser fa parte di
`@drawtonomy/sdk` e gira senza l'editor. Pipeline CI, estensioni
del browser e strumenti di IA possono generare e validare scene
in modo programmatico.

## Ponti verso il resto del flusso di lavoro

Una volta che hai un diagramma, di solito vuoi farne qualcosa.
drawtonomy fornisce diversi ponti in modo che la figura non
rimanga bloccata dentro l'editor:

- **`drawtonomy.svg`** — il default. Da incorporare in articoli,
  slide, documenti Markdown; riapri in seguito per continuare a
  modificare.
- **Round-trip Lanelet2** — apri una mappa Lanelet2 OSM (incluse
  le mappe campione di Autoware), modifica, riesporta. Utile per
  abbozzare modifiche a una mappa HD esistente.
- **Esportazione ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3,
  opzionalmente come zip pronto per
  [esmini](https://github.com/esmini/esmini).
- **AI Scene Generator** — descrivi uno scenario in linguaggio
  naturale, oppure incolla XML OpenSCENARIO, e ottieni un canvas
  modificabile da cui iniziare a rifinire.

Questi ponti sono utili, ma il diagramma stesso è il motivo per
cui drawtonomy esiste. Una figura in drawtonomy è già preziosa
come figura; questi formati le permettono di fluire nella fase
successiva del flusso di lavoro quando serve.

## Cosa drawtonomy non è

- **Non è un simulatore.** Non esegue scenari. Esporta verso
  esmini, CARLA o un tuo strumento per quello.
- **Non è uno strumento CAD.** Non impone precisione ingegneristica
  (spline clotoidi, sopraelevazione, elevazione). La geometria è
  semplice 2D.
- **Non è una suite di collaborazione in tempo reale.** È un
  editor per singolo utente. Salva, condividi, riapri.

## Vedi anche

- [Modello di connessione delle corsie](/it/explanation/lane-model/)
- [Architettura dell'esportatore](/it/explanation/exporter-architecture/)
- [Architettura delle estensioni](/it/explanation/extension-architecture/)
