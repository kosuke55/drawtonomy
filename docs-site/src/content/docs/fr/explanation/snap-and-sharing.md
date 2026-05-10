---
title: Accrochage et partage de points
description: Deux mécanismes liés mais différents pour garder les formes alignées.
---

L'accrochage et le partage de points traitent tous deux du fait que « ce point va sur cette chose ». Ils se ressemblent dans l'interface, mais leurs conséquences diffèrent. Les confondre est la cause la plus fréquente du bogue « pourquoi mes formes ont-elles dérivé ? ».

## Accrochage = même coordonnée

L'accrochage déplace votre curseur (ou un sommet en cours de glissement) pour qu'il atterrisse sur une cible existante. Le résultat est constitué de deux points distincts qui *se trouvent* partager des coordonnées.

Déplacez la cible d'origine plus tard et votre point accroché ne suit pas. Ils n'ont jamais été liés.

C'est ce que vous voulez quand vous esquissez : alignement précis, sans couplage caché.

## Partage = même identité

Un point partagé est un seul objet référencé par plusieurs formes. Déplacez-le une fois et toutes les formes qui détiennent la référence se déplacent avec lui.

Vous créez des points partagés en maintenant <kbd>Alt</kbd> pendant le clic, ou en glissant un sommet sur un sommet existant en mode édition de segments.

C'est ce que vous voulez pour les bords qui ne doivent jamais se séparer — deux bords de voies adjacentes, deux coins de polygones qui doivent rester soudés, l'extrémité d'une trajectoire et le début d'une autre.

## Pourquoi distinguer

Si deux bords de formes qui devraient être identiques sont en réalité deux points accrochés, glissez l'un d'eux, exportez vers OpenDRIVE et le réseau routier s'ouvre à ce sommet. Le simulateur peut interpréter l'écart comme une discontinuité, ou le lisser selon l'outil.

Les voisines Gauche/Droite d'une voie qui partagent un bord utilisent toujours des points partagés en interne — ce n'est ni optionnel ni contrôlé par l'utilisateur. Pour les formes arbitraires (Linestring, Polygone, Trajectoire), le choix vous revient.

## Indices visuels

- Une cible d'accrochage affiche une seule poignée en surbrillance et tire le curseur.
- Un point partagé s'affiche comme une poignée double en mode édition de segments.

## Voir aussi

- [Accrochage à la géométrie existante](/fr/guides/snap/)
- [Partager des points entre formes](/fr/guides/point-sharing/)
