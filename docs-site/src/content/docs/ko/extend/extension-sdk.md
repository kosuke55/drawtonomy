---
title: Extension SDK
description: '@drawtonomy/sdk와 @drawtonomy/dev-server로 iframe 확장을 만들어 보세요.'
---

drawtonomy 확장은 `postMessage`로 에디터와 통신하는 iframe 호스팅 웹 앱입니다. SDK가 타입이 있는 클라이언트를 제공하고, dev-server가 개발할 수 있는 로컬 에디터를 제공합니다.

이 페이지는 빠른 안내서입니다. 매니페스트 스키마, capability 목록, 메시지 프로토콜을 포함한 전체 가이드는 공개 저장소에 있습니다.

➡ **[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## 빠른 시작

```bash
# 에디터 :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# 확장 :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## 최소 확장

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## 참고용 확장

트리에 포함된 확장들은 완전한 예제입니다.

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — 자연어 및 OpenSCENARIO 장면 생성.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — 도형 템플릿 미리보기.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — 라이브 캔버스에 대해 내보내기 도구를 시험.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint 실험.

## 함께 보기

- [확장 아키텍처](/ko/explanation/extension-architecture/) — 왜 iframe과 postMessage를 쓰는가.
- [`@drawtonomy/sdk` 개요](/ko/reference/sdk/) — 패키지와 모듈.
