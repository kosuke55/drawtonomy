---
title: 차선 연결 모델
description: drawtonomy가 도로 토폴로지를 어떻게 표현하며, 그 결과 무엇을 얻을 수 있는지 설명합니다.
---

drawtonomy의 Lane은 두 개의 경계와 중앙선만 가진 것이 아닙니다 — 도로 네트워크에 연결시키는 4개의 연결 슬롯 — **Next**, **Previous**, **Left**, **Right** — 도 가집니다.

## 4개의 슬롯

| 슬롯 | 의미 |
|---|---|
| **Next** | 이 차선 위의 교통이 흘러 들어가는 차선. |
| **Previous** | 이 차선으로 흘러 들어오는 차선. |
| **Left** | 경계를 공유하는 바로 왼쪽의 차선. |
| **Right** | 경계를 공유하는 바로 오른쪽의 차선. |

연결은 양방향입니다. 차선 A의 Next를 B로 설정하면 B의 Previous도 A가 됩니다. 에디터가 이 불변성을 유지해 줍니다.

## 연결이 가능하게 하는 것들

### 협력적 편집

두 차선이 경계를 공유할 때 — 좌/우 이웃이거나 Next/Previous 차선이 끝과 끝으로 만나기 때문에 — 그 경계는 단일 객체입니다. 그 위의 점을 드래그하면 두 차선이 모두 갱신됩니다.

토폴로지가 이미 무엇이 무엇과 붙어 있는지 말해 주므로, 차선을 손볼 때마다 형상을 손으로 보정할 필요가 없습니다.

### 일관된 내보내기

[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)와 [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)는 모두 차선 연결성을 인코딩합니다. drawtonomy의 내보내기 도구는 연결 슬롯을 직접 사용하므로, 엣지 케이스에서 무너질 수 있는 추론이나 휴리스틱이 없습니다. 에디터에서 올바르게 보이는 장면은 폴리라인의 묶음이 아니라 실제 도로 네트워크로 내보내집니다.

### 가져오기와의 왕복

Lanelet2 가져오기 도구는 같은 연결 모델을 `.osm` 파일에서 읽어 들입니다. drawtonomy에서 Lanelet2 지도를 편집한 뒤 토폴로지를 잃지 않고 다시 내보낼 수 있습니다.

## 연결이 자동으로 추론되는 경우

drawtonomy는 의도가 명확할 때 연결을 자동으로 설정합니다.

- 기존 차선의 끝점에서 시작하는 차선을 그리면 **Previous**가 설정됩니다.
- 평행 차선 단축키(Lane 도구로 <kbd>Alt</kbd>+클릭)는 **Left** 또는 **Right**를 설정합니다.
- [교차로 템플릿](/ko/guides/participants/)을 배치하면 모든 진입 차선이 연결됩니다.
- [Lane Generator](/ko/guides/lane-from-map/)는 명확한 경우 OSM 토폴로지에서 연결을 추론합니다.

그 외의 경우에는 Attribute Panel에서 손으로 설정하세요 — [차선 연결 관리](/ko/guides/lane-connections/)를 참고하세요.

## 연결이 인코딩하지 않는 것

- **주행 방향**은 Next/Previous에 의해 암시되지만 별도로 인코딩되지는 않습니다. 양방향 도로는 각자의 Next/Previous 체인을 가진 두 개의 반대 차선으로 모델링됩니다.
- **교차로의 회전 제한**은 drawtonomy 자체에서는 모델링되지 않습니다. OpenDRIVE/OpenSCENARIO 내보내기에서 해당 교차로를 만든 교차로 템플릿을 통해 표현됩니다.
- **속도 제한, 노면 종류, 조명** — 이런 것들은 없습니다. drawtonomy는 형상과 토폴로지이며, 시맨틱 속성은 범위 밖입니다.

## 함께 보기

- [차선 연결 관리](/ko/guides/lane-connections/) — 에디터에서의 작업 단계.
- [drawtonomy.svg 형식](/ko/reference/drawtonomy-svg/) — 저장 시 연결이 어떻게 유지되는지.
