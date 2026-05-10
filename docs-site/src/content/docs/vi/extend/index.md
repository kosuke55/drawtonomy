---
title: Mở rộng drawtonomy
description: Xây dựng các tiện ích mở rộng, thêm các định dạng đích, đóng góp các mẫu.
sidebar:
  order: 0
---

drawtonomy được xây dựng để có thể mở rộng. Cùng SDK cung cấp năng lượng cho các tiện ích mở rộng trong-cây (AI Scene Generator, Template Preview, Exporter Playground) là những gì bạn sử dụng.

## Chọn điểm mở rộng của bạn

| Bạn muốn… | Đọc |
|---|---|
| Thêm một bảng, trình tạo, hoặc công cụ chạy bên cạnh trình chỉnh sửa | [SDK Tiện ích mở rộng](/vi/extend/extension-sdk/) |
| Thêm một đích xuất mới (CARLA, Unity, SUMO, …) | [SDK Trình xuất](/vi/extend/exporter-sdk/) |
| Đóng góp một mẫu SVG mới (phương tiện, người đi bộ, biển báo) | [Mẫu](/vi/extend/templates/) |

## Mã nguồn ở đâu

Mọi thứ nằm trong [kho lưu trữ GitHub drawtonomy](https://github.com/kosuke55/drawtonomy) công khai:

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — trình chỉnh sửa cục bộ để phát triển
- `extensions/` — các tiện ích mở rộng trong-cây, hữu ích như tham khảo
- `templates/` — các mẫu hình mẫu được tích hợp sẵn

PR được hoan nghênh. [Hướng dẫn Mẫu](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md) đi qua việc thêm một hình mẫu tùy chỉnh từ đầu đến cuối.
