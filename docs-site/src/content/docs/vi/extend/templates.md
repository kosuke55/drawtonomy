---
title: Đóng góp mẫu
description: Thêm một mẫu phương tiện, người đi bộ, biển báo, hoặc vạch kẻ đường mới.
---

Các mẫu là các tệp SVG cộng với một mục manifest. Khi đã đóng góp, chúng xuất hiện trong menu Participants và menu hình mẫu của trình chỉnh sửa cùng với các mẫu được tích hợp sẵn.

Quy trình đóng góp nằm trong repo công khai:

➡ **[Hướng dẫn Mẫu](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Danh mục

| Thư mục | Ví dụ |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, các vạch mũi tên |
| `templates/sign/` | Dừng, nhường đường, đầu tín hiệu |
| `templates/other/` | Bất cứ thứ gì khác |

## Quy trình

1. Thêm SVG của bạn dưới thư mục danh mục đúng.
2. Đăng ký nó trong `templates/manifest.json`.
3. Mở một PR. Bao gồm một ảnh chụp màn hình của mẫu được đặt lên canvas.

## Điều gì làm nên một mẫu tốt

- Được vẽ ở kích thước mặc định hợp lý (phương tiện khoảng 4–5 m cho một sedan).
- Một vùng có thể-đổi-màu duy nhất được đánh dấu bằng một fill đã biết, để bộ chọn màu của Bảng Thuộc tính có thể tô lại nó.
- Không có tham chiếu font bên ngoài — văn bản được chuyển đổi thành các path nếu có.
- Kích thước tệp hợp lý (dưới ~30 KB cho một mẫu kích thước phương tiện).
