---
title: Các định dạng xuất được hỗ trợ
description: Những gì drawtonomy có thể đọc và ghi.
---

| Định dạng | Xuất | Nhập | Ghi chú |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG chuẩn. |
| **PNG** | ✓ | ✓ | Raster không mất dữ liệu. |
| **JPG** | ✓ | ✓ | Raster có mất dữ liệu. |
| **PDF** | ✓ |  | Vector, hỗ trợ độ trong suốt. |
| **EPS** | ✓ |  | Vector. **Không có độ trong suốt** — dùng PDF thay thế. |
| **drawtonomy.svg** | ✓ | ✓ | Có thể chỉnh sửa lại: giữ kết nối, điểm dùng chung, nhóm dấu chân, kiểu. |
| **OSM (Lanelet2)** | ✓ | ✓ | Mạng lưới đường [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Bản đồ OccupancyGrid, định dạng `map_server` của ROS. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **gói esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` cùng nhau, sẵn sàng cho `esmini`. |

## Những gì được giữ lại

| Tính năng | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Hình học | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kết nối làn đường | ✓ | ✓ | ✓ | một phần | – |
| Điểm dùng chung | ✓ | – | – | – | – |
| Nhóm dấu chân | ✓ | – | – | một phần | – |
| Kiểu (màu, độ trong suốt) | ✓ | – | – | – | ✓ |
| Đọc/ghi qua lại | ✓ | ✓ | – | – | – |

## Xem thêm

- [Xuất cảnh của bạn](/vi/guides/export/)
- [Xuất sang OpenDRIVE / OpenSCENARIO / esmini](/vi/guides/export-asam/)
