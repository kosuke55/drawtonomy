---
title: Architecture des extensions
description: Comment drawtonomy charge, isole et communique avec les extensions tierces.
---

Les extensions drawtonomy ne sont pas des plugins compilés dans l'éditeur. Ce sont des applications web distinctes chargées dans une iframe, qui communiquent avec l'hôte via `postMessage`. Cette page explique pourquoi, et ce qui en découle.

## Chargement

Une extension est une URL pointant vers un `manifest.json`. L'utilisateur (ou un lien profond) ouvre l'éditeur avec `?ext=<manifestUrl>` :

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

L'éditeur récupère le manifeste, crée une iframe et charge le HTML d'entrée de l'extension. Plusieurs extensions peuvent être chargées en même temps avec des paramètres `?ext=` répétés.

## Isolation

Les extensions s'exécutent dans une iframe avec leur propre origine. Elles ne peuvent pas :

- Toucher directement le DOM de l'éditeur.
- Lire le localStorage de drawtonomy.
- Charger des ressources au-delà du CSP de l'hôte.

Elles peuvent faire ce qu'elles demandent dans le tableau `capabilities` du manifeste (`shapes:read`, `shapes:write`, `ui:panel`, …) et ce que `postMessage` expose via `ExtensionClient` de `@drawtonomy/sdk`.

C'est intentionnel. Les extensions sont du code tiers ; l'éditeur les traite comme non fiables.

## Communication

Le SDK enveloppe `postMessage` dans un `ExtensionClient` qui fournit une API typée et basée sur des promesses :

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

En interne :

- L'extension poste une requête vers l'iframe hôte.
- L'hôte valide par rapport aux capacités de l'extension.
- L'hôte répond, ou la requête est rejetée.

## Pourquoi des iframes

Les alternatives — plugins de style npm, fédération de modules Webpack, scripts en processus — exigent toutes de faire confiance au code de l'extension avec votre éditeur. Elles couplent aussi le cycle de vie des extensions au build de l'éditeur.

Les iframes apportent :

- **Isolation par origine**, imposée par le navigateur — pas de bac à sable JS à maintenir.
- **Cycles de déploiement indépendants** — les extensions sortent à leur propre rythme.
- **N'importe quel framework** — React, Vue, Svelte, JS pur ; l'hôte s'en moque.
- **Même code en dev et en prod** — le serveur de dev héberge l'éditeur sur `localhost:3000` ; vous le pointez vers votre extension sur `localhost:3001`. Même paramètre `?ext=`, même protocole.

Le compromis est que `postMessage` est asynchrone. Les appels qui semblent gratuits (`getShapes()`) coûtent un aller-retour iframe. Le SDK regroupe et met en cache quand il le peut ; ne placez pas un appel dans une boucle serrée.

## Développement local

Le paquet `@drawtonomy/dev-server` sert l'éditeur en local pour que vous puissiez développer face à lui sans aller-retour réseau :

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # éditeur sur :3000
cd my-extension && pnpm dev --port 3001        # extension sur :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Le guide complet est dans le dépôt public : [Guide de développement d'extensions](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Voir aussi

- [API du SDK d'extension](/fr/extend/extension-sdk/)
- [Vue d'ensemble de `@drawtonomy/sdk`](/fr/reference/sdk/)
