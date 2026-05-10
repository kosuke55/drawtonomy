---
title: Contribuindo com modelos
description: Adicione um novo modelo de veículo, pedestre, placa ou marcação viária.
---

Modelos são arquivos SVG mais uma entrada de manifesto. Uma vez
contribuídos, eles aparecem nos menus de Participantes e formas do
editor ao lado dos modelos integrados.

O fluxo de contribuição está no repositório público:

➡ **[Guia de Modelos](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categorias

| Pasta | Exemplos |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Faixa de pedestres, marcações de seta |
| `templates/sign/` | Pare, dê a preferência, cabeças de sinal |
| `templates/other/` | Qualquer outra coisa |

## Processo

1. Adicione seu SVG na pasta da categoria correta.
2. Registre-o em `templates/manifest.json`.
3. Abra um PR. Inclua uma captura de tela do modelo posicionado na
   tela.

## O que faz um bom modelo

- Desenhado em um tamanho padrão sensato (veículos em torno de
  4–5 m para um sedan).
- Uma única região com cor alterável marcada com um preenchimento
  conhecido, para que o seletor de cor do Painel de Atributos
  possa recolori-la.
- Sem referências externas a fonte — texto é convertido em paths
  se presente.
- Tamanho de arquivo razoável (abaixo de ~30 KB para um modelo do
  tamanho de um veículo).
