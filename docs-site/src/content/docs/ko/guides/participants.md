---
title: 차량, 보행자, 신호등 추가
description: 내장 템플릿을 사용해 캔버스에 액터와 교통 요소를 배치합니다.
---

drawtonomy는 자율주행 시나리오에 필요한 액터와 교통 요소 템플릿을 기본 제공합니다.

## 차량

1. <kbd>P</kbd>를 눌러 **Participants**를 엽니다.
2. 차량 템플릿(Sedan, Bus, Truck, Motorcycle)을 선택합니다.
3. 캔버스를 클릭해 배치합니다. 차량이 템플릿의 기본 크기로 배치됩니다.

모서리 핸들을 드래그해 크기를 조정합니다. 회전 핸들을 드래그해 차선 방향과 정렬합니다.

## 보행자

같은 Participants 메뉴에서 보행자 템플릿(Walking, Simple)을 선택합니다.

## 신호등

Participants 메뉴는 차량용 신호와 보행자용 신호도 포함합니다. 교차로 모서리에 배치하세요. 정적 도형이며, 신호 페이즈를 실행하지는 않습니다.

## 사용자 정의 템플릿

직접 만든 SVG 템플릿을 추가하고 PR로 기여할 수 있습니다. [Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)를 참고하세요.

## 경로에 차량 채우기

(차간 거리 다이어그램이나 추종 장면을 위해) 경로를 따라 차량 행렬을 배치하려면 [Path Footprint](/ko/guides/path-footprint/)를 사용하세요.
