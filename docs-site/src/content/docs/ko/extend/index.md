---
title: drawtonomy 확장하기
description: 확장 만들기, 새로운 대상 형식 추가, 템플릿 기여.
sidebar:
  order: 0
---

drawtonomy는 확장될 수 있도록 만들어졌습니다. 트리에 포함된 확장(AI Scene Generator, Template Preview, Exporter Playground)을 동작시키는 SDK가 곧 여러분이 사용할 SDK입니다.

## 확장 지점 선택

| 하고 싶은 일 | 읽을 곳 |
|---|---|
| 에디터와 함께 동작하는 패널, 생성기, 도구 추가 | [Extension SDK](/ko/extend/extension-sdk/) |
| 새로운 내보내기 대상 추가 (CARLA, Unity, SUMO 등) | [Exporter SDK](/ko/extend/exporter-sdk/) |
| 새로운 SVG 템플릿 기여 (차량, 보행자, 표지판) | [템플릿](/ko/extend/templates/) |

## 소스 위치

모든 것은 공개 [drawtonomy GitHub 저장소](https://github.com/kosuke55/drawtonomy)에 있습니다.

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — 개발용 로컬 에디터
- `extensions/` — 트리에 포함된 확장, 참고 자료로 유용
- `templates/` — 내장 도형 템플릿

PR을 환영합니다. [Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)는 사용자 정의 도형을 처음부터 끝까지 추가하는 과정을 안내합니다.
