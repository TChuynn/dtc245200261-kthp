# HỆ THỐNG ĐIỂM DANH NHÂN VIÊN (GIAI ĐOẠN 1/3)
**Môn học:** Triển khai và Quản trị Hệ thống Phần mềm  
**Đề bài:** Đề 27 - Hệ thống Điểm danh Nhân viên chạy hoàn toàn bằng Docker Compose

---

## 1. Công Nghệ và Kiến Trúc (Tech Stack)

- **Ứng dụng Web:** Node.js 20 LTS + Express.js + EJS Server-Side Rendering (không SPA, không bước build front-end).
- **Cơ sở dữ liệu:** MySQL 8.4 LTS (Múi giờ `Asia/Ho_Chi_Minh` / `+07:00`, mã hóa chuẩn `utf8mb4_unicode_ci`).
- **Quản trị CSDL:** phpMyAdmin 5.2.3 (Chỉ bind tại máy cục bộ `127.0.0.1:8081`).
- **Reverse Proxy & Bảo mật:** Nginx (HTTPS/TLS 1.2/1.3, Rate Limiting, Security Headers, JSON Access Logs).
- **Khởi tạo chứng chỉ tự động:** Service `cert-gen` (Alpine Linux + OpenSSL) chạy 1 lần tự sinh chứng chỉ TLS tự ký vào volume dùng chung.

---

## 2. Cấu Trúc Thư Mục Dự Án

```text
.
├── .env.example             # Mẫu biến môi trường an toàn
├── .env                     # Biến môi trường thực tế (không commit git)
├── .gitignore               # Bỏ qua node_modules, .env, certs, log
├── docker-compose.yml       # Điều phối toàn bộ cụm dịch vụ và mạng nội bộ
├── README.md                # Tài liệu hướng dẫn và báo cáo kỹ thuật
├── nginx/
│   ├── Dockerfile           # Nginx Image chạy non-root (user: nginx)
│   └── nginx.conf           # Cấu hình SSL, 301 redirect, CSP, rate limit, JSON log
└── app/
    ├── .dockerignore        # Bỏ qua file tạm khi build Docker image
    ├── Dockerfile           # Multi-stage build, non-root user (node), production only
    ├── package.json         # Danh sách thư viện Node.js tối giản
    ├── db/
    │   ├── schema.sql       # CSDL 4 bảng: users, shifts, shift_assignments, attendance_logs
    │   ├── 02_permissions.sql # Phân quyền tối thiểu cho app, chặn root từ xa
    │   └── seed.js          # Dữ liệu mẫu: 1 admin, 10 nhân viên, 3 ca, 30 ngày lịch sử
    ├── public/
    │   └── style.css        # CSS giao diện thực dụng, hiện đại, không dùng thư viện ngoài
    ├── src/
    │   ├── db.js            # MySQL Pool (utf8mb4, dateStrings, auto-seed)
    │   ├── logger.js        # Ghi log JSON chuẩn stdout (time, level, event, user_id, ...)
    │   ├── server.js        # Express Server, Trust Proxy, Session, CSRF, Healthz
    │   ├── middleware/      # Kiểm tra phiên auth.js, chống CSRF csrf.js
    │   ├── routes/          # Định tuyến auth.js, staff.js, admin.js
    │   └── utils/time.js    # Tiện ích thời gian chuẩn múi giờ Asia/Ho_Chi_Minh
    └── views/               # Giao diện EJS (login, staff, admin, partials)
```

---

## 3. Các Biện Pháp Bảo Mật Được Áp Dụng

1. **Bảo mật Ứng dụng (Application Security):**
   - Mật khẩu băm an toàn bằng **bcrypt** (salt rounds = 10).
   - Cookie phiên làm việc: cờ `httpOnly: true`, `secure: true` (khi chạy qua HTTPS), `sameSite: 'lax'`, thời hạn 8 giờ.
   - **Chống tấn công CSRF:** Middleware kiểm tra token bảo mật ở mọi thao tác POST/PUT/DELETE.
   - **Prepared Statement:** Toàn bộ truy vấn SQL đều dùng tham số hóa `?` thông qua `mysql2/promise` để loại trừ triệt để SQL Injection.
   - **Ẩn chi tiết lỗi:** Xử lý lỗi 404 và 500 bằng trang thông báo thân thiện, không làm lộ stack trace nội bộ của server.
   - **Trust Proxy:** Cấu hình `app.set('trust proxy', 1)` để nhận diện đúng IP client và giao thức HTTPS từ Nginx.

2. **Bảo mật Vận hành Container (Container Hardening):**
   - **Non-root:**
     - Ứng dụng Node.js chạy bằng user `node` (UID 1000).
     - Nginx chạy bằng user `nginx` (UID 101).
   - **Đặc quyền tối thiểu:**
     - `no-new-privileges: true` trên toàn bộ container.
     - `cap_drop: [ALL]` áp dụng cho mọi dịch vụ. Nginx chỉ cấp thêm `NET_BIND_SERVICE` để mở cổng 80/443.
     - `read_only: true` cho filesystem của `app` và `nginx`, các thư mục tạm được gắn qua bộ nhớ tạm `tmpfs`.
   - **Ngoại lệ Non-root:**
     - Container `phpmyadmin` (image chính thức `phpmyadmin:5.2.3`) dựa trên Apache HTTPD / PHP module cần quyền root trong entrypoint để cấu hình và lắng nghe cổng nội bộ của Apache. Dịch vụ này đã được cách ly nghiêm ngặt chỉ mở cổng tại `127.0.0.1:8081` trên máy host.

