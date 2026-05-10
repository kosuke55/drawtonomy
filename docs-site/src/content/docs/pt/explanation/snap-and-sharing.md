---
title: Snap & compartilhamento de pontos
description: Dois mecanismos relacionados mas diferentes para manter formas alinhadas.
---

Snap e compartilhamento de pontos lidam ambos com "esse ponto vai
naquela coisa". Eles parecem similares na UI, mas têm consequências
diferentes. Confundi-los é a fonte mais comum de bugs do tipo
"por que minhas formas se desalinharam?".

## Snap = mesma coordenada

O snap move seu cursor (ou um vértice que você está arrastando)
para cair sobre um alvo existente. O resultado são dois pontos
distintos que *acontecem* de compartilhar coordenadas.

Mova o alvo original mais tarde e seu ponto com snap não
acompanha. Eles nunca foram ligados.

Isto é o que você quer quando está esboçando: alinhamento preciso,
sem acoplamento oculto.

## Compartilhamento = mesma identidade

Um ponto compartilhado é um objeto referenciado por várias formas.
Mova-o uma vez, e cada forma que detém a referência se move com ele.

Você cria pontos compartilhados segurando <kbd>Alt</kbd> ao clicar,
ou arrastando um vértice sobre um existente no modo de edição de
segmento.

Isto é o que você quer para bordas que nunca devem se separar —
duas arestas adjacentes de faixa, dois cantos de polígono que
precisam ficar soldados, o final de uma trajetória e o início de outra.

## Por que distinguir

Se duas arestas de forma que deveriam ser as mesmas são na verdade
dois pontos com snap, arraste um deles, exporte para OpenDRIVE, e
a rede viária se abre nesse vértice. O simulador pode interpretar
o gap como uma descontinuidade, ou borrá-la dependendo da
ferramenta.

Vizinhas Esquerda/Direita de Faixa que compartilham uma borda
sempre usam pontos compartilhados internamente — isso não é
opcional e não é controlado pelo usuário. Para formas arbitrárias
(Linestring, Polígono, Trajetória), a escolha é sua.

## Indicações visuais

- Um alvo de snap mostra uma única alça destacada e puxa o cursor.
- Um ponto compartilhado aparece como uma alça dupla no modo de
  edição de segmento.

## Veja também

- [Snap em geometria existente](/pt/guides/snap/)
- [Compartilhar pontos entre formas](/pt/guides/point-sharing/)
