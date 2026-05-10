---
title: Vì sao drawtonomy — bảng trắng được xây dựng cho kịch bản lái xe
description: Vì sao drawtonomy tồn tại và các lựa chọn thiết kế đằng sau nó. Được xây dựng đặc biệt cho các kịch bản lái xe — các hình minh họa đi vào bài báo, slide, rà soát thiết kế và tạo kịch bản về xe tự lái.
keywords:
  - vì sao drawtonomy
  - bảng trắng cho kịch bản lái xe
  - công cụ vẽ sơ đồ xe tự lái
  - công cụ vẽ hình cho bài báo nghiên cứu AV
  - phần mềm minh họa xe tự lái
  - giải pháp thay thế công cụ slide cho sơ đồ đường
  - bảng trắng cho nhóm xe tự lái
---

drawtonomy là một bảng trắng được xây dựng đặc biệt cho các kịch bản lái xe. Hầu hết các nhóm phác thảo những sơ đồ này hôm nay trong các công cụ vẽ thông thường hoặc slide — chúng hoạt động tốt cho các hình chung chung, nhưng chúng không biết làn đường là gì, vì vậy hình học phải được vẽ lại bất cứ khi nào con đường rẽ, giao lộ phát triển một nhánh, hoặc một vạch sang đường cần được căn với đường.

Trang này giải thích các lựa chọn thiết kế xuất phát từ việc dẫn đầu với "bảng trắng cho kịch bản lái xe" thay vì "công cụ xuất sang trình mô phỏng".

## Vấn đề mà nó được xây dựng xung quanh

Hầu hết giao tiếp thực tế về xe tự lái diễn ra qua các sơ đồ: trong bài báo, rà soát thiết kế, các cuộc họp lập kế hoạch, viết báo cáo sự cố, lớp học và slide. Sơ đồ là sản phẩm mà mọi người nhìn vào, tranh luận và ghi nhớ.

Các công cụ vẽ thông thường ở mức đó chỉ cho bạn các hình chung chung. Một làn đường là một hình chữ nhật bạn vẽ lại mỗi khi đường rẽ; một vạch sang đường là một chồng các hình chữ nhật bạn cứ phải căn chỉnh bằng tay; một giao lộ là nửa giờ tinh chỉnh. Tệ hơn, ngay khi hình học đường thay đổi — và trong công việc AV nó thay đổi liên tục — bạn bắt đầu lại từ đầu.

drawtonomy tồn tại để làm vòng lặp đó nhanh. Các khối xây dựng mà miền thực sự có — làn đường, giao lộ, vạch sang đường, đèn tín hiệu, vạch kẻ đường, phương tiện, người đi bộ — là các hình mẫu hạng nhất, vì vậy hình minh họa vẫn đúng khi bạn lặp đi lặp lại.

## Drawtonomy nằm ở đâu

Công việc kịch bản lái xe diễn ra ở vài cấp độ khác nhau:

1. **Sơ đồ.** Bài báo, slide, phác thảo bảng trắng, hình minh họa tài liệu thiết kế, tài liệu lớp học. Nhanh và dễ về nguyên tắc, nhưng trong một công cụ thông thường, hình học đường phải được dựng lại mỗi khi có thứ gì đó di chuyển.
2. **Công cụ tạo.** Trình chỉnh sửa OpenSCENARIO, trình chỉnh sửa mạng lưới đường, các gói kiểu CAD. Chính xác, chậm, đắt để học.
3. **Trình mô phỏng.** esmini, CARLA, các công cụ nội bộ. Chạy kịch bản, tạo dữ liệu.

drawtonomy sống ở cấp độ 1, và bước qua cấp độ 2 khi bạn cần: nhập một bản đồ Lanelet2, phác thảo các thay đổi, xuất OpenDRIVE/OpenSCENARIO, đưa kết quả cho esmini.

## Ưu tiên thiết kế

### Bảng-trắng-trước

Điểm so sánh là một phác thảo bảng trắng nhanh hoặc slide, không phải một công cụ CAD. Điều đó đặt ra ngưỡng cho ma sát: mở một URL, vẽ, chia sẻ. Không cài đặt, không tài khoản, không định dạng tệp dự án. Bất cứ thứ gì làm cho drawtonomy cảm thấy nặng hơn một phác thảo nhanh đều bị cắt.

