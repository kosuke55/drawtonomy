---
title: Giới thiệu — bảng trắng cho kịch bản lái xe
description: drawtonomy là bảng trắng miễn phí dựa trên trình duyệt cho kịch bản lái xe. Phác thảo làn đường, giao lộ, phương tiện và người đi bộ cho bài báo, slide, thảo luận thiết kế và tạo kịch bản. Xuất sang OpenDRIVE, OpenSCENARIO và Lanelet2.
sidebar:
  label: Giới thiệu
  order: 1
keywords:
  - bảng trắng cho kịch bản lái xe
  - công cụ vẽ sơ đồ kịch bản lái xe
  - công cụ vẽ sơ đồ xe tự lái
  - hình ảnh xe tự lái cho bài báo
  - hình ảnh xe tự lái cho thuyết trình
  - vẽ kịch bản xe tự lái trực tuyến
  - công cụ phác thảo kịch bản giao thông
  - trình chỉnh sửa sơ đồ làn đường trên trình duyệt
  - sơ đồ kịch bản cho rà soát thiết kế
  - bảng trắng cho nhóm xe tự lái
  - drawtonomy là gì
---

drawtonomy là một bảng trắng cho kịch bản lái xe. Loại hình minh họa bạn đưa vào bài báo, slide bạn phác thảo trước buổi rà soát thiết kế, sơ đồ bạn vẽ trên cuộc gọi khi đang giải thích một trường hợp đặc biệt cho phần còn lại của nhóm, hoặc cảnh bạn phác thảo trước khi viết tệp OpenSCENARIO.

Làn đường, giao lộ, phương tiện, người đi bộ, đèn tín hiệu, vạch kẻ đường và vạch sang đường là các hình mẫu được tích hợp sẵn. Làn đường nhận biết topology — chúng mang các kết nối Next / Previous / Left / Right — vì vậy sơ đồ là một mạng lưới bạn có thể chỉnh sửa, không phải một bức tranh bạn vẽ lại mỗi khi hình học đường thay đổi.

Ứng dụng nằm tại [drawtonomy.com](https://drawtonomy.com). SDK, tiện ích mở rộng và mã nguồn của trang tài liệu này nằm trên [GitHub](https://github.com/kosuke55/drawtonomy).

## Người dùng dùng để làm gì

- **Hình minh họa cho bài báo, luận văn và báo cáo kỹ thuật.** Đầu ra vector (`drawtonomy.svg`, PDF, EPS) nhúng gọn gàng vào LaTeX, Markdown và slide.
- **Slide và bài thuyết trình.** Sơ đồ về thao tác chuyển làn, giao lộ, trường hợp bị che khuất và các kịch bản lái xe khác — vẽ trong vài giây thay vì vài phút cho mỗi hình.
- **Thảo luận thiết kế và thuật toán.** Một bề mặt phác thảo dùng chung để bàn về hành vi lái xe, các trường hợp biên và lập luận an toàn với đồng đội.
- **Tạo kịch bản.** Phác thảo cảnh trước khi viết XML OpenSCENARIO, hoặc nhập tệp `.xosc` hiện có và chỉnh sửa trực quan.
- **Chú thích bản đồ và ROS.** Vẽ làn đường lên trên nền ảnh vệ tinh, chỉnh sửa bản đồ Lanelet2 OSM, hoặc chú thích lưới chiếm dụng ROS với đường đi và chướng ngại vật.

## Dành cho ai

- **Kỹ sư xe tự lái và ADAS** vẽ sơ đồ cho tài liệu nội bộ, rà soát thiết kế và viết báo cáo sự cố.
- **Nhà nghiên cứu và sinh viên AV** tạo hình minh họa cho bài báo, luận văn và bài nói chuyện hội nghị.
- **Người tạo kịch bản** làm việc với các trình mô phỏng như [esmini](https://github.com/esmini/esmini), CARLA hoặc các công cụ nội bộ.
- **Người dùng bản đồ HD và Lanelet2** phác thảo các thay đổi đối với mạng lưới đường hiện có.
- **Nhóm ROS và robotics** vẽ trên lưới chiếm dụng được tạo bằng nav2, Cartographer hoặc Gmapping.
- **Giảng viên và nhà giáo dục lái xe** tạo sơ đồ cho tài liệu giảng dạy.
- **Người xây dựng công cụ** mở rộng trình chỉnh sửa với các trình xuất, trình nhập hoặc tính năng có sự hỗ trợ của AI mới thông qua [SDK tiện ích mở rộng](/vi/extend/).

## Cách tổ chức tài liệu này

Trang web tuân theo cách chia [Diátaxis](https://diataxis.fr/). Hãy chọn phần phù hợp với điều bạn đang làm.

| Phần | Khi nào nên đọc |
|---|---|
| [Hướng dẫn từng bước](/vi/tutorials/) | Bạn mới và muốn học bằng cách làm. |
| [Hướng dẫn thực hành](/vi/guides/) | Bạn biết mục tiêu cần đạt và cần các bước thực hiện. |
| [Tham khảo](/vi/reference/) | Bạn cần tra cứu một thông tin chính xác — phím tắt, định dạng, API. |
| [Giải thích](/vi/explanation/) | Bạn muốn hiểu vì sao drawtonomy hoạt động theo cách này. |
| [Mở rộng drawtonomy](/vi/extend/) | Bạn đang xây dựng trên drawtonomy. |

Nếu bạn không biết bắt đầu từ đâu, [Bắt đầu nhanh](/vi/start/quickstart/) chỉ mất năm phút từ canvas trống đến cảnh đã xuất.
