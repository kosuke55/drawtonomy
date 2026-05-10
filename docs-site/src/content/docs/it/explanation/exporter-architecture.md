---
title: Architettura dell'esportatore
description: Come una tela diventa uno snapshot, e uno snapshot diventa un file.
---

L'esportatore è il ponte tra i dati interni dell'editor di
drawtonomy e i formati esterni — OpenDRIVE, OpenSCENARIO,
Lanelet2 o qualsiasi cosa tu agganci dopo. Capire la pipeline è
il prerequisito per aggiungere un nuovo formato target.

## La pipeline

```
Stato dell'editor ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                       (serializzabile)      (puro)
```

### 1. `DrawtonomySnapshot`

Uno snapshot è un oggetto semplice: un elenco di forme più una
versione e un timestamp. È serializzabile, non ha riferimenti al
DOM ed è l'unico input che l'esportatore prende.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Costruisci uno snapshot con `createSnapshot(shapes)`, oppure
analizzando un `drawtonomy.svg` salvato con
`parseDrawtonomySvg(svg)`.

### 2. I moduli dell'esportatore

Ogni formato target è una funzione pura separata:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Prendono uno snapshot, restituiscono una stringa o un blob.
Nessun accesso all'editor, nessun DOM, nessuna dipendenza
asincrona. Stesso input, stesso output.

### 3. Round-trip

Per Lanelet2, l'SDK fornisce anche un parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

È ciò che alimenta il flusso di
[importazione Lanelet2](/it/guides/import-lanelet2/).

## Perché funzioni pure

L'esportatore esegue lo stesso percorso di codice nel browser, in
uno script CI Node, in una pipeline lato server o in
un'estensione del browser. I test girano contro fixture di
snapshot senza un browser headless.

Per questo l'esportatore vive in `@drawtonomy/sdk` e non
all'interno dell'editor — l'editor dipende dall'SDK, non
viceversa.

## Aggiungere un formato target

L'esportatore è il principale punto di estensione per nuovi
target — CARLA, Unity, SUMO, DSL personalizzati. La ricetta:

1. Aggiungi un nuovo modulo sotto
   `packages/drawtonomy-sdk/src/exporter/`.
2. Prendi `DrawtonomySnapshot` in input, restituisci una stringa
   o un blob.
3. Aggiungi test sotto
   `packages/drawtonomy-sdk/__tests__/exporter/` usando fixture
   di snapshot.
4. Collega un punto di ingresso UI se vuoi che il menu Export
   dell'editor lo conosca (opzionale — molti utenti lo
   chiameranno programmaticamente).

La guida completa per gli sviluppatori è nel repo pubblico:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Vedi anche

- [Esporta verso OpenDRIVE / OpenSCENARIO / esmini](/it/guides/export-asam/) —
  il flusso utente.
- [Panoramica `@drawtonomy/sdk`](/it/reference/sdk/)
- [API SDK degli esportatori](/it/extend/exporter-sdk/)
