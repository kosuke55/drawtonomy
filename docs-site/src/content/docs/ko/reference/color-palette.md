---
title: 색상 팔레트
description: drawtonomy의 색상 키와 그에 대응되는 HEX 값.
---

drawtonomy는 Tailwind / Material 스타일의 팔레트를 사용합니다: grey-100(가장 밝음)부터 grey-900(가장 어두움), 그리고 명명된 색상들.

## 그레이스케일

| 키 | HEX | 비고 |
|---|---|---|
| `grey-100` | `#e6e6e6` | 가장 밝음. Vehicle (Simple) 기본값. |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) 기본값. |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | 중간 회색. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | 가장 어두움. |

숫자가 작을수록 밝습니다. Tailwind의 컨벤션과 일치합니다.

## 템플릿 기본값

| 템플릿 | 기본 색상 |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| 다른 도형 | `black` |

## 프로그래밍 방식 색상 설정

SDK의 `resolveColor()`를 사용해 키를 HEX 값으로 변환합니다. 자세한 내용은 [Extension SDK API](/ko/extend/extension-sdk/)를 참고하세요.
