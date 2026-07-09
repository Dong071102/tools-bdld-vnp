# Tool BDLD VNP (Bưu điện Lâm Đồng - VNPost)

Hệ thống tích hợp crawl dữ liệu từ Power BI và hỗ trợ định vị bưu gửi VNPost.

## 📦 Các dịch vụ trong hệ thống
1. **crawler-backend** (Python FastAPI - Cổng `8000`): Crawl dữ liệu định kỳ từ Power BI và cập nhật vào SQL Server.
2. **dinhvi-backend** (Node.js Express - Cổng `5000`): Quản lý luồng đăng nhập VNPost BCCP, giải mã captcha và xuất Excel định vị.
3. **dinhvi-frontend** (React Vite + Nginx - Cổng `80`): Giao diện web hiển thị thông tin và điều khiển tiến trình xuất dữ liệu.
4. **chrome-extension**: Tiện ích mở rộng Chrome phục vụ tích hợp trực tiếp trên trang VNPost.

---

## 🚀 Hướng dẫn deploy trên Portainer (Docker Compose Stack)

1. Truy cập Portainer -> **Stacks** -> **Add stack**.
2. Đặt tên stack là: `tool-bdld-vnp`.
3. Chọn phương thức **Web editor** và copy toàn bộ nội dung file `docker-compose.yml` trong repository này dán vào.
4. Cuộn xuống phần **Environment variables** và thêm các biến môi trường cấu hình kết nối SQL Server như dưới đây:

### 🔑 Các biến môi trường cần thiết (Environment Variables)

| Tên biến | Giá trị mặc định | Mô tả |
| :--- | :--- | :--- |
| **`DB_SERVER`** | *(Bắt buộc)* | IP hoặc Hostname của SQL Server (Ví dụ: `10.61.202.116`) |
| **`DB_USER`** | *(Bắt buộc)* | Tài khoản SQL Server (Ví dụ: `sa`) |
| **`DB_PASSWORD`** | *(Bắt buộc)* | Mật khẩu SQL Server (Ví dụ: `Sadmin123`) |
| **`DB_NAME`** | `caw_powerbi_db` | Tên database trong SQL Server dùng chung cho cả 2 backend |
| **`DB_PORT`** | `1433` | Port kết nối SQL Server |
| **`JWT_SECRET`** | `vnpost-excel-exporter-jwt-secret-key-2026-dynamic-secure` | Khóa bảo mật JWT Token |
| **`CRAWLER_PORT`** | `8000` | Port ngoài của Dashboard Crawl dữ liệu |
| **`DINHVI_BACKEND_PORT`** | `5000` | Port ngoài của Node.js Backend |
| **`DINHVI_FRONTEND_PORT`** | `80` | Port ngoài của Giao diện Định vị |

5. Nhấn **Deploy the stack** để khởi chạy hệ thống.

---

## 🤖 CI/CD với GitHub Actions

Mỗi khi bạn đẩy code lên nhánh `main` hoặc `master`, GitHub Actions tự động build và push các Docker images lên **GitHub Container Registry (GHCR)** dưới dạng gói public/private:

* `ghcr.io/dong071102/tool-bdld-vnp-crawler-backend:latest`
* `ghcr.io/dong071102/tool-bdld-vnp-dinhvi-backend:latest`
* `ghcr.io/dong071102/tool-bdld-vnp-dinhvi-frontend:latest`

Bạn có thể chỉnh sửa `docker-compose.yml` trên Portainer để kéo trực tiếp các image đã build sẵn này từ GHCR thay vì build local từ source code, giúp quá trình deploy trên Portainer nhẹ hơn và nhanh hơn.
