---
title: 내보내기 도구 아키텍처
description: 캔버스가 어떻게 스냅샷이 되고, 스냅샷이 어떻게 파일이 되는가.
---

내보내기 도구는 drawtonomy 에디터 내부 데이터와 외부 형식 — OpenDRIVE, OpenSCENARIO, Lanelet2, 또는 그 다음 연결할 무엇이든 — 사이의 다리입니다. 새로운 대상 형식을 추가하기 전에 이 파이프라인을 이해하는 것이 선결 조건입니다.

## 파이프라인

```
에디터 상태 ──► DrawtonomySnapshot ──► Exporter ──► 파일 / blob
                  (직렬화 가능)        (순수)
```

### 1. `DrawtonomySnapshot`

스냅샷은 일반 객체입니다: 도형 목록과 버전 스탬프, 타임스탬프. 직렬화 가능하며 DOM 참조를 가지지 않고, 내보내기 도구가 받는 유일한 입력입니다.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

`createSnapshot(shapes)`로 스냅샷을 만들거나, 저장된 `drawtonomy.svg`를 `parseDrawtonomySvg(svg)`로 파싱해 만들 수 있습니다.

### 2. 내보내기 모듈

각 대상 형식은 별도의 순수 함수입니다.

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

스냅샷을 받아 문자열이나 blob을 반환합니다. 에디터 접근, DOM, 비동기 의존성이 없습니다. 같은 입력 → 같은 출력.

### 3. 왕복 변환

Lanelet2의 경우 SDK는 파서도 함께 제공합니다.

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

이것이 [Lanelet2 가져오기](/ko/guides/import-lanelet2/) 흐름의 동력원입니다.

## 왜 순수 함수인가

내보내기 도구는 브라우저, Node CI 스크립트, 서버 사이드 파이프라인, 브라우저 확장에서 동일한 코드 경로를 실행합니다. 헤드리스 브라우저 없이 스냅샷 픽스처에 대해 테스트가 실행됩니다.

이것이 내보내기 도구가 에디터 내부가 아니라 `@drawtonomy/sdk`에 있는 이유입니다 — 에디터가 SDK에 의존하는 것이지 그 반대가 아닙니다.

## 대상 형식 추가하기

내보내기 도구는 새 대상 — CARLA, Unity, SUMO, 사용자 정의 DSL — 을 위한 주요 확장 지점입니다. 절차:

1. `packages/drawtonomy-sdk/src/exporter/` 아래에 새 모듈을 추가합니다.
2. `DrawtonomySnapshot`을 입력으로 받아 문자열이나 blob을 반환합니다.
3. `packages/drawtonomy-sdk/__tests__/exporter/` 아래에 스냅샷 픽스처를 사용한 테스트를 추가합니다.
4. 에디터의 Export 메뉴에서 새 형식을 인지하길 원한다면 UI 진입점을 연결합니다(선택 사항 — 많은 사용자가 프로그래밍 방식으로 호출).

전체 개발자 가이드는 공개 저장소에 있습니다: [Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## 함께 보기

- [OpenDRIVE / OpenSCENARIO / esmini로 내보내기](/ko/guides/export-asam/) — 사용자 측 흐름.
- [`@drawtonomy/sdk` 개요](/ko/reference/sdk/)
- [Exporter SDK API](/ko/extend/exporter-sdk/)
