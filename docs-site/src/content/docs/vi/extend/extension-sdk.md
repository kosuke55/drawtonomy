---
title: SDK Tiện ích mở rộng
description: Xây dựng các tiện ích mở rộng iframe với @drawtonomy/sdk và @drawtonomy/dev-server.
---

Các tiện ích mở rộng drawtonomy là các ứng dụng web được lưu trữ trong iframe giao tiếp với trình chỉnh sửa thông qua `postMessage`. SDK cho bạn một client được kiểu hóa; dev-server cho bạn một trình chỉnh sửa cục bộ để phát triển dựa trên đó.

Trang này là một định hướng nhanh. Hướng dẫn đầy đủ — schema manifest, danh sách capabilities, giao thức message — nằm trong repo công khai:

➡ **[Hướng dẫn Phát triển Tiện ích mở rộng](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Bắt đầu nhanh

```bash
# Editor on :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Your extension on :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Tiện ích mở rộng tối thiểu

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## Các tiện ích mở rộng tham khảo

Các tiện ích mở rộng trong-cây là các ví dụ đầy đủ độ trung thực:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — tạo cảnh từ ngôn ngữ tự nhiên và OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — xem trước một mẫu hình mẫu.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — vận hành trình xuất dựa trên một canvas trực tiếp.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — thử nghiệm Path Footprint.

## Xem thêm

- [Kiến trúc tiện ích mở rộng](/vi/explanation/extension-architecture/) — vì sao là iframe, vì sao là postMessage.
- [Tổng quan `@drawtonomy/sdk`](/vi/reference/sdk/) — gói và các module của nó.
