---
title: Por que o drawtonomy — um quadro branco feito para cenários de condução
description: Por que o drawtonomy existe e as escolhas de design por trás dele. Construído especificamente para cenários de condução — as figuras que vão em artigos de condução autônoma, slides, revisões de design e criação de cenários.
keywords:
  - por que drawtonomy
  - quadro branco para cenários de condução
  - ferramenta de diagrama de condução autônoma
  - ferramenta de figura para artigos de pesquisa AV
  - software de ilustração de condução autônoma
  - alternativa a ferramentas de slides para diagramas viários
  - quadro branco para equipes de condução autônoma
---

O drawtonomy é um quadro branco feito especificamente para cenários
de condução. A maioria das equipes esboça esses diagramas hoje em
ferramentas de desenho genéricas ou slides — funcionam bem para
formas gerais, mas não sabem o que é uma faixa, então a geometria
tem que ser redesenhada sempre que a estrada faz uma curva, o
cruzamento ganha um braço ou uma faixa de pedestres precisa se
alinhar com a estrada.

Esta página explica as escolhas de design que decorrem de liderar
com "quadro branco para cenários de condução" em vez de "ferramenta
que exporta para um simulador".

## O problema em torno do qual foi construído

A maioria da comunicação real sobre condução autônoma acontece
através de diagramas: em artigos, revisões de design, reuniões de
planejamento, relatórios de incidentes, salas de aula e slides. O
diagrama é o artefato que as pessoas olham, discutem e lembram.

Ferramentas de desenho genéricas nesse nível só dão formas
genéricas. Uma faixa é um retângulo que você redesenha sempre que a
estrada faz uma curva; uma faixa de pedestres é uma pilha de
retângulos que você fica alinhando à mão; um cruzamento é meia hora
de ajustes. Pior, no momento em que a geometria viária muda — e em
trabalho de AV ela muda constantemente — você começa de novo.

O drawtonomy existe para tornar esse loop rápido. Os blocos de
construção que o domínio realmente tem — faixas, cruzamentos,
faixas de pedestres, semáforos, marcações viárias, veículos,
pedestres — são formas de primeira classe, então a figura permanece
correta enquanto você itera.

## Onde o drawtonomy se encaixa

O trabalho com cenários de condução acontece em alguns níveis
diferentes:

1. **Diagramas.** Artigos, slides, esboços de quadro branco,
   figuras de documentos de design, material didático. Rápido e
   fácil em princípio, mas em uma ferramenta genérica a geometria
   viária tem que ser reconstruída sempre que algo se move.
2. **Ferramentas de criação.** Editores OpenSCENARIO, editores de
   rede viária, pacotes estilo CAD. Precisos, lentos, caros para
   aprender.
3. **Simuladores.** esmini, CARLA, ferramentas internas. Executam
   o cenário, produzem dados.

O drawtonomy vive no nível 1, e cruza para o nível 2 quando você
precisa: importar um mapa Lanelet2, esboçar mudanças, exportar
OpenDRIVE/OpenSCENARIO, entregar o resultado ao esmini.

## Prioridades de design

### Quadro branco em primeiro lugar

O ponto de comparação é um esboço rápido de quadro branco ou
slides, não uma ferramenta CAD. Isso define a barra de fricção:
abra uma URL, desenhe, compartilhe. Sem instalação, sem conta, sem
formato de arquivo de projeto. Qualquer coisa que faria o
drawtonomy parecer mais pesado do que um esboço rápido é cortada.

### Consciente da topologia

Uma estrada não é um saco de polilinhas. O drawtonomy modela as
conexões de faixa (Próxima / Anterior / Esquerda / Direita) para
que mover uma borda atualize as faixas vizinhas automaticamente.
Duas faixas que compartilham uma borda compartilham os mesmos
pontos de borda — arraste uma vez, ambas se movem. Veja
[Modelo de conexão de faixas](/pt/explanation/lane-model/).

### Modelos do domínio de condução

Veículos (sedan, bus, truck, motorcycle…), pedestres (walking,
simple), semáforos para veículos e pedestres, faixas de pedestres,
marcações viárias, placas, modelos de cruzamento. São formas
integradas em vez de aproximações com retângulos genéricos. Modelos
SVG personalizados podem ser adicionados por PR.

### Editável tanto na saída quanto na entrada

Cada formato de saída que o drawtonomy produz preserva estado
suficiente para ser reeditado. `drawtonomy.svg` é a forma canônica
sem perdas: um SVG comum que tem pré-visualização em todos os
lugares (navegadores, GitHub, slides, figuras de artigo) e reabre
no drawtonomy com cada conexão e relação de sobreposição intacta.
Nada fica preso em um formato que você não pode ler de volta.

### Headless quando necessário

O código do exportador e do parser faz parte do `@drawtonomy/sdk`
e roda sem o editor. Pipelines de CI, extensões de navegador e
ferramentas de IA podem gerar e validar cenas programaticamente.

## Pontes para o resto do fluxo de trabalho

Uma vez que você tem um diagrama, geralmente quer fazer algo com
ele. O drawtonomy traz várias pontes para que a figura não fique
trancada dentro do editor:

- **`drawtonomy.svg`** — o padrão. Incorpore em artigos, slides,
  documentos Markdown; reabra depois para continuar editando.
- **Round-trip Lanelet2** — abra um mapa OSM Lanelet2 (incluindo
  mapas de exemplo do Autoware), edite, exporte de volta. Útil
  para esboçar mudanças sobre um mapa HD existente.
- **Exportação ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3,
  opcionalmente empacotados como um zip pronto para
  [esmini](https://github.com/esmini/esmini).
- **AI Scene Generator** — descreva um cenário em linguagem
  natural ou cole XML do OpenSCENARIO, e ganhe uma tela editável
  para começar a refinar.

Essas pontes são úteis, mas o diagrama em si é a razão pela qual o
drawtonomy existe. Uma figura no drawtonomy já é valiosa como
figura; esses formatos permitem que ela flua para o próximo
estágio do fluxo de trabalho quando necessário.

## O que o drawtonomy não é

- **Não é um simulador.** Ele não executa cenários. Exporte para
  esmini, CARLA ou sua própria ferramenta para isso.
- **Não é uma ferramenta CAD.** Ele não impõe precisão de
  engenharia (splines clotoides, inclinação, elevação). A
  geometria é 2D direta.
- **Não é uma suíte de colaboração em tempo real.** É um editor de
  usuário único. Salve, compartilhe, reabra.

## Veja também

- [Modelo de conexão de faixas](/pt/explanation/lane-model/)
- [Arquitetura do exportador](/pt/explanation/exporter-architecture/)
- [Arquitetura de extensões](/pt/explanation/extension-architecture/)
