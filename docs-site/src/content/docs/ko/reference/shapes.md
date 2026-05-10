---
title: 도형 카탈로그
description: drawtonomy가 만들 수 있는 모든 도형을 목적별로 정리한 목록입니다.
---

## 자율주행 시나리오 도형

| 도형 | 용도 |
|---|---|
| **Linestring** | 차선 경계, 연석, 도로 표시 등에 사용되는 연속 선. |
| **Lane** | 두 경계와 중앙선, 그리고 연결 슬롯(Next / Previous / Left / Right)을 가지는 주행 가능한 차선. |
| **Vehicle** | 템플릿 기반 차량 (Sedan, Bus, Truck, Motorcycle). |
| **Pedestrian** | 템플릿 기반 보행자 (Walking, Simple). |
| **Path** | 화살표, 풋프린트 그룹, 시나리오 경로에 사용되는 궤적. 화살표 또는 밴드 스타일. |
| **Polygon** | 닫힌 영역 (주차장, 빗금 영역). |
| **Crosswalk** | 사전 스타일링된 횡단보도. |
| **TrafficLight** | 차량 또는 보행자 신호. |
| **Intersection** | 다중 차선 교차로 템플릿. |

## 기본 도형

| 도형 | 용도 |
|---|---|
| **LineArrow** | 단일 구간 화살표. |
| **Arrow** | 자유 형태 화살표. |
| **Text** | 일반 텍스트 또는 주석 텍스트. |
| **Freehand** | 펜과 같은 스트로크로 자유롭게 그린 도형. |
| **Rectangle** | 축 정렬 사각형. |
| **Ellipse** | 축 정렬 타원. |
| **Image** | 가져온 PNG / JPG / SVG. |

## 사용자 정의 템플릿

차량, 보행자, 노면 표시, 표지판을 위한 SVG 템플릿을 추가할 수 있습니다. 기여 절차는 [Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)에 있습니다.
