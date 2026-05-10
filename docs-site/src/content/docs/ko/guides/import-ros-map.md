---
title: ROS OccupancyGrid (.pgm + .yaml) 가져오기
description: nav2, Cartographer, Gmapping으로 만든 ROS map_server 점유 격자(.pgm + .yaml)를 drawtonomy의 배경 레이어로 불러와 그 위에 경로, 차선, 장애물을 스케치하세요.
keywords:
  - ROS 점유 격자 주석
  - nav2 지도 에디터
  - cartographer 지도 뷰어
  - pgm 지도 위에 그리기
  - SLAM 지도 주석 도구
  - ROS 점유 격자
---

drawtonomy는 [nav2](https://navigation.ros.org/), Cartographer, Gmapping 등 SLAM 도구가 사용하는 ROS `map_server` 형식을 이해합니다.

![drawtonomy로 가져온 ROS 점유 격자 위에 화살표와 선반이 그려진 모습](/img/ros-occupancy-grid.png)

스크린샷은 실제 창고의 점유 격자(점유된 셀은 검정, 자유 셀은 흰색)에 경로와 장애물을 drawtonomy 안에서 직접 그린 모습입니다.

## 가져오기

1. **File** 메뉴 → **Import**를 엽니다.
2. 파일 다이얼로그에서 `.pgm`과 그에 대응되는 `.yaml`을 **둘 다** 함께 선택합니다.
3. drawtonomy가 YAML 메타데이터(해상도, 임계값)를 읽어 격자를 캔버스에 렌더링합니다.

`.pgm`만 선택하고 `.yaml`을 선택하지 않으면 drawtonomy가 기본값(`resolution = 0.05 m/px`, 표준 점유 임계값)을 사용합니다.

## 셀 색상

| 셀 | 색상 |
|---|---|
| 점유됨 | 검정 |
| 자유 | 흰색 |
| 알 수 없음 | 회색 |

셀은 drawtonomy의 차선 치수에 맞는 비율로 렌더링되므로, 위에 차선, 경로, 도형을 위 스크린샷과 같이 직접 그릴 수 있습니다.

## 검증된 도구

drawtonomy는 nav2, Cartographer, Gmapping이 만든 지도와 함께 사용해 본 바 있습니다. 표준 `map_server` `.pgm` + `.yaml` 쌍을 출력하는 다른 생성기도 동작할 것입니다.

## 함께 보기

- [Lanelet2 (.osm) 파일 가져오기](/ko/guides/import-lanelet2/)
