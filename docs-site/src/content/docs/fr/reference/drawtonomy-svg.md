---
title: Format drawtonomy.svg
description: La structure sur disque d'un fichier drawtonomy ré-éditable.
---

Un fichier `drawtonomy.svg` est un SVG standard enrichi de métadonnées qui consignent l'état réservé à l'éditeur.

## Structure

- Le contenu visuel (chemins, texte, images) est du SVG ordinaire. Toute visionneuse SVG l'affiche correctement.
- Un bloc `<metadata>` en haut du document contient les données spécifiques à drawtonomy :
  - IDs des formes et propriétés par forme (modèle, style, etc.)
  - Emplacements de connexion de voies (`next`, `previous`, `left`, `right`)
  - Références de points partagés
  - Appartenance à un groupe d'empreintes
  - Ordre de superposition (z-order)

## Compatibilité

Modifier un `drawtonomy.svg` dans un éditeur SVG générique (Illustrator, Inkscape, le navigateur) supprime le bloc de métadonnées à l'enregistrement, sauf si vous le préservez explicitement. drawtonomy peut toujours ouvrir le résultat, mais les connexions et points partagés seront absents.

Pour des éditions aller-retour en dehors de drawtonomy, utilisez le SDK ([`@drawtonomy/sdk`](/fr/reference/sdk/)) — il peut lire et écrire le format sans passer par l'éditeur.

## Versionnage

Les anciens fichiers sont migrés automatiquement à l'import. L'utilitaire `resolveColorKey()` du SDK convertit les anciennes clés de couleur (par exemple `grey-700` v1.x) vers les actuelles.

## Voir aussi

- [Exporter votre scène](/fr/guides/export/)
- [Vue d'ensemble de `@drawtonomy/sdk`](/fr/reference/sdk/)
