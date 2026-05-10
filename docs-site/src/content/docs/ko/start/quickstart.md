---
title: 빠른 시작 — 브라우저에서 첫 차선 그리기
description: drawtonomy.com을 열고 차선을 그리고, 차량을 배치한 뒤 내보내 보세요. 무료 온라인 자율주행 다이어그램 화이트보드를 5분 만에 체험할 수 있습니다.
sidebar:
  label: 빠른 시작
  order: 2
keywords:
  - drawtonomy 빠른 시작
  - 온라인 차선 그리기
  - 도로 다이어그램 브라우저 도구
  - 자율주행 스케치 튜토리얼
  - 차선 에디터
  - 자율주행 시나리오 그리기
---

빈 캔버스부터 내보낸 장면까지 5분이면 충분합니다. 설치는 필요 없습니다.

## 1. 앱 열기

[drawtonomy.com](https://drawtonomy.com)에 접속하세요. 모든 작업이 브라우저에서 이루어지며, 어떤 데이터도 업로드되지 않습니다.

## 2. 차선 그리기

1. <kbd>N</kbd>을 누르거나 툴바의 **Lane** 도구를 클릭합니다.
2. 캔버스를 클릭해 중앙선의 시작점을 찍고, 다시 클릭해 다음 정점을 찍은 뒤 <kbd>Enter</kbd>를 눌러 마칩니다.
3. 좌우 경계가 자동으로 생성됩니다.

:::tip
그리는 도중 <kbd>Shift</kbd>를 누르고 클릭하면 해당 클릭에서 일시적으로 [스냅](/ko/guides/snap/)을 우회할 수 있습니다.
:::

## 3. 차량 배치

1. <kbd>P</kbd>를 눌러 **Participants** 도구를 엽니다.
2. **Vehicle → Sedan**을 선택하고 방금 그린 차선 위를 클릭합니다.
3. 모서리 핸들을 드래그해 크기를 조정하거나, 회전 핸들을 사용해 차선 방향과 정렬합니다.

## 4. 장면 내보내기

내보내기 메뉴를 열고 형식을 선택합니다.

- **PNG / SVG / PDF** — 단일 이미지로 공유.
- **drawtonomy.svg** — 모든 연결을 함께 저장하므로 본인이나 팀원이 다시 열어 편집을 이어갈 수 있음.
- **Export for esmini** — OpenDRIVE + OpenSCENARIO를 묶은 zip이며 [esmini](https://github.com/esmini/esmini)에서 바로 재생할 수 있음.

각 형식의 자세한 내용은 [장면 내보내기](/ko/guides/export/)에서 확인하세요.

## 다음에는 무엇을 해 볼까요?

- 더 긴 학습: [첫 세 개의 차선 그리기](/ko/tutorials/your-first-lanes/).
- 특정 작업을 위한 How-to 가이드 — [위성 지도에서 차선 생성하기](/ko/guides/lane-from-map/), [Lanelet2 파일 가져오기](/ko/guides/import-lanelet2/) 등.
- 확장 개발자라면: [drawtonomy 확장하기](/ko/extend/).
