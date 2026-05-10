---
title: Bảng màu
description: Các khóa màu của drawtonomy và giá trị HEX của chúng.
---

drawtonomy sử dụng bảng màu kiểu Tailwind / Material: grey-100 (sáng nhất) đến grey-900 (tối nhất), cộng các màu được đặt tên.

## Thang xám

| Khóa | HEX | Ghi chú |
|---|---|---|
| `grey-100` | `#e6e6e6` | Sáng nhất. Mặc định cho Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Mặc định cho Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Xám trung bình. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Tối nhất. |

Số càng thấp = càng sáng. Đây là quy ước của Tailwind.

## Mặc định của mẫu

| Mẫu | Màu mặc định |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Các hình mẫu khác | `black` |

## Đặt màu theo chương trình

Sử dụng `resolveColor()` của SDK để chuyển đổi một khóa thành giá trị HEX. Xem [API SDK Tiện ích mở rộng](/vi/extend/extension-sdk/) để biết chi tiết.
