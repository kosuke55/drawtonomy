---
title: Introduction — tableau blanc pour scénarios de conduite
description: drawtonomy est un tableau blanc gratuit en ligne dans le navigateur pour les scénarios de conduite. Esquissez voies, intersections, véhicules et piétons pour vos articles, présentations, revues de conception et rédaction de scénarios. Exporte vers OpenDRIVE, OpenSCENARIO et Lanelet2.
sidebar:
  label: Introduction
  order: 1
keywords:
  - tableau blanc conduite autonome
  - diagramme scénario de conduite
  - outil diagramme conduite autonome
  - figure conduite autonome pour article
  - figure conduite autonome présentation
  - dessiner scénario conduite autonome en ligne
  - outil esquisse trafic
  - éditeur de voies navigateur
  - schéma scénario revue de conception
  - tableau blanc équipes conduite autonome
  - drawtonomy qu'est-ce que c'est
  - simulation véhicule autonome figure
---

drawtonomy est un tableau blanc pour scénarios de conduite. Le type de figure que vous mettez dans un article, le slide que vous esquissez avant une revue de conception, le diagramme que vous tracez en visio quand vous expliquez un cas limite à votre équipe, ou la scène que vous esquissez avant d'écrire le fichier OpenSCENARIO.

Voies, intersections, véhicules, piétons, feux tricolores, marquages au sol et passages piétons sont des formes intégrées. Les voies sont conscientes de la topologie — elles portent des connexions Suivante / Précédente / Gauche / Droite — de sorte que le diagramme est un réseau modifiable, et non une image qu'il faut redessiner à chaque changement de géométrie.

L'application est sur [drawtonomy.com](https://drawtonomy.com). Le SDK, les extensions et le code source de ce site de documentation sont sur [GitHub](https://github.com/kosuke55/drawtonomy).

## Cas d'usage

- **Figures pour articles, thèses et rapports techniques.** Sortie vectorielle (`drawtonomy.svg`, PDF, EPS) qui s'intègre proprement dans LaTeX, Markdown et présentations.
- **Slides et présentations.** Diagrammes de manœuvres de changement de voie, intersections, cas d'occlusion et autres scénarios de conduite — dessinés en quelques secondes plutôt que plusieurs minutes par forme.
- **Discussions de conception et d'algorithmes.** Une surface d'esquisse partagée pour parler du comportement de conduite, des cas limites et des arguments de sécurité avec ses collègues.
- **Rédaction de scénarios.** Esquissez la scène avant d'écrire le XML OpenSCENARIO, ou importez un `.xosc` existant et éditez-le visuellement.
- **Annotation de cartes et ROS.** Tracez les voies sur un fond satellite, éditez des cartes Lanelet2 OSM ou annotez une grille d'occupation ROS avec trajectoires et obstacles.

## Pour qui

- **Ingénieurs en conduite autonome et ADAS** dessinant des diagrammes pour la documentation interne, les revues de conception et les comptes rendus d'incident.
- **Chercheurs et étudiants en VA** produisant des figures pour articles, thèses et exposés en conférence.
- **Auteurs de scénarios** travaillant avec des simulateurs comme [esmini](https://github.com/esmini/esmini), CARLA ou des outils maison.
- **Utilisateurs de cartes HD et Lanelet2** esquissant des modifications sur un réseau routier existant.
- **Équipes ROS et robotique** dessinant par-dessus des grilles d'occupation produites avec nav2, Cartographer ou Gmapping.
- **Formateurs et enseignants en conduite** produisant des diagrammes pour du matériel pédagogique.
- **Constructeurs d'outils** étendant l'éditeur avec de nouveaux exporteurs, importeurs ou fonctionnalités assistées par IA via le [SDK d'extension](/fr/extend/).

## Comment cette documentation est organisée

Le site suit la classification [Diátaxis](https://diataxis.fr/). Choisissez la section qui correspond à ce que vous faites.

| Section | Quand la lire |
|---|---|
| [Tutoriels](/fr/tutorials/) | Vous débutez et voulez apprendre par la pratique. |
| [Guides pratiques](/fr/guides/) | Vous savez ce que vous voulez accomplir et il vous faut les étapes. |
| [Référence](/fr/reference/) | Vous avez besoin de consulter un fait précis — un raccourci, un format, une API. |
| [Explication](/fr/explanation/) | Vous voulez comprendre pourquoi drawtonomy fonctionne ainsi. |
| [Étendre drawtonomy](/fr/extend/) | Vous construisez par-dessus drawtonomy. |

Si vous ne savez pas par où commencer, le [Démarrage rapide](/fr/start/quickstart/) vous fait passer en cinq minutes du canevas vide à une scène exportée.
