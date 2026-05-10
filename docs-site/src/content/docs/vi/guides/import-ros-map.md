---
title: Nhập ROS OccupancyGrid (.pgm + .yaml)
description: Tải lưới chiếm dụng map_server của ROS (.pgm + .yaml) — được tạo bằng nav2, Cartographer hoặc Gmapping — vào drawtonomy dưới dạng lớp nền, sau đó phác thảo đường đi, làn đường và chướng ngại vật lên trên.
keywords:
  - chú thích lưới chiếm dụng ROS
  - trình chỉnh sửa bản đồ nav2
  - trình xem bản đồ cartographer
  - vẽ lên bản đồ pgm
  - công cụ chú thích bản đồ SLAM
---

drawtonomy hiểu định dạng `map_server` của ROS được sử dụng bởi [nav2](https://navigation.ros.org/), Cartographer, Gmapping và các công cụ SLAM tương tự.

![Một lưới chiếm dụng ROS được nhập vào drawtonomy với mũi tên và kệ được vẽ lên trên](/img/ros-occupancy-grid.png)

Ảnh chụp màn hình cho thấy một lưới chiếm dụng kho thực tế (ô bị chiếm dụng màu đen, ô tự do màu trắng) với đường đi và chướng ngại vật được vẽ trực tiếp lên trên bên trong drawtonomy.

## Nhập

1. Mở menu **File** → **Import**.
2. Chọn **cả** tệp `.pgm` và tệp `.yaml` khớp cùng nhau trong hộp thoại tệp.
3. drawtonomy đọc metadata YAML (độ phân giải, ngưỡng) và hiển thị lưới lên canvas.

Nếu bạn chỉ chọn `.pgm` và không có `.yaml`, drawtonomy sử dụng các giá trị mặc định (`resolution = 0.05 m/px`, ngưỡng chiếm dụng tiêu chuẩn).

## Tô màu ô

| Ô | Màu |
|---|---|
| Bị chiếm dụng | Đen |
| Tự do | Trắng |
| Không xác định | Xám |

Các ô hiển thị ở tỷ lệ khớp với kích thước làn đường của drawtonomy, vì vậy bạn có thể vẽ làn đường, đường đi và hình mẫu trực tiếp lên trên — chính xác như ảnh chụp màn hình ở trên.

## Các công cụ đã được kiểm thử

drawtonomy đã được sử dụng với bản đồ từ nav2, Cartographer và Gmapping. Các trình tạo khác sẽ hoạt động miễn là chúng phát ra cặp `.pgm` + `.yaml` chuẩn của `map_server`.

## Xem thêm

- [Nhập tệp Lanelet2 (.osm)](/vi/guides/import-lanelet2/)
