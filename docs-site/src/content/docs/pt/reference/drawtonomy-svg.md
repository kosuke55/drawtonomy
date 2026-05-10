---
title: Formato drawtonomy.svg
description: A estrutura em disco de um arquivo drawtonomy reeditável.
---

Um arquivo `drawtonomy.svg` é um SVG comum aumentado com metadados
que registram o estado específico do editor.

## Estrutura

- O conteúdo visual (paths, texto, imagens) é SVG simples. Qualquer
  visualizador SVG o renderiza corretamente.
- Um bloco `<metadata>` no topo do documento contém os dados
  específicos do drawtonomy:
  - IDs das formas e propriedades por forma (modelo, estilo, etc.)
  - slots de conexão de faixa (`next`, `previous`, `left`, `right`)
  - referências de ponto compartilhado
  - associação de grupo de pegada
  - ordem z

## Compatibilidade

Editar um `drawtonomy.svg` em um editor SVG genérico (Illustrator,
Inkscape, navegador) descarta o bloco de metadados ao salvar a
menos que você o preserve explicitamente. O drawtonomy ainda
consegue abrir o resultado, mas as conexões e pontos compartilhados
estarão faltando.

Para edições com round-trip fora do drawtonomy, use o SDK
([`@drawtonomy/sdk`](/pt/reference/sdk/)) — ele pode ler e escrever o
formato sem passar pelo editor.

## Versionamento

Arquivos antigos são migrados automaticamente na importação. O
helper `resolveColorKey()` no SDK converte chaves de cor legadas
(por exemplo, `grey-700` v1.x) para as atuais.

## Veja também

- [Exportar sua cena](/pt/guides/export/)
- [Visão geral do `@drawtonomy/sdk`](/pt/reference/sdk/)
