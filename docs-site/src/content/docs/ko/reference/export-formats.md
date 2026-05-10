---
title: 지원 내보내기 형식
description: drawtonomy가 읽고 쓸 수 있는 형식들.
---

| 형식 | 내보내기 | 가져오기 | 비고 |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | 표준 SVG. |
| **PNG** | ✓ | ✓ | 무손실 래스터. |
| **JPG** | ✓ | ✓ | 손실 래스터. |
| **PDF** | ✓ |  | 벡터, 투명도 지원. |
| **EPS** | ✓ |  | 벡터. **투명도 미지원** — PDF 사용 권장. |
| **drawtonomy.svg** | ✓ | ✓ | 다시 편집 가능: 연결, 공유 점, 풋프린트 그룹, 스타일 모두 보존. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) 도로 네트워크. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid 지도, ROS `map_server` 형식. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini 번들 (.zip)** | ✓ |  | `.xodr` + `.xosc`를 함께 묶어 `esmini`에서 바로 재생 가능. |

## 보존되는 항목

| 항목 | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| 형상 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 차선 연결 | ✓ | ✓ | ✓ | 부분 | – |
| 공유 점 | ✓ | – | – | – | – |
| 풋프린트 그룹 | ✓ | – | – | 부분 | – |
| 스타일 (색상, 투명도) | ✓ | – | – | – | ✓ |
| 왕복 변환 | ✓ | ✓ | – | – | – |

## 함께 보기

- [장면 내보내기](/ko/guides/export/)
- [OpenDRIVE / OpenSCENARIO / esmini로 내보내기](/ko/guides/export-asam/)
