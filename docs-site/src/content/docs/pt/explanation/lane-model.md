---
title: Modelo de conexão de faixas
description: Como o drawtonomy representa a topologia viária e o que isso traz para você.
---

Uma Faixa do drawtonomy tem mais do que duas bordas e uma linha
central; ela também carrega quatro slots de conexão — **Próxima**,
**Anterior**, **Esquerda** e **Direita** — que a ligam a uma rede
viária.

## Os quatro slots

| Slot | Significado |
|---|---|
| **Próxima** | A faixa para a qual o tráfego nesta faixa flui. |
| **Anterior** | A faixa que flui para esta faixa. |
| **Esquerda** | A faixa imediatamente à esquerda, compartilhando uma borda. |
| **Direita** | A faixa imediatamente à direita, compartilhando uma borda. |

As conexões são bidirecionais: definir a Próxima da Faixa A para B
também define a Anterior de B para A. O editor mantém esse invariante
para você.

## O que as conexões permitem

### Edição coordenada

Quando duas faixas compartilham uma borda — porque são vizinhas
Esquerda/Direita, ou porque faixas Próxima/Anterior se encontram
ponta a ponta — essa borda é um único objeto. Arraste um ponto nela
e ambas as faixas atualizam.

A topologia já diz o que está colado a quê, então a geometria não
precisa ser reparada à mão sempre que você ajusta uma faixa.

### Exportação coerente

Tanto [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
quanto
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
codificam conectividade de faixa. Os exportadores do drawtonomy
usam os slots de conexão diretamente, sem inferência ou
heurísticas que falhariam em casos extremos. Uma cena que parece
correta no editor exporta como uma rede viária real em vez de um
saco de polilinhas.

### Round-trip com importações

O importador do Lanelet2 lê o mesmo modelo de conexão de arquivos
`.osm`. Você pode editar um mapa Lanelet2 no drawtonomy e exportá-lo
de volta sem perder a topologia.

## Quando as conexões são inferidas

O drawtonomy define conexões automaticamente quando a intenção é
clara:

- Desenhar uma faixa que começa no ponto final de uma faixa
  existente define **Anterior**.
- O atalho de faixa paralela (<kbd>Alt</kbd>+clique com a
  ferramenta Faixa) define **Esquerda** ou **Direita**.
- Posicionar um [modelo de cruzamento](/pt/guides/participants/)
  conecta cada faixa de aproximação.
- O [Gerador de Faixas](/pt/guides/lane-from-map/) infere conexões da
  topologia do OSM onde isso é inequívoco.

Para todo o resto, defina-as à mão no Painel de Atributos — veja
[Gerenciar conexões de faixa](/pt/guides/lane-connections/).

## O que as conexões não codificam

- **Direção de viagem** está implícita pela Próxima/Anterior, mas
  não codificada separadamente. Estradas bidirecionais são
  modeladas como duas faixas opostas com suas próprias cadeias
  Próxima/Anterior.
- **Restrições de conversão** em cruzamentos não são modeladas no
  drawtonomy em si. Elas aparecem na exportação OpenDRIVE/OpenSCENARIO
  através do modelo de cruzamento que as produziu.
- **Limites de velocidade, tipo de superfície, iluminação** —
  nenhum destes. O drawtonomy é geometria mais topologia;
  atributos semânticos estão fora do escopo.

## Veja também

- [Gerenciar conexões de faixa](/pt/guides/lane-connections/) — os
  passos no editor.
- [Formato drawtonomy.svg](/pt/reference/drawtonomy-svg/) — como as
  conexões são persistidas ao salvar.
