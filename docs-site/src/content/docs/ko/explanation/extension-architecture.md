---
title: 확장 아키텍처
description: drawtonomy가 서드파티 확장을 어떻게 로드하고, 격리하고, 통신하는지.
---

drawtonomy 확장은 에디터에 컴파일되어 들어가는 플러그인이 아닙니다. iframe에 로드되는 별도의 웹 앱이며, 호스트와 `postMessage`로 통신합니다. 이 페이지는 그 이유와 그 선택에서 따라오는 결과를 설명합니다.

## 로딩

확장은 `manifest.json`을 가리키는 URL입니다. 사용자(또는 딥 링크)가 `?ext=<manifestUrl>`로 에디터를 엽니다.

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

에디터가 매니페스트를 가져와 iframe을 만들고 확장의 진입 HTML을 로드합니다. 여러 확장을 동시에 로드할 수도 있습니다 — `?ext=` 파라미터를 반복하면 됩니다.

## 격리

확장은 자신만의 origin을 가진 iframe 안에서 실행됩니다. 다음을 할 수 없습니다.

- 에디터의 DOM에 직접 접근.
- drawtonomy의 localStorage 읽기.
- 호스트의 CSP를 넘어 리소스를 로드.

매니페스트의 `capabilities` 배열에 명시한 권한(`shapes:read`, `shapes:write`, `ui:panel`, …)과 `@drawtonomy/sdk`의 `ExtensionClient`가 `postMessage`로 노출하는 기능만 사용할 수 있습니다.

이는 의도된 설계입니다. 확장은 서드파티 코드이며, 에디터는 이를 신뢰할 수 없는 코드로 다룹니다.

## 통신

SDK는 `postMessage`를 `ExtensionClient`로 감싸 타입이 있는 Promise 기반 API를 제공합니다.

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

내부 동작:

- 확장이 호스트 iframe에 요청을 게시합니다.
- 호스트가 확장의 capability를 검증합니다.
- 호스트가 응답하거나 요청이 거부됩니다.

## 왜 iframe인가

대안 — npm 스타일 플러그인, Webpack 모듈 페더레이션, 인프로세스 스크립트 — 은 모두 확장 코드를 에디터의 권한으로 신뢰해야 합니다. 또한 확장의 수명을 에디터 빌드와 결합시킵니다.

iframe은 다음을 제공합니다.

- **Origin 격리** — 브라우저가 강제하므로 별도의 JS 샌드박스를 유지할 필요가 없습니다.
- **독립적인 배포 주기** — 확장이 자신의 페이스로 출시할 수 있습니다.
- **어떤 프레임워크든 가능** — React, Vue, Svelte, vanilla JS — 호스트는 신경쓰지 않습니다.
- **개발과 프로덕션에서 같은 코드** — 개발 서버가 에디터를 `localhost:3000`에 호스팅하고, 확장을 `localhost:3001`에 두면 같은 `?ext=` 플래그, 같은 프로토콜로 동작합니다.

트레이드오프는 `postMessage`가 비동기라는 점입니다. 무료처럼 보이는 호출(`getShapes()`)도 iframe 왕복 비용이 듭니다. SDK가 가능한 한 배치하고 캐시하지만, 타이트 루프 안에서는 호출하지 마세요.

## 로컬 개발

`@drawtonomy/dev-server` 패키지는 네트워크 왕복 없이 개발할 수 있도록 에디터를 로컬에서 호스팅합니다.

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # 에디터 :3000
cd my-extension && pnpm dev --port 3001        # 확장 :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

전체 가이드는 공개 저장소에 있습니다: [Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## 함께 보기

- [Extension SDK API](/ko/extend/extension-sdk/)
- [`@drawtonomy/sdk` 개요](/ko/reference/sdk/)
