# Tool BDLD VNP (Bưu điện Lâm Đồng - VNPost)

Hệ thống tích hợp tự động crawl dữ liệu tồn đọng từ Power BI và thực hiện tra cứu định vị bưu gửi hàng loạt qua VNPost BCCP bằng cơ chế đa luồng.

---

## 📂 1. Cấu trúc thư mục dự án

```text
tools-bdld-vnp/
├── crawler-backend/             # Python Backend (Crawl dữ liệu từ Power BI & Phục vụ giao diện UI gộp)
│   ├── frontend/                # Mã nguồn trang Dashboard UI gộp (Dashboard + Định vị)
│   ├── database.py              # Xử lý kết nối và các câu lệnh SQL Server (live/staging)
│   ├── main.py                  # API Server (FastAPI), phân quyền & quản lý tài khoản
│   ├── pbi_crawler.py           # Kịch bản giả lập crawl dữ liệu từ Power BI
│   ├── requirements.txt         # Các thư viện Python cần thiết
│   └── Dockerfile               # Cấu hình đóng gói Docker cho crawler
│
├── dinhvi-backend/              # Node.js Backend (Xử lý kết nối VNPost & xuất định vị)
│   ├── database.js              # Khởi tạo kết nối SQL Server & quản trị bảng dữ liệu
│   ├── excel-helper.js          # Xử lý phân tích và gộp dữ liệu Excel
│   ├── vnpost-client.js         # API client kết nối VNPost (login, fetch chi tiết bưu gửi)
│   ├── server.js                # API Server (Express) điều phối đa luồng định vị
│   └── Dockerfile               # Cấu hình đóng gói Docker cho dinhvi-backend
│
├── docker-compose.yml           # File deploy Stack Portainer cho toàn bộ hệ thống
└── README.md                    # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## ⚙️ 2. Các hoạt động chính của hệ thống

### 🔄 A. Tiến trình Crawl dữ liệu tự động (Python)
1. **Lịch trình tự động:** Cứ mỗi **10 phút**, một thread chạy ngầm sẽ tự động kích hoạt `pbi_crawler.py`.
2. **Thu thập dữ liệu:** Kịch bản thực hiện tải file nén dữ liệu từ Power BI của VNPost Lâm Đồng, giải nén và làm sạch.
3. **Thay thế dữ liệu trực tiếp:**
   * Hệ thống thực hiện lệnh `TRUNCATE TABLE detailed_report_staging` để xóa sạch dữ liệu cũ.
   * Lọc trùng lặp mã bưu gửi (`item_code`) nhằm tránh lỗi vi phạm khóa chính.
   * Chèn dữ liệu mới vào bảng tạm staging. Bảng staging này chính là nguồn dữ liệu thời gian thực được hiển thị trực tiếp lên Dashboard.

### 🔑 B. Xác thực VNPost & Quản lý Đa luồng (Node.js)
1. **Lấy Captcha:** Khi truy cập trang Đăng nhập hoặc trang Phiên, hệ thống gọi API để lấy captcha trực tiếp từ máy chủ VNPost BCCP.
2. **Đăng nhập tích hợp:**
   * **Đăng nhập lần đầu:** Người dùng nhập tài khoản, mật khẩu BCCP và giải captcha. Hệ thống xác thực với VNPost. Nếu thành công, mật khẩu sẽ được mã hóa bcrypt và lưu vào cơ sở dữ liệu SQL Server, đồng thời kích hoạt **Luồng 1 (Luồng 0 trong DB)**.
   * **Đăng nhập thông thường:** Hệ thống đối chiếu mật khẩu cục bộ qua bcrypt. Đồng thời, tận dụng mã captcha bạn vừa nhập để tự động làm mới trạng thái kết nối của Luồng chính (Luồng 1), tránh lãng phí captcha.
3. **Mở rộng luồng (Tối đa 5 luồng):** Người dùng giải thêm captcha trong giao diện để mở thêm các luồng (Luồng 2 -> 5). Các luồng này lưu cookie VNPost riêng biệt giúp tải song song dữ liệu định vị nhanh gấp 5 lần.

### 📦 C. Tiến trình tra cứu định vị hàng loạt
1. **Nhận danh sách:** Node.js nhận danh sách mã bưu gửi (từ nhập tay, copy-paste hoặc file import trên giao diện web).
2. **Chia lô (Batching):** Danh sách được chia thành các lô nhỏ (mỗi lô 500 mã).
3. **Phân phối song song:** Các lô được phân phối song song cho các luồng đang hoạt động (`active`). Nếu một luồng bị lỗi hoặc hết hạn cookie, hệ thống sẽ tự chuyển lô sang luồng khác hoặc thông báo để người dùng giải captcha khôi phục luồng đó.
4. **Gộp Excel:** Dữ liệu tải về từ VNPost được lưu trữ tạm thời, phân tích và tự động gộp lại thành 1 file báo cáo Excel duy nhất trả về cho người dùng.

---

## 🌐 3. Danh sách các API Endpoints

### 🐍 Python Backend (FastAPI - Cổng `8000` / Giao diện gộp cổng `9999`)

#### 📊 Dashboard & Crawl
* `GET /api/status`: Lấy trạng thái hoạt động của crawler (đang chạy, thời gian chạy gần nhất, kết quả).
* `POST /api/trigger-crawl`: Yêu cầu kích hoạt crawl dữ liệu Power BI ngay lập tức.
* `GET /api/filters`: Lấy danh sách dropdown (Đơn vị, Trạng thái, Loại tồn) từ bảng staging.
* `GET /api/summary`: Lấy thông tin KPI tổng hợp (Tổng số lượng, Tổng COD, Tổng khối lượng) và bảng Pivot Matrix của Lâm Đồng.
* `GET /api/detailed`: Lấy danh sách bưu gửi tồn đọng chi tiết (hỗ trợ tìm kiếm, phân trang, lọc, sắp xếp).
* `GET /api/export`: Xuất danh sách bưu gửi tồn đọng chi tiết ra file Excel.

#### 🔐 Xác thực & Quản trị tài khoản
* `GET /api/auth/login-captcha`: Proxy lấy captcha đăng nhập từ Node.js backend.
* `POST /api/auth/login`: Đăng nhập hệ thống (xác thực local hoặc VNPost + kích hoạt luồng 1).
* `GET /api/auth/me`: Lấy thông tin tài khoản hiện đang đăng nhập.
* `POST /api/user/settings`: Cập nhật mật khẩu cá nhân hoặc thay đổi cấu hình tài khoản VNPost.
* `GET /api/admin/users` *(Admin)*: Danh sách tất cả tài khoản quản lý.
* `POST /api/admin/users` *(Admin)*: Tạo tài khoản mới.
* `PUT /api/admin/users/{user_id}` *(Admin)*: Cập nhật thông tin/quyền hạn/số luồng của tài khoản.
* `DELETE /api/admin/users/{user_id}` *(Admin)*: Xóa tài khoản người dùng khỏi hệ thống.
* `POST /api/admin/import-users` *(Admin)*: Nhập hàng loạt tài khoản từ danh sách Copy-Paste của BCCP.

---

### 🟢 Node.js Backend (Express - Cổng `5000` nội bộ)

#### 🔑 Đăng nhập VNPost
* `GET /api/auth/login-captcha`: Lấy Captcha và các cookie ban đầu từ trang Login VNPost BCCP.
* `POST /api/auth/login`: Xác thực tài khoản với VNPost qua Captcha, lưu cookie và trả về thông tin phiên.

#### 🧵 Quản lý luồng kết nối (Sessions)
* `GET /api/vnpost/sessions`: Lấy số lượng luồng kết nối hiện tại và giới hạn luồng tối đa của tài khoản.
* `GET /api/vnpost/session-captcha`: Lấy captcha phục vụ việc khởi tạo thêm luồng mới.
* `POST /api/vnpost/add-session`: Gửi captcha giải được để khởi tạo thêm luồng phiên mới.
* `POST /api/vnpost/reset-sessions`: Hủy bỏ các luồng phụ, đặt lại số lượng luồng hoạt động về 1.
* `GET /api/vnpost/sessions-status`: Kiểm tra trạng thái hoạt động thực tế của từng luồng (Gọi trực tiếp VNPost).
* `POST /api/vnpost/refresh-session`: Sử dụng captcha để kết nối lại một luồng đã bị hết hạn cookie.

#### 📥 Tra cứu & Xuất dữ liệu
* `POST /api/export`: Nhận danh sách mã gửi, chia lô và tải định vị đa luồng song song, trả về file gộp Excel hoàn chỉnh.

---

## 🚀 Hướng dẫn deploy trên Portainer (Docker Compose Stack)

Sử dụng file `docker-compose.yml` trong repository này để triển khai. Toàn bộ kết nối SQL Server đã được gán mặc định trong cấu hình:
*   IP: `10.61.202.116`
*   User: `sa`
*   Password: `Sadmin123`
*   Database: `caw_powerbi_db`
*   Frontend gộp được mở duy nhất ở cổng **`9999`**.
