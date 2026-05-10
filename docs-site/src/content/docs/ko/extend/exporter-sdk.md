---
title: Exporter SDK
description: 새로운 대상 형식 추가하기 — CARLA, Unity, SUMO 등 무엇이든.
---

내보내기 도구는 `DrawtonomySnapshot`에 대한 순수 함수 모음입니다. 새 대상 형식을 추가하는 일은 자기완결적입니다 — 새 모듈 하나, 테스트 몇 개, 그리고 선택적인 UI 훅.

이 페이지는 빠른 안내서입니다. 아키텍처, API, 테스트 패턴, esmini 시각 검사를 포함한 전체 가이드는 공개 저장소에 있습니다.

➡ **[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.ja.md))

## 빠른 시작

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install
cd packages/drawtonomy-sdk
pnpm exec vitest exporter   # watch 모드
```

## 최소한의 새 내보내기 도구

```ts
// packages/drawtonomy-sdk/src/exporter/my-format.ts
import type { DrawtonomySnapshot } from '../types'

export function exportToMyFormat(snapshot: DrawtonomySnapshot): string {
  // 도형을 순회하며 형식을 생성합니다.
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

## 실제 장면을 픽스처로 사용하기

`drawtonomy.svg` 파일은 SDK를 통해 왕복되므로, 에디터에서 장면을 만들고 그것을 회귀 테스트 입력으로 사용할 수 있습니다.

```ts
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)!
```

## 함께 보기

- [내보내기 도구 아키텍처](/ko/explanation/exporter-architecture/) — 파이프라인과 그것이 순수한 이유.
- [`@drawtonomy/sdk` 개요](/ko/reference/sdk/)
