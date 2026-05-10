---
title: Introdução — quadro branco para cenários de condução
description: O drawtonomy é um quadro branco gratuito, baseado em navegador, para cenários de condução. Esboce faixas, cruzamentos, veículos e pedestres para artigos, slides, discussões de design e criação de cenários. Exporta para OpenDRIVE, OpenSCENARIO e Lanelet2.
sidebar:
  label: Introdução
  order: 1
keywords:
  - quadro branco para cenários de condução
  - ferramenta de diagrama de cenário de condução
  - ferramenta de diagrama para condução autônoma
  - figura de condução autônoma para artigo
  - figura de condução autônoma para apresentação
  - desenhar cenário de veículo autônomo online
  - ferramenta de esboço de cenário de tráfego
  - editor de diagrama de faixas no navegador
  - diagrama de cenário para revisão de design
  - quadro branco para equipes de condução autônoma
  - drawtonomy o que é
---

O drawtonomy é um quadro branco para cenários de condução. O
tipo de figura que você coloca em um artigo, o slide que você
esboça antes de uma revisão de design, o diagrama que você
desenha numa chamada quando está explicando um caso limítrofe
ao resto da equipe, ou a cena que você esboça antes de escrever
o arquivo OpenSCENARIO.

Faixas, cruzamentos, veículos, pedestres, semáforos, marcações
viárias e faixas de pedestres são formas integradas. Faixas têm
consciência de topologia — carregam conexões Próxima / Anterior
/ Esquerda / Direita — então o diagrama é uma rede que você pode
editar, não uma imagem que você redesenha sempre que a geometria
viária muda.

O app está em [drawtonomy.com](https://drawtonomy.com). O SDK,
as extensões e o código-fonte deste site de documentação estão no
[GitHub](https://github.com/kosuke55/drawtonomy).

## Para que as pessoas usam

- **Figuras para artigos, teses e relatórios técnicos.** Saída
  vetorial (`drawtonomy.svg`, PDF, EPS) que se incorpora
  perfeitamente em LaTeX, Markdown e slides.
- **Slides e apresentações.** Diagramas de manobras de mudança
  de faixa, cruzamentos, casos de oclusão e outros cenários de
  condução — desenhados em segundos em vez de minutos por forma.
- **Discussões de design e algoritmo.** Uma superfície de
  esboço compartilhada para discutir comportamento de condução,
  casos extremos e argumentos de segurança com colegas de equipe.
- **Criação de cenários.** Esboce a cena antes de escrever o XML
  do OpenSCENARIO, ou importe um `.xosc` existente e edite-o
  visualmente.
- **Anotação de mapa e ROS.** Trace faixas sobre um fundo de
  satélite, edite mapas OSM do Lanelet2 ou anote uma grade de
  ocupação ROS com trajetórias e obstáculos.

## Para quem isso serve

- **Engenheiros de condução autônoma e ADAS** desenhando
  diagramas para documentação interna, revisões de design e
  relatórios de incidentes.
- **Pesquisadores e estudantes de AV** produzindo figuras para
  artigos, teses e palestras de conferência.
- **Autores de cenários** trabalhando com simuladores como
  [esmini](https://github.com/esmini/esmini), CARLA ou
  ferramentas internas.
- **Usuários de mapa HD e Lanelet2** esboçando mudanças sobre
  uma rede viária existente.
- **Equipes de ROS e robótica** desenhando sobre grades de
  ocupação criadas com nav2, Cartographer ou Gmapping.
- **Instrutores de direção e educadores** produzindo diagramas
  para material didático.
- **Construtores de ferramentas** estendendo o editor com novos
  exportadores, importadores ou recursos assistidos por IA
  através do [SDK de extensões](/pt/extend/).

## Como esta documentação está organizada

O site segue a divisão [Diátaxis](https://diataxis.fr/). Escolha
a seção que combina com o que você está fazendo.

| Seção | Quando ler |
|---|---|
| [Tutoriais](/pt/tutorials/) | Você é novo e quer aprender fazendo. |
| [Guias práticos](/pt/guides/) | Você sabe o que precisa e quer os passos. |
| [Referência](/pt/reference/) | Você precisa consultar um fato exato — um atalho, um formato, uma API. |
| [Explicação](/pt/explanation/) | Você quer entender por que o drawtonomy funciona do jeito que funciona. |
| [Estendendo o drawtonomy](/pt/extend/) | Você está construindo em cima do drawtonomy. |

Se você não sabe por onde começar, o
[Início rápido](/pt/start/quickstart/) leva cinco minutos da tela
em branco a uma cena exportada.
