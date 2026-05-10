---
title: Snap & chia sẻ điểm
description: Hai cơ chế liên quan nhưng khác nhau để giữ các hình mẫu được căn chỉnh.
---

Snap và chia sẻ điểm cả hai đều xử lý "điểm này nằm trên thứ kia." Chúng trông giống nhau trong UI, nhưng chúng có hậu quả khác nhau. Trộn lẫn chúng là nguồn gốc phổ biến nhất của các lỗi "vì sao các hình mẫu của tôi trôi đi?"

## Snap = cùng tọa độ

Snap di chuyển con trỏ của bạn (hoặc một đỉnh bạn đang kéo) để hạ xuống một mục tiêu hiện có. Kết quả là hai điểm riêng biệt *tình cờ* chia sẻ tọa độ.

Di chuyển mục tiêu gốc sau này và điểm được snap của bạn không theo. Chúng chưa bao giờ được liên kết.

Đây là điều bạn muốn khi bạn đang phác thảo: căn chỉnh chính xác, không có sự ghép nối ẩn.

## Chia sẻ = cùng danh tính

Một điểm dùng chung là một đối tượng được tham chiếu bởi nhiều hình mẫu. Di chuyển nó một lần, mọi hình mẫu giữ tham chiếu di chuyển cùng nó.

Bạn tạo các điểm dùng chung bằng cách giữ <kbd>Alt</kbd> khi nhấp, hoặc bằng cách kéo một đỉnh lên một đỉnh hiện có ở chế độ chỉnh sửa đoạn.

Đây là điều bạn muốn cho các biên không bao giờ được tách ra — hai cạnh làn đường liền kề, hai góc polygon cần ở lại được hàn lại với nhau, điểm cuối của một path và điểm đầu của một path khác.

## Vì sao phân biệt

Nếu hai cạnh hình mẫu nên là cùng một thứ thực sự là hai điểm được snap, hãy kéo một trong số chúng, xuất sang OpenDRIVE, và mạng lưới đường mở ra tại đỉnh đó. Trình mô phỏng có thể diễn giải khoảng trống là một sự gián đoạn, hoặc bôi qua nó tùy thuộc vào công cụ.

Các hàng xóm Left/Right của Lane chia sẻ một biên luôn sử dụng các điểm dùng chung nội bộ — điều đó không phải là tùy chọn và không do người dùng kiểm soát. Đối với các hình mẫu tùy ý (Linestring, Polygon, Path), lựa chọn là tùy bạn.

## Tín hiệu trực quan

- Một mục tiêu snap hiển thị một handle được làm nổi bật đơn lẻ và kéo con trỏ.
- Một điểm dùng chung hiển thị dưới dạng handle nhân đôi ở chế độ chỉnh sửa đoạn.

## Xem thêm

- [Snap vào hình học hiện có](/vi/guides/snap/)
- [Chia sẻ điểm giữa các hình mẫu](/vi/guides/point-sharing/)