3. **Phân Vùng Mạng (Network Segmentation):**
   - Mạng `frontend`: Chỉ kết nối giữa `nginx` và `app`.
   - Mạng `backend` (`internal: true`): Kết nối nội bộ cô lập giữa `app`, `mysql`, `phpmyadmin`. CSDL MySQL **tuyệt đối không mở cổng ra ngoài host**.
   - Mạng `pma_bridge`: Cho phép phpMyAdmin publish cổng ra `127.0.0.1:8081` mà không làm lộ MySQL.

4. **Bảo mật CSDL MySQL:**
   - Người dùng `diemdanh_app` chỉ được cấp đúng 4 quyền: `SELECT, INSERT, UPDATE, DELETE` trên cơ sở dữ liệu `quan_ly_diem_danh`. Bị từ chối hoàn toàn khi cố ý thực hiện `DROP TABLE` hoặc `CREATE USER`.
   - Vô hiệu hóa tài khoản `root` từ xa (`DROP USER IF EXISTS 'root'@'%'`), root chỉ có thể truy cập nội bộ trong container.

5. **Nginx Reverse Proxy & HTTP Security:**
   - Tự động chuyển hướng HTTP sang HTTPS bằng mã **301 Moved Permanently**.
   - Hỗ trợ giao thức **TLS 1.2** và **TLS 1.3**.
   - Ẩn phiên bản máy chủ (`server_tokens off`).
   - Rate Limiting tại `/login`: Giới hạn 5 request/phút, burst 5, trả về mã **429 Too Many Requests**.
   - Chặn truy cập từ bên ngoài vào `/metrics` (trả về mã 404).
   - Mở `stub_status` tại server block nội bộ (cổng 8082, không publish ra ngoài host).
   - Đầy đủ tiêu đề an ninh (Security Headers):
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
     - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; form-action 'self';`

---

## 4. Hướng Dẫn Cài Đặt và Khởi Chạy

### Bước 1: Thiết lập file môi trường
```bash
cp .env.example .env
```

### Bước 2: Khởi động hệ thống bằng Docker Compose
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái dịch vụ
```bash
docker compose ps
```
Đảm bảo các container `diemdanh_nginx`, `diemdanh_app`, `diemdanh_mysql` đều ở trạng thái `healthy`.

### Bước 4: Truy cập hệ thống
- **Giao diện Web Điểm Danh (HTTPS):** [https://localhost](https://localhost)
- **Kiểm tra trạng thái (Health Check):** [https://localhost/healthz](https://localhost/healthz)
- **Quản trị Cơ sở dữ liệu (phpMyAdmin):** [http://127.0.0.1:8081](http://127.0.0.1:8081)

---

## 5. Tài Khoản Đăng Nhập Mặc Định (Seed Data)

| Vai trò | Tên đăng nhập | Mật khẩu | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin` | `AdminPass_2026!` | Báo cáo tháng, xuất CSV, tạo/khóa nhân viên, tạo ca, phân ca |
| **Nhân viên 01** | `staff01` | `StaffPass_2026!` | Xem ca hôm nay, Check-in / Check-out, Lịch sử cá nhân theo tháng |
| **Nhân viên 02 - 10** | `staff02` ... `staff10` | `StaffPass_2026!` | Các tài khoản nhân viên mẫu phân bổ ca trong 30 ngày |

---

## 6. Kết Quả Kiểm Chứng Hệ Thống (Verification Evidence)

1. **Kiểm tra cấu hình Compose:**  
   `docker compose config` chạy thành công không có cảnh báo.
2. **Kiểm tra trạng thái Container:**  
   `docker compose ps` xác nhận chỉ có `nginx` mở cổng `80` và `443` công khai; `phpmyadmin` mở tại `127.0.0.1:8081`; `app` và `mysql` hoàn toàn không mở cổng ra host.
3. **Kiểm tra Healthcheck:**  
   `curl.exe -k -s https://localhost/healthz` trả về:
   ```json
   {"status":"ok","db":"connected"}
   ```
4. **Kiểm tra chuyển hướng HTTP -> HTTPS:**  
   `curl.exe -I http://localhost/` trả về mã `301 Moved Permanently` với `Location: https://localhost/`.
5. **Kiểm tra Security Headers:**  
   `curl.exe -kI https://localhost/login` hiển thị đầy đủ `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`.
6. **Kiểm tra Quy tắc Điểm Danh:**
   - Thử check-in ca đã kết thúc -> Bị từ chối với thông báo *"Ca làm việc đã kết thúc, không thể điểm danh."*
   - Check-in ca đang diễn ra sau giờ bắt đầu > 10 phút -> Ghi nhận thành công với trạng thái *"Đi muộn"*.
   - Check-in lần 2 cho cùng 1 ca trong ngày -> Bị từ chối với thông báo *"Bạn đã thực hiện điểm danh vào cho ca này rồi."*
   - Check-out sau check-in -> Ghi nhận thành công.
   - Check-out lần 2 cho ca đã hoàn thành -> Bị từ chối.
7. **Kiểm tra Rate Limiting:**  
   Gửi liên tiếp trên 5 lượt request tới `/login`, Nginx kích hoạt giới hạn và trả về mã HTTP `429 Too Many Requests`.
8. **Kiểm tra Quyền CSDL của User Ứng Dụng:**  
   `diemdanh_app` thực thi `DROP TABLE users;` bị chặn bởi MySQL với lỗi `ERROR 1142: DROP command denied`.  
   `diemdanh_app` thực thi `CREATE USER ...;` bị chặn với lỗi `ERROR 1227: Access denied`.
