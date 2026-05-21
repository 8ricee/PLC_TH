# Quy trình Thiết lập và Hiệu chuẩn Hệ thống Weigh Feeder (Chuẩn 6 Giai đoạn)

Tài liệu này trình bày quy trình chuẩn hóa từ kiểm tra phần cứng đến hiệu chỉnh thực tế, đảm bảo hệ thống cân băng định lượng hoạt động với độ chính xác cao nhất.

---

## Giai đoạn 1: Kiểm tra Cơ khí và Cảm biến (Hardware Audit)

Trước khi cấp nguồn và cài đặt, cần đảm bảo nền tảng vật lý hoàn hảo.

1.  **Kiểm tra Loadcell (mV Test):**
    *   Truy cập menu `MU-CEL` trên W100 (Giữ phím **PRINT** 3 giây).
    *   Trạng thái chuẩn: **0 đến ±0.5 mV** khi không tải.
    *   Thử nghiệm: Ấn nhẹ tay lên bàn cân, giá trị mV phải tăng dần đều và ổn định. Nếu số nhảy loạn, kiểm tra lại dây shield và mối nối.
2.  **Kiểm tra Encoder:**
    *   Đảm bảo khớp nối encoder với trục rulo chắc chắn, không bị rơ/trượt.
    *   Kiểm tra đèn tín hiệu trên Encoder khi quay rulo bằng tay.
3.  **Kiểm tra Cơ khí bàn cân:**
    *   Đảm bảo không có vật cản, bụi bẩn kẹt giữa bàn cân và khung cố định.
    *   Các con lăn (rollers) vùng cân phải quay trơn tru.

---

## Giai đoạn 2: Cấu hình và Hiệu chuẩn Tĩnh W100 (Static Setup)

Biến hệ thống thành một cái cân tĩnh chính xác trước khi tính đến các yếu tố động.

### 2.1. Thiết lập Thông số Gốc (Menu BASE)
1.  **`CAPAC`**: Nhập **100.00** (Tải trọng max của Loadcell).
2.  **`dIVIS`**: Chọn **0.01** hoặc **0.02** (Độ phân giải).
3.  **`UnIt`**: Chọn **kg**.

### 2.2. Hiệu chuẩn Tĩnh (Menu CALIB)
1.  **Zero Calibration (`2ErO`):** Thực hiện khi bàn cân trống hoàn toàn và băng tải đứng yên. Chọn `yES` để xác nhận điểm 0 tĩnh.
2.  **Span Calibration (`REAl`):** 
    *   Đặt quả cân mẫu chính xác (nên dùng >= 50kg) lên bàn cân.
    *   Nhập đúng khối lượng quả cân vào màn hình và nhấn **ENTER**.
    *   *Mục tiêu:* Màn hình W100 phải hiển thị đúng khối lượng quả cân đang đặt.

---

## Giai đoạn 3: Đồng bộ Tín hiệu Analog và PLC (Integration)

Kết nối thông tin giữa đầu cân và bộ não PLC.

### 3.1. Cấu hình Ngõ ra Analog (Menu AnALOG)
1.  **`MOdE`**: Chọn **`nEt`** (Chỉ xuất khối lượng vật liệu, không bao gồm khung cân).
2.  **`tYPE`**: Chọn **`4-20`** (mA).
3.  **`AnA 0`**: Nhập **0.00** kg (Tương ứng với 4mA).
4.  **`AnA FS`**: Nhập **80.00** kg (Tải trọng vật liệu tối đa cho phép trên Loadcell 100kg).
5.  **Lưu cài đặt:** Thoát menu và chọn **`StOrE? -> yES`**.

### 3.2. Quy đổi trong PLC (Scaling Logic)
Sử dụng dải đo tương ứng với cài đặt trên W100:
$$\text{Khối lượng tức thời (kg)} = \frac{\text{Raw Input (0-27648)}}{27648} \times \text{AnA FS (80kg)}$$

---

## Giai đoạn 4: Hiệu chuẩn Tốc độ và Encoder (Speed Calib)

Tốc độ sai sẽ dẫn đến lưu lượng sai, dù cân có chính xác đến đâu.

1.  **Xác nhận đường kính Rulo (`WheelDiameter`):** Đo thực tế đường kính rulo (bao gồm cả lớp cao su bọc nếu có). Lưu ý cộng thêm độ dày băng tải để có đường kính hiệu dụng:
    $$D_{hiệu\_dụng} = D_{rulo\_sắt} + \text{Độ dày băng tải}$$
    *Ví dụ: Rulo 75mm, băng dày 0.9mm -> Cài đặt 75.9mm.*
2.  **Kiểm tra thực tế:**
    *   Đánh dấu một điểm trên băng tải.
    *   Chạy băng tải và dùng thước dây đo quãng đường thực tế $L_{thực}$ sau 10 vòng.
    *   So sánh với quãng đường $L_{PLC}$ hiển thị trên HMI.
3.  **Công thức tính từ xung thực tế:** Nếu bạn đếm được $P$ xung khi chạy quãng đường $L$ (mm), đường kính cài đặt sẽ là:
    $$D = \frac{L \times PPR}{P \times \pi}$$
    *(PPR là số xung/vòng của Encoder).*
4.  **Hiệu chỉnh:** $D_{mới} = D_{cũ} \times \frac{L_{thực}}{L_{PLC}}.$

---

## Giai đoạn 5: Hiệu chuẩn Động Hệ thống (Dynamic Calib)

Giai đoạn quan trọng nhất để bù đắp các sai số vật lý khi vận hành.

### 5.1. Hiệu chuẩn Zero Động (Dynamic Zero)
Loại bỏ ảnh hưởng của trọng lượng dây băng và lực căng khi băng tải đang quay.
1.  Cho băng tải chạy không tải ở tốc độ định mức.
2.  Kích hoạt `Cmd_SetZero` trên PLC. 
3.  PLC lấy mẫu trong ít nhất 1 vòng băng hoàn chỉnh (hoặc 30-60 giây) và lưu vào `Saved_RawZero`.

### 5.2. Hiệu chỉnh Hệ số K (Factor K)
Bù đắp sai số do va đập vật liệu và độ cứng của băng tải.
1.  Chạy một mẻ vật liệu thực tế với khối lượng biết trước (đã qua cân kiểm chứng) $W_{đối\_chứng}$.
2.  Ghi lại khối lượng tổng cộng PLC đo được $W_{PLC}$.
3.  Tính toán: $K_{mới} = K_{hiện\_tại} \times \frac{W_{đối\_chứng}}{W_{PLC}}$.
    > [!IMPORTANT]
    > Thông thường hệ số K sau khi hiệu chuẩn Span tốt sẽ nằm trong khoảng **0.95 - 1.05**.

---

## Giai đoạn 6: Giám sát và Bảo trì (Monitoring)

1.  **Cảnh báo quá tải:** Thiết lập mức dừng khẩn cấp khi khối lượng đạt > 95kg (gần ngưỡng loadcell 100kg).
2.  **Vệ sinh định kỳ:** 
    *   Vệ sinh rulo chủ động để tránh vật liệu bám làm thay đổi đường kính.
    *   Kiểm tra máng đổ liệu không được chạm/tỳ vào phần di động của bàn cân.
3.  **Lịch Zero:** Thực hiện Zero Động (5.1) ít nhất một lần mỗi ngày.
