---
title: Kiến trúc trình xuất
description: Cách một canvas trở thành một snapshot, và một snapshot trở thành một tệp.
---

Trình xuất là cầu nối giữa dữ liệu trong-trình-chỉnh-sửa của drawtonomy và các định dạng bên ngoài — OpenDRIVE, OpenSCENARIO, Lanelet2, hoặc bất cứ thứ gì bạn cắm vào tiếp theo. Hiểu pipeline là điều kiện tiên quyết để thêm một định dạng đích mới.

## Pipeline

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

Một snapshot là một đối tượng thuần: một danh sách các hình mẫu cộng với một dấu phiên bản và một dấu thời gian. Nó có thể tuần tự hóa, không có tham chiếu DOM, và là đầu vào duy nhất mà trình xuất nhận.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Bạn dựng một snapshot với `createSnapshot(shapes)`, hoặc bằng cách phân tích một `drawtonomy.svg` đã lưu với `parseDrawtonomySvg(svg)`.

### 2. Các module trình xuất

Mỗi định dạng đích là một hàm thuần riêng biệt:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Chúng nhận một snapshot, trả về một chuỗi hoặc một blob. Không có truy cập trình chỉnh sửa, không có DOM, không có các phụ thuộc bất đồng bộ. Cùng đầu vào, cùng đầu ra.

### 3. Đọc/ghi qua lại

Đối với Lanelet2, SDK cũng đi kèm với một trình phân tích:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Đây là những gì cung cấp năng lượng cho luồng [nhập Lanelet2](/vi/guides/import-lanelet2/).

## Vì sao là hàm thuần

Trình xuất chạy cùng đường dẫn mã trong trình duyệt, trong một script Node CI, trong một pipeline phía máy chủ, hoặc trong một tiện ích mở rộng trình duyệt. Các bài kiểm thử chạy dựa trên các fixture snapshot mà không cần trình duyệt headless.

Đó là lý do trình xuất sống trong `@drawtonomy/sdk` chứ không nằm trong trình chỉnh sửa — trình chỉnh sửa phụ thuộc vào SDK, không phải ngược lại.

## Thêm một định dạng đích

Trình xuất là điểm mở rộng chính cho các đích mới — CARLA, Unity, SUMO, các DSL tùy chỉnh. Công thức:

1. Thêm một module mới dưới `packages/drawtonomy-sdk/src/exporter/`.
2. Lấy `DrawtonomySnapshot` vào, trả về một chuỗi hoặc blob.
3. Thêm các bài kiểm thử dưới `packages/drawtonomy-sdk/__tests__/exporter/` sử dụng các fixture snapshot.
4. Nối một điểm vào UI nếu bạn muốn menu Export của trình chỉnh sửa biết về nó (tùy chọn — nhiều người dùng sẽ gọi nó theo chương trình).

Hướng dẫn đầy đủ cho nhà phát triển nằm trong repo công khai: [Hướng dẫn Nhà phát triển Trình xuất](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Xem thêm

- [Xuất sang OpenDRIVE / OpenSCENARIO / esmini](/vi/guides/export-asam/) — luồng hướng đến người dùng.
- [Tổng quan `@drawtonomy/sdk`](/vi/reference/sdk/)
- [API SDK Trình xuất](/vi/extend/exporter-sdk/)
