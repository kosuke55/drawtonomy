---
title: Tổng quan @drawtonomy/sdk
description: Các gói, điểm vào và cách SDK kết hợp với trình chỉnh sửa.
---

`@drawtonomy/sdk` là gói mà các tác giả tiện ích mở rộng và công cụ headless xây dựng dựa trên. Nó cung cấp:

| Module | Mục đích |
|---|---|
| `ExtensionClient` | Client postMessage cho các tiện ích mở rộng được lưu trữ trong iframe. |
| Hàm factory hình mẫu | `createLane()`, `createVehicle()`, v.v. |
| `createSnapshot()` | Dựng một `DrawtonomySnapshot` từ một mảng các hình mẫu. |
| `exporter.*` | Các hàm thuần biến một snapshot thành OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM. Bao gồm một trình phân tích Lanelet2. |
| Kiểu | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Cài đặt

```bash
pnpm add @drawtonomy/sdk
```

## Các gói đi kèm

| Gói | Mục đích |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | Bản thân SDK. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Dev server cục bộ lưu trữ trình chỉnh sửa cho phát triển tiện ích mở rộng. |

## Mã nguồn

Mã nguồn SDK, các bài kiểm thử và ví dụ nằm trong [kho lưu trữ GitHub drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Xem thêm

- [API SDK Tiện ích mở rộng](/vi/extend/extension-sdk/) — xây dựng các tiện ích mở rộng iframe.
- [API SDK Trình xuất](/vi/extend/exporter-sdk/) — thêm các định dạng đích mới.
