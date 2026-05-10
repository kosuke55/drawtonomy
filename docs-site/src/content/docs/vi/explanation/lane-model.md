---
title: Mô hình kết nối làn đường
description: Cách drawtonomy biểu diễn topology đường, và điều đó mang lại cho bạn điều gì.
---

Một Lane của drawtonomy có nhiều hơn hai biên và một đường tâm; nó còn mang bốn khe kết nối — **Next**, **Previous**, **Left** và **Right** — liên kết nó vào một mạng lưới đường.

## Bốn khe

| Khe | Ý nghĩa |
|---|---|
| **Next** | Làn đường mà giao thông trên làn này chảy vào. |
| **Previous** | Làn đường chảy vào làn này. |
| **Left** | Làn đường ngay bên trái, chia sẻ một biên. |
| **Right** | Làn đường ngay bên phải, chia sẻ một biên. |

Các kết nối là hai chiều: đặt Next của Lane A thành B cũng đặt Previous của B thành A. Trình chỉnh sửa duy trì bất biến này cho bạn.

## Các kết nối cho phép điều gì

### Chỉnh sửa được phối hợp

Khi hai làn đường chia sẻ một biên — vì chúng là hàng xóm Left/Right, hoặc vì các làn Next/Previous gặp nhau đầu-đến-đầu — biên đó là một đối tượng duy nhất. Kéo một điểm trên đó và cả hai làn đường cập nhật.

Topology đã nói rõ cái gì được dán vào cái gì, vì vậy hình học không cần được sửa chữa bằng tay mỗi khi bạn tinh chỉnh một làn đường.

### Xuất nhất quán

Cả [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) và [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) đều mã hóa kết nối làn đường. Các trình xuất của drawtonomy sử dụng các khe kết nối trực tiếp, không có suy luận hay heuristic nào sẽ thất bại trong các trường hợp biên. Một cảnh trông đúng trong trình chỉnh sửa được xuất ra như một mạng lưới đường thực thay vì một túi polyline.

### Đọc/ghi qua lại với các bản nhập

Trình nhập Lanelet2 đọc cùng mô hình kết nối từ các tệp `.osm`. Bạn có thể chỉnh sửa một bản đồ Lanelet2 trong drawtonomy và xuất nó ngược lại mà không mất topology.

## Khi nào các kết nối được suy luận

drawtonomy đặt các kết nối tự động khi ý định rõ ràng:

- Vẽ một làn đường bắt đầu trên điểm cuối của một làn đường hiện có sẽ đặt **Previous**.
- Lối tắt làn-đường-song-song (<kbd>Alt</kbd>+nhấp với công cụ Lane) đặt **Left** hoặc **Right**.
- Đặt một [mẫu giao lộ](/vi/guides/participants/) nối mọi làn tiếp cận.
- [Lane Generator](/vi/guides/lane-from-map/) suy luận các kết nối từ topology OSM nơi không mơ hồ.

Đối với mọi thứ khác, hãy đặt chúng bằng tay trong Bảng Thuộc tính — xem [Quản lý kết nối làn đường](/vi/guides/lane-connections/).

## Những gì các kết nối không mã hóa

- **Hướng di chuyển** được ngụ ý bởi Next/Previous, nhưng không được mã hóa riêng. Đường hai chiều được mô hình hóa thành hai làn đối lập với chuỗi Next/Previous riêng của chúng.
- **Hạn chế rẽ** tại các giao lộ không được mô hình hóa trong bản thân drawtonomy. Chúng xuất hiện trong xuất OpenDRIVE/OpenSCENARIO thông qua mẫu giao lộ tạo ra chúng.
- **Giới hạn tốc độ, loại bề mặt, ánh sáng** — không có gì trong số này. drawtonomy là hình học cộng topology; các thuộc tính ngữ nghĩa nằm ngoài phạm vi.

## Xem thêm

- [Quản lý kết nối làn đường](/vi/guides/lane-connections/) — các bước trong trình chỉnh sửa.
- [Định dạng drawtonomy.svg](/vi/reference/drawtonomy-svg/) — cách các kết nối được lưu giữ khi lưu.
