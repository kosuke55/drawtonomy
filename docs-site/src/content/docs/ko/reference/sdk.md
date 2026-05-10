---
title: '@drawtonomy/sdk 개요'
description: 패키지, 진입점, 그리고 SDK가 에디터와 어떻게 어울리는지에 대한 설명.
---

`@drawtonomy/sdk`는 확장 작성자와 헤드리스 도구가 의존하는 패키지입니다. 다음을 노출합니다.

| 모듈 | 용도 |
|---|---|
| `ExtensionClient` | iframe 호스팅 확장을 위한 postMessage 클라이언트. |
| 도형 팩토리 함수 | `createLane()`, `createVehicle()` 등. |
| `createSnapshot()` | 도형 배열로부터 `DrawtonomySnapshot` 생성. |
| `exporter.*` | 스냅샷을 OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM으로 변환하는 순수 함수들. Lanelet2 파서 포함. |
| 타입 | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot` 등. |

## 설치

```bash
pnpm add @drawtonomy/sdk
```

## 동반 패키지

| 패키지 | 용도 |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK 자체. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | 확장 개발용 에디터를 호스팅하는 로컬 개발 서버. |

## 소스

SDK 소스, 테스트, 예제는 [drawtonomy GitHub 저장소](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk)에 있습니다.

## 함께 보기

- [Extension SDK API](/ko/extend/extension-sdk/) — iframe 확장 만들기.
- [Exporter SDK API](/ko/extend/exporter-sdk/) — 새로운 대상 형식 추가하기.