### Nhận biết topology

Một con đường không phải là một túi polyline. drawtonomy mô hình hóa các kết nối làn đường (Next / Previous / Left / Right) để di chuyển một biên cập nhật các làn đường lân cận tự động. Hai làn đường chia sẻ một biên sẽ chia sẻ cùng các điểm biên — kéo một lần, cả hai di chuyển. Xem [Mô hình kết nối làn đường](/vi/explanation/lane-model/).

### Mẫu chuyên ngành lái xe

Phương tiện (sedan, bus, truck, motorcycle…), người đi bộ (walking, simple), đèn tín hiệu cho phương tiện và người đi bộ, vạch sang đường, vạch kẻ đường, biển báo, mẫu giao lộ. Chúng là các hình mẫu được tích hợp sẵn thay vì gần đúng bằng hình chữ nhật chung. Các mẫu SVG tùy chỉnh có thể được thêm vào qua PR.

### Có thể chỉnh sửa khi ra cũng như khi vào

Mọi định dạng đầu ra mà drawtonomy tạo ra giữ đủ trạng thái để có thể chỉnh sửa lại. `drawtonomy.svg` là dạng chuẩn không mất dữ liệu: một SVG bình thường hiển thị ở mọi nơi (trình duyệt, GitHub, slide, hình minh họa bài báo) và mở lại trong drawtonomy với mọi kết nối và quan hệ chồng lấp còn nguyên vẹn. Không có gì bị mắc kẹt trong một định dạng bạn không thể đọc lại.

### Headless khi cần

Mã trình xuất và trình phân tích là một phần của `@drawtonomy/sdk` và chạy mà không cần trình chỉnh sửa. Pipeline CI, tiện ích mở rộng trình duyệt và công cụ AI có thể tạo và xác thực các cảnh theo chương trình.

## Cầu nối tới phần còn lại của quy trình làm việc

Khi bạn đã có một sơ đồ, bạn thường muốn làm gì đó với nó. drawtonomy có sẵn nhiều cầu nối để hình minh họa không bị khóa bên trong trình chỉnh sửa:

- **`drawtonomy.svg`** — mặc định. Nhúng vào bài báo, slide, tài liệu Markdown; mở lại sau để tiếp tục chỉnh sửa.
- **Vòng lặp đọc/ghi Lanelet2** — mở một bản đồ Lanelet2 OSM (bao gồm bản đồ mẫu Autoware), chỉnh sửa, xuất ngược lại. Hữu ích cho phác thảo các thay đổi đối với bản đồ HD hiện có.
- **Xuất ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, có thể đóng gói tùy chọn dưới dạng zip sẵn sàng cho [esmini](https://github.com/esmini/esmini).
- **Trình tạo Cảnh AI** — mô tả kịch bản bằng ngôn ngữ tự nhiên, hoặc dán XML OpenSCENARIO, và nhận một canvas có thể chỉnh sửa để bắt đầu tinh chỉnh từ đó.

Những cầu nối này hữu ích, nhưng bản thân sơ đồ là lý do drawtonomy tồn tại. Một hình minh họa trong drawtonomy đã có giá trị như một hình minh họa; những định dạng này cho phép nó chảy vào giai đoạn tiếp theo của quy trình làm việc khi cần.

## drawtonomy không phải là gì

- **Không phải trình mô phỏng.** Nó không chạy kịch bản. Xuất sang esmini, CARLA, hoặc công cụ riêng của bạn cho việc đó.
- **Không phải công cụ CAD.** Nó không thực thi độ chính xác kỹ thuật (clothoid spline, độ nghiêng, độ cao). Hình học là 2D đơn giản.
- **Không phải bộ cộng tác thời gian thực.** Đây là trình chỉnh sửa người-dùng-đơn. Lưu, chia sẻ, mở lại.

## Xem thêm

- [Mô hình kết nối làn đường](/vi/explanation/lane-model/)
- [Kiến trúc trình xuất](/vi/explanation/exporter-architecture/)
- [Kiến trúc tiện ích mở rộng](/vi/explanation/extension-architecture/)
