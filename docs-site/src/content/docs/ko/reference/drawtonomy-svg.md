---
title: drawtonomy.svg 형식
description: 다시 편집 가능한 drawtonomy 파일의 디스크 상 구조.
---

`drawtonomy.svg` 파일은 에디터 전용 상태를 기록하는 메타데이터로 보강된 일반 SVG입니다.

## 구조

- 시각적 콘텐츠(경로, 텍스트, 이미지)는 일반 SVG입니다. 어떤 SVG 뷰어에서도 올바르게 렌더링됩니다.
- 문서 상단의 `<metadata>` 블록이 drawtonomy 전용 데이터를 가집니다:
  - 도형 ID와 도형별 속성(템플릿, 스타일 등)
  - 차선 연결 슬롯(`next`, `previous`, `left`, `right`)
  - 공유 점 참조
  - 풋프린트 그룹 멤버십
  - z-order

## 호환성

`drawtonomy.svg`를 일반 SVG 에디터(Illustrator, Inkscape, 브라우저)에서 편집한 뒤 저장하면, 명시적으로 보존하지 않는 한 메타데이터 블록이 사라집니다. drawtonomy는 결과 파일을 여전히 열 수 있지만 연결과 공유 점은 누락됩니다.

drawtonomy 외부에서 왕복 가능한 편집을 하려면 SDK([`@drawtonomy/sdk`](/ko/reference/sdk/))를 사용하세요 — 에디터를 거치지 않고도 이 형식을 읽고 쓸 수 있습니다.

## 버전 관리

이전 파일은 가져오기 시 자동으로 마이그레이션됩니다. SDK의 `resolveColorKey()` 헬퍼는 레거시 색상 키(예: v1.x의 `grey-700`)를 현재 키로 변환합니다.

## 함께 보기

- [장면 내보내기](/ko/guides/export/)
- [`@drawtonomy/sdk` 개요](/ko/reference/sdk/)
