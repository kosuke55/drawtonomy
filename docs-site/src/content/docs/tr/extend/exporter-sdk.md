---
title: Dışa Aktarıcı SDK'sı
description: Yeni bir hedef format ekleyin — CARLA, Unity, SUMO veya başka bir şey.
keywords:
  - drawtonomy dışa aktarıcı sdk
  - özel dışa aktarıcı
  - CARLA dışa aktarma
  - Unity sürüş senaryosu
  - SUMO dışa aktarma
---

Dışa aktarıcı, `DrawtonomySnapshot` üzerinde bir saf fonksiyon
kümesidir. Yeni bir hedef format eklemek bağımsızdır: yeni bir
modül, birkaç test ve isteğe bağlı bir UI kancası.

Bu sayfa hızlı bir yönlendirmedir. Tam kılavuz — mimari, API, test
kalıpları, esmini görsel kontrolleri — genel depodadır:

➡ **[Dışa Aktarıcı Geliştirici Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## Hızlı başlangıç

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # izleme modu
```

## Minimal yeni dışa aktarıcı

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // Şekiller arasında dolaşın, formatınızı yayın.
  return ''
}
```

```ts
// packages/drawtonomy-sdk/__tests__/exporter/my-format.test.ts
import { describe, it, expect } from 'vitest'
import { exportToMyFormat } from '../../src/exporter/my-format'
import { createSnapshot, createLane } from '../../src/index'

describe('my-format exporter', () => {
  it('emits expected payload for a single lane', () => {
    const snapshot = createSnapshot([createLane(/* ... */)])
    expect(exportToMyFormat(snapshot)).toContain('<expected/>')
  })
})
```

## Bir fikstür olarak gerçek bir sahne kullanma

`drawtonomy.svg` dosyaları SDK aracılığıyla çift yönlü dönüşümlüdür,
böylece düzenleyicide bir sahne yazabilir ve bunu bir gerileme testi
girdisi olarak kullanabilirsiniz:

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## Ayrıca bakın

- [Dışa aktarıcı mimarisi](/tr/explanation/exporter-architecture/) —
  işlem hattı ve neden saf olduğu.
- [`@drawtonomy/sdk` genel bakışı](/tr/reference/sdk/)
