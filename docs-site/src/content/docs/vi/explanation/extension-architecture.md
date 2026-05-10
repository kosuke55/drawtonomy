---
title: Kiến trúc tiện ích mở rộng
description: Cách drawtonomy tải, cách ly và giao tiếp với các tiện ích mở rộng của bên thứ ba.
---

Các tiện ích mở rộng của drawtonomy không phải là plugin được biên dịch vào trình chỉnh sửa. Chúng là các ứng dụng web riêng biệt được tải vào một iframe, giao tiếp với host thông qua `postMessage`. Trang này giải thích vì sao, và điều gì xuất phát từ lựa chọn đó.

## Tải

Một tiện ích mở rộng là một URL trỏ đến một `manifest.json`. Người dùng (hoặc một deep-link) mở trình chỉnh sửa với `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Trình chỉnh sửa lấy manifest, tạo một iframe và tải HTML đầu vào của tiện ích mở rộng. Nhiều tiện ích mở rộng có thể được tải cùng một lúc với các tham số `?ext=` lặp lại.

## Cách ly

Các tiện ích mở rộng chạy bên trong một iframe với origin riêng của chúng. Chúng không thể:

- Chạm vào DOM của trình chỉnh sửa trực tiếp.
- Đọc localStorage của drawtonomy.
- Tải tài nguyên vượt qua CSP của host.

Chúng có thể làm những gì chúng yêu cầu trong mảng `capabilities` của manifest (`shapes:read`, `shapes:write`, `ui:panel`, …) và những gì `postMessage` cho phép thông qua `ExtensionClient` của `@drawtonomy/sdk`.

Đây là cố ý. Các tiện ích mở rộng là mã của bên thứ ba; trình chỉnh sửa coi chúng là không tin cậy.

## Giao tiếp

SDK gói `postMessage` trong một `ExtensionClient` mang lại cho bạn một API được kiểu hóa, dựa trên promise:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Bên dưới:

- Tiện ích mở rộng đăng một yêu cầu lên iframe host.
- Host xác thực dựa trên các capabilities của tiện ích mở rộng.
- Host trả lời, hoặc yêu cầu bị từ chối.

## Vì sao iframes

Các giải pháp thay thế — plugin kiểu npm, Webpack module federation, các script trong-tiến-trình — tất cả đều yêu cầu tin tưởng mã của tiện ích mở rộng với trình chỉnh sửa của bạn. Chúng cũng kết nối vòng đời tiện ích mở rộng với bản dựng của trình chỉnh sửa.

iframes mang lại cho bạn:

- **Cách ly origin**, được thực thi bởi trình duyệt — không có sandbox JS để duy trì.
- **Chu kỳ triển khai độc lập** — các tiện ích mở rộng phát hành theo tốc độ riêng của chúng.
- **Bất kỳ framework nào** — React, Vue, Svelte, vanilla JS; host không quan tâm.
- **Cùng mã trong dev và prod** — dev server lưu trữ trình chỉnh sửa tại `localhost:3000`; bạn trỏ nó vào tiện ích mở rộng tại `localhost:3001`. Cùng cờ `?ext=`, cùng giao thức.

Đánh đổi là `postMessage` là bất đồng bộ. Các cuộc gọi trông miễn phí (`getShapes()`) tốn một vòng round-trip iframe. SDK gộp và cache nơi nó có thể; đừng đặt một cuộc gọi bên trong vòng lặp chặt.

## Phát triển cục bộ

Gói `@drawtonomy/dev-server` phục vụ trình chỉnh sửa cục bộ để bạn có thể phát triển dựa trên nó mà không cần round-trip mạng:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor on :3000
cd my-extension && pnpm dev --port 3001        # extension on :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Hướng dẫn đầy đủ nằm trong repo công khai: [Hướng dẫn Phát triển Tiện ích mở rộng](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Xem thêm

- [API SDK Tiện ích mở rộng](/vi/extend/extension-sdk/)
- [Tổng quan `@drawtonomy/sdk`](/vi/reference/sdk/)
