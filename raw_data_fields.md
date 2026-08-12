# Từ điển Dữ liệu (Data Dictionary) - Hệ thống PowerBI VNPost

Dưới đây là danh sách toàn bộ các trường dữ liệu (fields/columns) có sẵn trong dữ liệu thô (raw data) của mô hình PowerBI (các bảng `ItemStock` và `ItemStock_Collection`), kèm theo giải thích ý nghĩa tiếng Việt.

## 1. Thông tin Bưu gửi (Đơn hàng)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `ItemCode` | Mã bưu gửi (Mã vận đơn) |
| `ServiceCode` | Mã dịch vụ (vd: EMS, Bưu phẩm đảm bảo, CP...) |
| `ProductCode` | Mã sản phẩm |
| `LoaiSP` | Loại sản phẩm |
| `Weight` | Trọng lượng bưu gửi (thường tính bằng gram) |
| `TL_2` | Trọng lượng (chuẩn hóa/tính toán lại) |
| `Nhom_Trong_Luong`<br>`Nhom_Trong_Luong_2` | Phân nhóm trọng lượng (vd: Dưới 2kg, Từ 2-5kg...) |
| `CODAmount` | Số tiền thu hộ (COD) |
| `COD_1` | Phân nhóm/Mức tiền COD |
| `Total_Cod` | Tổng tiền COD (trường tính toán/measure) |

## 2. Trạng thái & Xử lý (Status)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `Status` | Mã trạng thái hiện tại |
| `StatusName` | Tên trạng thái hiện tại (vd: "Đã đến bưu cục", "Phát không thành công"...) |
| `CauseName` | Nguyên nhân (vd: "Khách hàng đi vắng", "Sai địa chỉ"...) |
| `SolutionName` | Hướng xử lý tiếp theo (vd: "Phát lại", "Chờ xin ý kiến", "Hoàn"...) |
| `DK1` | Điều kiện 1 (Trạng thái rút gọn hoặc phân nhóm trạng thái phục vụ thống kê) |
| `DK2` | Điều kiện 2 |
| `Ghép` | Tình trạng ghép chuyến/đóng túi |

## 3. Hành trình & Địa điểm (Location)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| **Hiện tại (Current):** | |
| `POSCode` | Mã bưu cục hiện tại (nơi bưu gửi đang nằm) |
| `POSName` | Tên bưu cục hiện tại |
| `POSName_QuyChuan` | Tên bưu cục hiện tại (đã được chuẩn hóa tên gọi) |
| `ProvinceCode` | Mã Tỉnh/Thành phố hiện tại |
| `ProvinceName` | Tên Tỉnh/Thành phố hiện tại |
| `Tỉnh Tồn`<br>`Tỉnh Tồn_tách TTKD`<br>`Tên Tỉnh Ver 2`<br>`Tỉnh Tồn_34` | Các trường lưu tên tỉnh thành phục vụ cho việc lọc/tách dữ liệu theo khu vực hoặc TTKD |
| **Nơi Gửi (Acceptance):** | |
| `AcceptancePosCode` | Mã bưu cục nhận (nơi khách hàng gửi) |
| `AcceptancePosName` | Tên bưu cục nhận |
| `AcceptanceProvinceCode` | Mã tỉnh nhận (nơi gửi) |
| **Nơi Phát (Delivery):** | |
| `DeliveryPosCode` | Mã bưu cục phát (nơi giao hàng) |
| `DeliveryPosName` | Tên bưu cục phát |
| `DeliveryProvinceCode` | Mã tỉnh phát (nơi nhận) |
| `DeliveryProvinceName` | Tên tỉnh phát |

## 4. Thời gian & Vận hành (Time & Operations)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `SendingTime` | Thời gian khách hàng bắt đầu gửi |
| `TraceDate` | Ngày giờ cập nhật trạng thái gần nhất của bưu gửi |
| `NgayDieuTin` | Ngày giờ điều tin (phân công) cho bưu tá |
| `LastUpdatedTime` | Thời gian bản ghi được cập nhật cuối cùng lên hệ thống PBI |
| `update_date` | Ngày cập nhật dữ liệu báo cáo |
| `Date_load` | Ngày tải dữ liệu vào kho (Data Warehouse) |
| `TMS_QX_BC`<br>`TMS_QX_BCKTT`<br>`XND_BCKTT`<br>`TMS_QL_BC`<br>`TMS_QL_BCKT` | Các mốc thời gian liên quan đến hệ thống quản lý vận tải (TMS) và Xác nhận đến (XND) tại Bưu cục/Trung tâm khai thác. |
| `Buoi_Trong_Ngay` | Phân loại theo buổi (Sáng, Chiều, Tối) |
| `Khung_30_Phut_Hien_Thi` | Khung thời gian 30 phút (dùng để vẽ biểu đồ lượng việc) |
| `NewDate`, `Newdate_1`,<br>`NewDateTMS`, `NewDate_H`... | Các trường thời gian đã được chuẩn hóa định dạng (format) để PowerBI dễ tính toán. |

## 5. Thời gian Tồn đọng (Stock/Aging)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `DayStock` | Số ngày tồn (dạng text hoặc cờ) |
| `Time Tồn`<br>`Time Tồn_1`<br>`Time Tồn_3` | Thời gian tồn đọng của bưu gửi (tính bằng giờ hoặc ngày) |
| `Time_Ton_2_Loại_Trừ_BĐ` | Thời gian tồn sau khi đã loại trừ các nguyên nhân/thời gian nghỉ khách quan thuộc về Bưu điện. |
| `Tồn ≥3 ngày`<br>`Tồn ≥7 ngày`<br>`Tồn ≥14 ngày` | Các trường đánh dấu/đếm số lượng bưu gửi tồn đọng vượt quá các mốc thời gian quy định. |

## 6. Thông tin Khách hàng & Nhân sự (People)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `CustomerCode` | Mã khách hàng |
| `CustomerName` | Tên khách hàng |
| `CMSCode` | Mã trên hệ thống quản lý khách hàng (CMS) |
| `PhanLoaiKH` | Phân loại tập khách hàng (ví dụ: Khách VIP, Khách lẻ...) |
| `Nhóm_KH` | Nhóm khách hàng |
| `PostManCode` | Mã bưu tá (người đang giữ hoặc được phân công tuyến) |
| `PostManName` | Tên bưu tá |

## 7. Phân tích & Hiển thị (Analytics & UI)
| Tên trường (Field Name) | Giải thích (Description) |
| :--- | :--- |
| `Màu Cột Matrix`<br>`Màu Cột Matrix_1`<br>`Màu Cột Matrix_2`... | Mã màu (Color Code) dùng để tô màu hiển thị cảnh báo (Đỏ, Vàng, Xanh) trên bảng Dashboard của PowerBI. |
| `PTC Category`<br>`PTC Category_1`... | Phân loại nhóm Phát/Trung tâm khai thác (PTC). |
| `Hướng` / `Loại Hướng_1` | Phân loại hướng di chuyển của bưu gửi. |
| `Check_TTKT` | Cờ (Flag) kiểm tra xem bưu gửi có đang ở Trung tâm khai thác (TTKT) hay không. |
| `Sort`, `Sort_1`, `Sort_2`... | Các trường đánh số thứ tự để sắp xếp danh sách, biểu đồ trên PowerBI. |
