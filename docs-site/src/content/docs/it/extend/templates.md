---
title: Contribuire con template
description: Aggiungi un nuovo template di veicolo, pedone, segnale o segnaletica orizzontale.
---

I template sono file SVG più una voce nel manifest. Una volta
contribuiti, appaiono nei menu Participants e delle forme
dell'editor accanto ai template integrati.

Il flusso di contribuzione è nel repo pubblico:

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categorie

| Cartella | Esempi |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, frecce di segnaletica |
| `templates/sign/` | Stop, dare la precedenza, lanterne semaforiche |
| `templates/other/` | Tutto il resto |

## Procedura

1. Aggiungi il tuo SVG nella cartella di categoria corretta.
2. Registralo in `templates/manifest.json`.
3. Apri una PR. Includi uno screenshot del template posizionato
   sulla tela.

## Cosa rende un buon template

- Disegnato a una dimensione predefinita sensata (veicoli intorno
  a 4–5 m per una berlina).
- Una singola regione con colore modificabile contrassegnata con
  un fill noto, in modo che il selettore di colore del pannello
  degli attributi possa ricolorarla.
- Nessun riferimento a font esterni — il testo viene convertito
  in path se presente.
- Dimensione di file ragionevole (sotto i ~30 KB per un template
  di dimensioni veicolo).
