---
title: Modello di connessione delle corsie
description: Come drawtonomy rappresenta la topologia stradale e cosa offre.
---

Una Lane di drawtonomy ha più di due bordi e una linea centrale;
porta anche quattro slot di connessione — **Next**, **Previous**,
**Left** e **Right** — che la collegano a una rete stradale.

## I quattro slot

| Slot | Significato |
|---|---|
| **Next** | La corsia in cui scorre il traffico su questa corsia. |
| **Previous** | La corsia che confluisce in questa corsia. |
| **Left** | La corsia immediatamente a sinistra, condividendo un bordo. |
| **Right** | La corsia immediatamente a destra, condividendo un bordo. |

Le connessioni sono bidirezionali: impostare Next della corsia A
su B imposta anche Previous di B su A. L'editor mantiene questo
invariante per te.

## Cosa abilitano le connessioni

### Modifica coordinata

Quando due corsie condividono un bordo — perché sono vicine
Sinistra/Destra, o perché corsie Successiva/Precedente si
incontrano testa a testa — quel bordo è un singolo oggetto.
Trascina un punto su di esso ed entrambe le corsie si aggiornano.

La topologia dice già cosa è incollato a cosa, quindi la
geometria non deve essere riparata a mano ogni volta che modifichi
una corsia.

### Esportazione coerente

Sia [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
sia
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
codificano la connettività delle corsie. Gli esportatori di
drawtonomy usano direttamente gli slot di connessione, senza
inferenze o euristiche che possano cedere su casi limite. Una
scena che sembra corretta nell'editor viene esportata come una
vera rete stradale piuttosto che come un sacchetto di polilinee.

### Round-trip con le importazioni

L'importatore Lanelet2 legge lo stesso modello di connessione
dai file `.osm`. Puoi modificare una mappa Lanelet2 in drawtonomy
ed esportarla nuovamente senza perdere la topologia.

## Quando le connessioni vengono dedotte

drawtonomy imposta automaticamente le connessioni quando
l'intento è chiaro:

- Disegnare una corsia che inizia sull'estremità di una corsia
  esistente imposta **Previous**.
- La scorciatoia di corsia parallela (<kbd>Alt</kbd>+clic con lo
  strumento Lane) imposta **Left** o **Right**.
- Posizionare un [template di incrocio](/it/guides/participants/)
  collega ogni corsia di approccio.
- Il [Lane Generator](/it/guides/lane-from-map/) deduce le
  connessioni dalla topologia OSM dove non sono ambigue.

Per tutto il resto, impostale a mano nel pannello degli
attributi — vedi
[Gestire le connessioni delle corsie](/it/guides/lane-connections/).

## Cosa le connessioni non codificano

- **La direzione di marcia** è implicita in Next/Previous, ma non
  è codificata separatamente. Le strade bidirezionali vengono
  modellate come due corsie opposte con le proprie catene
  Next/Previous.
- **Le restrizioni di svolta** agli incroci non sono modellate in
  drawtonomy stesso. Appaiono nell'esportazione
  OpenDRIVE/OpenSCENARIO attraverso il template di incrocio che
  le ha prodotte.
- **Limiti di velocità, tipo di superficie, illuminazione** —
  niente di tutto questo. drawtonomy è geometria più topologia;
  gli attributi semantici sono fuori ambito.

## Vedi anche

- [Gestire le connessioni delle corsie](/it/guides/lane-connections/) —
  i passaggi nell'editor.
- [Formato drawtonomy.svg](/it/reference/drawtonomy-svg/) — come le
  connessioni vengono persistite al salvataggio.
