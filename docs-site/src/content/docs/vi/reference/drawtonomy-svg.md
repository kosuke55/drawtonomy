---
title: Định dạng drawtonomy.svg
description: Cấu trúc trên đĩa của một tệp drawtonomy có thể chỉnh sửa lại.
---

Một tệp `drawtonomy.svg` là một SVG bình thường được bổ sung metadata ghi lại trạng thái chỉ-cho-trình-chỉnh-sửa.

## Cấu trúc

- Nội dung trực quan (các đường, văn bản, hình ảnh) là SVG thuần. Bất kỳ trình xem SVG nào cũng hiển thị nó đúng.
- Một khối `<metadata>` ở phía trên tài liệu chứa dữ liệu dành riêng cho drawtonomy:
  - các ID hình mẫu và props của từng hình mẫu (template, kiểu, v.v.)
  - các khe kết nối làn đường (`next`, `previous`, `left`, `right`)
  - các tham chiếu điểm dùng chung
  - thành viên nhóm dấu chân
  - thứ tự z

## Khả năng tương thích

Chỉnh sửa một `drawtonomy.svg` trong trình chỉnh sửa SVG thông thường (Illustrator, Inkscape, trình duyệt) sẽ loại bỏ khối metadata khi lưu trừ khi bạn giữ nó một cách rõ ràng. drawtonomy vẫn có thể mở kết quả, nhưng các kết nối và điểm dùng chung sẽ bị mất.

Đối với chỉnh sửa có thể đọc/ghi qua lại bên ngoài drawtonomy, hãy sử dụng SDK ([`@drawtonomy/sdk`](/vi/reference/sdk/)) — nó có thể đọc và ghi định dạng mà không cần đi qua trình chỉnh sửa.

## Quản lý phiên bản

Các tệp cũ hơn được di chuyển tự động khi nhập. Hàm trợ giúp `resolveColorKey()` trong SDK chuyển đổi các khóa màu cũ (ví dụ, `grey-700` v1.x) sang các khóa hiện tại.

## Xem thêm

- [Xuất cảnh của bạn](/vi/guides/export/)
- [Tổng quan `@drawtonomy/sdk`](/vi/reference/sdk/)
