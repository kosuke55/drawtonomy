---
title: 템플릿 기여하기
description: 새로운 차량, 보행자, 표지판, 노면 표시 템플릿을 추가합니다.
---

템플릿은 SVG 파일과 매니페스트 항목으로 구성됩니다. 한 번 기여되면 에디터의 Participants 메뉴와 도형 메뉴에서 내장 템플릿과 함께 표시됩니다.

기여 절차는 공개 저장소에 있습니다.

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## 카테고리

| 폴더 | 예시 |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | 횡단보도, 화살표 마킹 |
| `templates/sign/` | Stop, yield, 신호등 헤드 |
| `templates/other/` | 그 외의 모든 것 |

## 절차

1. 적절한 카테고리 폴더 아래에 SVG를 추가합니다.
2. `templates/manifest.json`에 등록합니다.
3. PR을 엽니다. 캔버스에 배치된 템플릿의 스크린샷을 함께 첨부하세요.

## 좋은 템플릿의 조건

- 합리적인 기본 크기로 그려져 있을 것 (세단 기준 차량은 약 4–5 m).
- 색상을 변경할 수 있는 영역이 알려진 fill 값으로 표시되어 Attribute Panel의 색상 선택기로 다시 칠할 수 있어야 합니다.
- 외부 폰트를 참조하지 않을 것 — 텍스트가 있다면 패스로 변환합니다.
- 합리적인 파일 크기 (차량 크기 템플릿은 약 30 KB 이하).
