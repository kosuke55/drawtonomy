---
title: Modèle de connexions de voies
description: Comment drawtonomy représente la topologie routière, et ce que cela apporte.
---

Une voie drawtonomy ne possède pas seulement deux bords et une ligne médiane ; elle porte aussi quatre emplacements de connexion — **Suivante**, **Précédente**, **Gauche** et **Droite** — qui la relient à un réseau routier.

## Les quatre emplacements

| Emplacement | Signification |
|---|---|
| **Suivante** | La voie dans laquelle le trafic de cette voie s'écoule. |
| **Précédente** | La voie qui s'écoule dans cette voie. |
| **Gauche** | La voie immédiatement à gauche, partageant un bord. |
| **Droite** | La voie immédiatement à droite, partageant un bord. |

Les connexions sont bidirectionnelles : définir Suivante de la voie A vers B définit aussi Précédente de B vers A. L'éditeur maintient cet invariant pour vous.

## Ce que les connexions permettent

### Édition coordonnée

Lorsque deux voies partagent un bord — parce qu'elles sont voisines Gauche/Droite, ou parce que des voies Suivante/Précédente se rejoignent bout à bout — ce bord est un objet unique. Glissez-y un point et les deux voies se mettent à jour.

La topologie indique déjà ce qui est collé à quoi ; la géométrie n'a donc pas besoin d'être réparée à la main à chaque ajustement de voie.

### Export cohérent

Tant [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) que [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) encodent la connectivité des voies. Les exporteurs de drawtonomy utilisent les emplacements de connexion directement, sans inférence ni heuristiques qui flancheraient sur les cas limites. Une scène qui semble correcte dans l'éditeur s'exporte comme un véritable réseau routier plutôt que comme un sac de polylignes.

### Aller-retour avec les imports

L'importeur Lanelet2 lit le même modèle de connexion depuis les fichiers `.osm`. Vous pouvez éditer une carte Lanelet2 dans drawtonomy et l'exporter sans perdre la topologie.

## Quand les connexions sont inférées

drawtonomy définit les connexions automatiquement quand l'intention est claire :

- Dessiner une voie qui démarre sur l'extrémité d'une voie existante définit **Précédente**.
- Le raccourci voie parallèle (<kbd>Alt</kbd>+clic avec l'outil Voie) définit **Gauche** ou **Droite**.
- Placer un [modèle d'intersection](/fr/guides/participants/) câble chaque voie d'approche.
- Le [Générateur de voies](/fr/guides/lane-from-map/) infère les connexions depuis la topologie OSM lorsque c'est sans ambiguïté.

Pour tout le reste, définissez-les à la main dans le panneau d'attributs — voir [Gérer les connexions de voies](/fr/guides/lane-connections/).

## Ce que les connexions n'encodent pas

- **Le sens de circulation** est implicite par Suivante/Précédente, mais pas encodé séparément. Les routes bidirectionnelles sont modélisées comme deux voies opposées avec leurs propres chaînes Suivante/Précédente.
- **Les restrictions de tournant** aux intersections ne sont pas modélisées dans drawtonomy lui-même. Elles apparaissent dans l'export OpenDRIVE/OpenSCENARIO via le modèle d'intersection qui les a produites.
- **Limitations de vitesse, type de revêtement, éclairage** — aucun de ces éléments. drawtonomy est géométrie plus topologie ; les attributs sémantiques sortent du périmètre.

## Voir aussi

- [Gérer les connexions de voies](/fr/guides/lane-connections/) — les étapes dans l'éditeur.
- [Format drawtonomy.svg](/fr/reference/drawtonomy-svg/) — comment les connexions sont conservées à l'enregistrement.
