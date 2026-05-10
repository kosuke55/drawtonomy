---
title: Importar um OccupancyGrid do ROS (.pgm + .yaml)
description: Carregue uma grade de ocupação do map_server do ROS (.pgm + .yaml) — criada com nav2, Cartographer ou Gmapping — no drawtonomy como uma camada de fundo, depois esboce trajetórias, faixas e obstáculos em cima.
keywords:
  - anotação de grade de ocupação ROS
  - editor de mapa nav2
  - visualizador de mapa cartographer
  - desenhar em mapa pgm
  - ferramenta de anotação de mapa SLAM
  - importar pgm yaml ROS
---

O drawtonomy entende o formato `map_server` do ROS usado pelo
[nav2](https://navigation.ros.org/), Cartographer, Gmapping e
ferramentas SLAM similares.

![Uma grade de ocupação ROS importada no drawtonomy com setas e prateleiras desenhadas em cima](/img/ros-occupancy-grid.png)

A captura de tela mostra uma grade de ocupação real de armazém
(células ocupadas pretas, células livres brancas) com trajetórias e
obstáculos desenhados diretamente sobre ela dentro do drawtonomy.

## Importar

1. Abra o menu **Arquivo** → **Importar**.
2. Selecione **ambos** os arquivos `.pgm` e `.yaml` correspondentes
   juntos no diálogo de arquivo.
3. O drawtonomy lê os metadados do YAML (resolução, limites) e
   renderiza a grade na tela.

Se você selecionar apenas o `.pgm` e nenhum `.yaml`, o drawtonomy usa
padrões (`resolution = 0.05 m/px`, limites de ocupação padrão).

## Coloração das células

| Célula | Cor |
|---|---|
| Ocupada | Preto |
| Livre | Branco |
| Desconhecida | Cinza |

As células são renderizadas em uma escala que combina com as
dimensões de faixa do drawtonomy, então você pode desenhar faixas,
trajetórias e formas diretamente em cima — exatamente como na
captura de tela acima.

## Ferramentas testadas

O drawtonomy foi usado com mapas do nav2, Cartographer e Gmapping.
Outros produtores devem funcionar desde que emitam o par padrão
`.pgm` + `.yaml` do `map_server`.

## Veja também

- [Importar um arquivo Lanelet2 (.osm)](/pt/guides/import-lanelet2/)
