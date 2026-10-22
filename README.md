# HỆ THỐNG ĐIỂM DANH NHÂN VIÊN (GIAI ĐOẠN 2/3)
**Môn học:** Triển khai và Quản trị Hệ thống Phần mềm  
**Đề bài:** Đề 27 - Hệ thống Điểm danh Nhân viên (Bổ sung Giám sát Prometheus & Grafana)

---

## 1. Công Nghệ và Kiến Trúc (Tech Stack)

### Ứng Dụng và Cơ Sở Dữ Liệu
- **Ứng dụng Web:** Node.js 20 LTS + Express.js + EJS Server-Side Rendering (không SPA, không bước build front-end).
- **Cơ sở dữ liệu:** MySQL 8.4 LTS (Múi giờ `Asia/Ho_Chi_Minh` / `+07:00`, mã hóa chuẩn `utf8mb4_unicode_ci`).
- **Quản trị CSDL:** phpMyAdmin 5.2.3 (Chỉ bind tại máy cục bộ `127.0.0.1:8081`).
- **Reverse Proxy & Bảo mật:** Nginx (HTTPS/TLS 1.2/1.3, Rate Limiting, Security Headers, JSON Access Logs, Stub Status).
- **Khởi tạo chứng chỉ tự động:** Service `cert-gen` (Alpine Linux 3.20 + OpenSSL) chạy 1 lần tự sinh chứng chỉ TLS tự ký vào volume dùng chung.

### Hệ Thống Giám Sát (Monitoring Stack)
- **Thu thập & Lưu trữ Metrics:** Prometheus `prom/prometheus:v3.14.0` (Retention 7 ngày, user non-root `nobody`, chỉ bind `127.0.0.1:9090`).
- **Trực quan hóa Dashboard:** Grafana `grafana/grafana:13.2.1` (Tự động provision datasource + 3 dashboards JSON, user non-root `472`, tắt anonymous & đăng ký tự do, chỉ bind `127.0.0.1:3000`).
- **Exporter Thu Thập:**
  - **Node.js Metrics:** Thư viện `prom-client 15.1.3` tích hợp trong ứng dụng (Default metrics, `http_requests_total`, `http_request_duration_seconds`, `attendance_checkins_total`). Endpoint `/metrics` chỉ mở nội bộ, Nginx chặn từ ngoài (trả 404).
  - **Nginx Exporter:** `nginx/nginx-prometheus-exporter:1.4.1` (đọc metrics `stub_status` từ cổng nội bộ 8082).
  - **MySQL Exporter:** `prom/mysqld-exporter:v0.20.0` (kết nối bằng tài khoản riêng `diemdanh_exporter` với quyền tối thiểu).
  - **Container Metrics (cAdvisor):** `gcr.io/cadvisor/cadvisor:v0.55.1` (chạy không dùng privileged, thu thập CPU, RAM, Network của container).

---

## 2. Cấu Trúc Thư Mục Dự Án

```text
.
├── .env.example             # Mẫu biến môi trường an toàn (kèm cấu hình monitoring)
├── .env                     # Biến môi trường thực tế (bị .gitignore)
├── .gitignore               # Bỏ qua node_modules, .env, certs, log
├── docker-compose.yml       # Điều phối toàn bộ 10 dịch vụ, 4 volumes và 4 networks
├── README.md                # Tài liệu hướng dẫn và báo cáo kỹ thuật
├── nginx/
│   ├── Dockerfile           # Nginx Image chạy non-root (user: nginx)
│   └── nginx.conf           # Cấu hình SSL, 301 redirect, CSP, rate limit, chặn /metrics ngoài, stub_status
├── prometheus/
│   └── prometheus.yml       # Scrape config cho prometheus, app, nginx-exporter, mysqld-exporter, cadvisor
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml # Tự động nạp datasource Prometheus
│   │   └── dashboards/
│   │       └── dashboards.yml # Tự động nạp dashboards từ thư mục JSON
│   └── dashboards/
│       ├── container.json   # Dashboard 1: Giám sát Container (cAdvisor)
│       ├── web.json         # Dashboard 2: Giám sát Dịch vụ Web (Node.js & Nginx)
│       └── database.json    # Dashboard 3: Giám sát CSDL MySQL 8.4 LTS
└── app/
    ├── .dockerignore        # Bỏ qua file tạm khi build Docker image
    ├── Dockerfile           # Multi-stage build, non-root user (node), production only
    ├── package.json         # Thư viện Node.js (express, mysql2, ejs, bcryptjs, prom-client, ...)
    ├── db/
    │   ├── schema.sql       # CSDL: users, shifts, shift_assignments, attendance_logs
    │   ├── 02_permissions.sql # Phân quyền tối thiểu cho diemdanh_app, chặn root từ xa
    │   ├── 03_exporter.sh   # Khởi tạo user riêng diemdanh_exporter với quyền tối thiểu
    │   └── seed.js          # Dữ liệu mẫu thực tế tiếng Việt, ca làm, lịch sử điểm danh
    ├── public/
    │   └── style.css        # CSS giao diện thực dụng, một màu nhấn, responsive
    ├── src/
    │   ├── db.js            # MySQL Pool (utf8mb4, dateStrings, auto-seed)
    │   ├── logger.js        # Ghi log JSON chuẩn stdout
    │   ├── metrics.js       # prom-client metrics (default + http request + checkins)
    │   ├── server.js        # Express Server, Trust Proxy, Session, CSRF, Healthz, Metrics
    │   ├── middleware/      # auth.js, csrf.js
    │   ├── routes/          # auth.js, staff.js (ghi nhận metric điểm danh), admin.js
    │   └── utils/time.js    # Chuẩn múi giờ Asia/Ho_Chi_Minh
    └── views/               # Giao diện EJS (login, staff, admin, partials)
```

---

## 3. Các Biện Pháp Bảo Mật & Quản Trị Hệ Thống

1. **Bảo mật Ứng dụng & Metrics:**
   - Mật khẩu băm an toàn bằng **bcrypt** (salt rounds = 10).
   - Cookie phiên làm việc: `httpOnly: true`, `secure: true`, `sameSite: 'lax'`.
   - **Chống tấn công CSRF:** Middleware kiểm tra token bảo mật ở mọi thao tác POST.
   - **Prepared Statement:** Toàn bộ truy vấn SQL đều dùng tham số hóa `?` chống SQL Injection.
   - **Bảo vệ endpoint `/metrics`:** Chỉ cho phép truy cập từ mạng nội bộ Docker. Nginx chặn toàn bộ request từ bên ngoài vào `/metrics` bằng mã **404 Not Found**.
   - **Tránh bùng nổ nhãn (Cardinality):** Nhãn `route` trong metrics HTTP được chuẩn hóa theo pattern (`req.route.path`), không sử dụng URL chứa tham số động.

2. **Bảo mật Vận hành Container (Container Hardening):**
   - **Non-root:**
     - Ứng dụng Node.js: user `node` (UID 1000).
     - Nginx: user `nginx` (UID 101).
     - Prometheus: user `nobody` (UID 65534).
     - Grafana: user `472` (`grafana`).
   - **Đặc quyền tối thiểu:**
     - `no-new-privileges: true` áp dụng trên toàn bộ container.
     - `cap_drop: [ALL]` áp dụng cho mọi dịch vụ. Nginx chỉ cấp thêm `NET_BIND_SERVICE` để mở cổng 80/443.
     - `read_only: true` cho filesystem của `app`, `nginx`, `mysqld-exporter`, các thư mục tạm gắn qua `tmpfs`.
   - **cAdvisor không dùng privileged:**
     - Container `cadvisor` chạy hoàn toàn không bật `privileged: true`, tuân thủ cờ `no-new-privileges: true` và chỉ mount bind các thư mục hệ thống ở chế độ chỉ đọc (`:ro`).

3. **Phân Vùng Mạng (Network Segmentation):**
   - Mạng `frontend`: Kết nối giữa `nginx`, `app`, `nginx-exporter`, và `prometheus`.
   - Mạng `backend` (`internal: true`): Kết nối nội bộ cô lập giữa `app`, `mysql`, `phpmyadmin`, và `mysqld-exporter`. CSDL MySQL **tuyệt đối không mở cổng ra ngoài host** và không có đường ra internet.
   - Mạng `monitoring`: Kết nối giữa `prometheus`, `grafana`, `cadvisor`, `nginx-exporter`, và `mysqld-exporter`.
   - Mạng `pma_bridge`: Cho phép phpMyAdmin publish cổng ra `127.0.0.1:8081` mà không làm lộ MySQL.

4. **Bảo mật CSDL & Tài Khoản Exporter:**
   - `diemdanh_app`: Chỉ có 4 quyền `SELECT, INSERT, UPDATE, DELETE` trên `quan_ly_diem_danh`.
   - `diemdanh_exporter`: Tài khoản riêng dành cho Prometheus MySQL Exporter, chỉ cấp các quyền tối thiểu cần thiết theo tài liệu chính thức:
     ```sql
     GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'diemdanh_exporter'@'%';
     ```
   - Mật khẩu của `diemdanh_exporter` lấy từ biến môi trường `MYSQL_EXPORTER_PASSWORD` trong `.env`, không bị lưu cứng vào mã nguồn.

5. **Bảo mật Grafana:**
   - Mật khẩu quản trị viên lấy từ `GF_SECURITY_ADMIN_PASSWORD` trong `.env`.
   - Vô hiệu hóa truy cập ẩn danh: `GF_AUTH_ANONYMOUS_ENABLED: "false"`.
   - Tắt tính năng tự đăng ký tài khoản: `GF_USERS_ALLOW_SIGN_UP: "false"`.
   - Chỉ publish ra giao diện cục bộ: `127.0.0.1:3000`.

---

## 4. Hướng Dẫn Cài Đặt và Khởi Chạy

### Bước 1: Thiết lập biến môi trường
```bash
cp .env.example .env
```
*(Chỉnh sửa các mật khẩu trong file `.env` nếu cần).*

### Bước 2: Khởi động toàn bộ cụm dịch vụ
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái dịch vụ
```bash
docker compose ps
```
Tất cả các container ứng dụng, CSDL và giám sát phải ở trạng thái `running` hoặc `healthy`.

### Bước 4: Địa chỉ truy cập các dịch vụ
| Dịch vụ | Địa chỉ URL | Cổng Host | Quyền truy cập / Tài khoản |
| :--- | :--- | :--- | :--- |
| **Giao diện Web Điểm danh (HTTPS)** | [https://localhost](https://localhost) | `80`, `443` | Công khai qua Nginx SSL |
| **Kiểm tra trạng thái (Health Check)** | [https://localhost/healthz](https://localhost/healthz) | `443` | Trả về `{"status":"ok","db":"connected"}` |
| **Quản trị CSDL (phpMyAdmin)** | [http://127.0.0.1:8081](http://127.0.0.1:8081) | `8081` | Chỉ truy cập nội bộ máy host |
| **Prometheus Web UI & API** | [http://127.0.0.1:9090](http://127.0.0.1:9090) | `9090` | Chỉ truy cập nội bộ máy host |
| **Grafana Monitoring Dashboard** | [http://127.0.0.1:3000](http://127.0.0.1:3000) | `3000` | Tài khoản lấy trong `.env` |

---

## 5. Tài Khoản Đăng Nhập Mặc Định

### 1. Tài khoản Ứng dụng Điểm danh (Web App)
- **Quản trị viên (Admin):** Username: `admin` | Mật khẩu: `AdminPass_2026!`
- **Nhân viên (Staff):** Username: `staff01` (đến `staff10`) | Mật khẩu: `StaffPass_2026!`

### 2. Tài khoản Grafana Dashboard
- **Username:** `admin` (hoặc giá trị cấu hình `GF_SECURITY_ADMIN_USER` trong `.env`)
- **Password:** `GrafanaAdmin_2026!` (hoặc giá trị cấu hình `GF_SECURITY_ADMIN_PASSWORD` trong `.env`)

---

## 6. Mô Tả Chi Tiết 3 Dashboard Grafana

Toàn bộ 3 dashboard được tạo bằng file JSON chuẩn tại thư mục `grafana/dashboards/` và được Grafana tự động nạp (provisioning) vào thư mục **"Giám sát Hệ thống"**:

### Dashboard 1: Giám Sát Container (cAdvisor) — UID: `diemdanh-container`
Theo dõi trạng thái và mức tiêu hao tài nguyên phần cứng của từng container:
1. **Tổng số Container đang chạy:** Panel Stat hiển thị số container đang hoạt động (`count(container_last_seen{id=~"/docker/.*"})`).
2. **Thời điểm khởi động Container (Start Time):** Panel Table hiển thị thời điểm container bắt đầu chạy (`container_start_time_seconds`).
3. **Tỷ lệ sử dụng CPU theo Container:** Biểu đồ Time Series biểu diễn % CPU tiêu thụ (`rate(container_cpu_usage_seconds_total[1m])`).
4. **Bộ nhớ RAM đang sử dụng theo Container:** Biểu đồ Time Series đo lượng RAM thực tế sử dụng (`container_memory_usage_bytes`).
5. **Bộ nhớ RAM Working Set theo Container:** Biểu đồ Time Series đo lượng RAM Working Set đang được giữ (`container_memory_working_set_bytes`).
6. **Lưu lượng Mạng Nhận vào (Rx) & Gửi ra (Tx):** Biểu đồ Time Series đo tốc độ mạng byte/giây nhận vào và phát ra (`rate(container_network_receive_bytes_total[1m])`, `rate(container_network_transmit_bytes_total[1m])`).
> **Ghi chú kỹ thuật về cAdvisor trên Docker Desktop (WSL2):** Trên môi trường Windows Docker Desktop với backend WSL2, nhân Linux chia sẻ cgroup mạng ở namespace gốc của máy ảo (`id="/"`), do đó lưu lượng mạng container được cAdvisor gom theo interface mạng `eth0` của máy ảo. Trên hệ điều hành Linux production chuẩn, metric này tự động phân tách theo từng container name.

### Dashboard 2: Giám Sát Dịch Vụ Web (Node.js & Nginx) — UID: `diemdanh-web`
Theo dõi tải truy cập, chất lượng dịch vụ và chỉ số nghiệp vụ của hệ thống:
1. **Kết nối Nginx đang hoạt động:** Panel Stat đo số active connections hiện tại từ Nginx stub_status (`nginx_connections_active`).
2. **Tổng lượt Điểm danh vào (Check-in):** Panel Stat đo metric nghiệp vụ phân tách theo trạng thái đúng giờ hoặc đi muộn (`sum(attendance_checkins_total) by (status)`).
3. **Tần suất Lỗi 4xx (Client Error):** Panel Stat theo dõi tỷ lệ lỗi phía client (`sum(rate(http_requests_total{status=~"4.."}[1m]))`).
4. **Tần suất Lỗi 5xx (Server Error):** Panel Stat theo dõi tỷ lệ lỗi phía server (`sum(rate(http_requests_total{status=~"5.."}[1m]))`).
5. **Tần suất HTTP Request Ứng dụng (RPS):** Biểu đồ Time Series chi tiết số request/giây theo phương thức và route chuẩn hóa (`sum(rate(http_requests_total[1m])) by (method, route)`).
6. **Tần suất Request qua Nginx Proxy:** Biểu đồ Time Series đo tổng lượng request đi qua Nginx (`rate(nginx_http_requests_total[1m])`).
7. **Độ trễ phản hồi p95 (Giây):** Biểu đồ Time Series đo độ trễ bách phân vị thứ 95 của các yêu cầu HTTP (`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))`).

### Dashboard 3: Giám Sát Cơ Sở Dữ Liệu MySQL 8.4 LTS — UID: `diemdanh-database`
Theo dõi hiệu năng và trạng thái hoạt động của hệ quản trị CSDL MySQL:
1. **Kết nối CSDL đang dùng:** Panel Stat đo số thread client đang kết nối đồng thời (`mysql_global_status_threads_connected`).
2. **Giới hạn kết nối tối đa:** Panel Stat hiển thị cấu hình `max_connections` của MySQL (`mysql_global_variables_max_connections`).
3. **Tổng dung lượng InnoDB Buffer Pool:** Panel Stat hiển thị kích thước bộ nhớ đệm InnoDB cấp phát (`mysql_global_variables_innodb_buffer_pool_size`).
4. **Tỷ lệ sử dụng InnoDB Buffer Pool (%):** Panel Gauge đo % buffer pool đã nạp dữ liệu (`(mysql_global_status_innodb_buffer_pool_bytes_data / mysql_global_variables_innodb_buffer_pool_size) * 100`).
5. **Số lượng truy vấn mỗi giây (QPS):** Biểu đồ Time Series đo tổng số truy vấn/giây thực thi trên MySQL (`rate(mysql_global_status_queries[1m])`).
6. **Truy vấn chậm (Slow Queries/giây):** Biểu đồ Time Series theo dõi các truy vấn vượt ngưỡng thời gian quy định (`rate(mysql_global_status_slow_queries[1m])`).
7. **Tần suất câu lệnh SQL:** Biểu đồ Time Series đo tốc độ thực thi các câu lệnh `SELECT`, `INSERT`, `UPDATE`, `DELETE` (`rate(mysql_global_status_commands_total{command=~"select|insert|update|delete"}[1m])`).

---

## 7. Bằng Chứng Kiểm Chứng Thực Tế (Verification Evidence)

1. **Kiểm tra Scrape Targets của Prometheus:**
   Gọi API `http://127.0.0.1:9090/api/v1/targets` xác nhận 100% (5/5) targets ở trạng thái `UP`:
   ```text
   [UP] Job: app             | URL: http://app:3000/metrics
   [UP] Job: cadvisor        | URL: http://cadvisor:8080/metrics
   [UP] Job: mysqld-exporter | URL: http://mysqld-exporter:9104/metrics
   [UP] Job: nginx-exporter  | URL: http://nginx-exporter:9113/metrics
   [UP] Job: prometheus      | URL: http://localhost:9090/metrics
   ```

2. **Kiểm tra nạp Dashboards và Datasource của Grafana:**
   Gọi API Grafana `http://127.0.0.1:3000/api/search` xác nhận 3 dashboard được nạp tự động vào thư mục "Giám sát Hệ thống":
   - `diemdanh-container`: "Giám sát Container (cAdvisor)"
   - `diemdanh-web`: "Giám sát Dịch vụ Web (Node.js & Nginx)"
   - `diemdanh-database`: "Giám sát Cơ sở Dữ liệu (MySQL 8.4 LTS)"
   - Datasource Prometheus được cấu hình mặc định (`isDefault: true`).

3. **Kiểm tra dữ liệu thực tế của các truy vấn PromQL:**
   Sau khi tạo lưu lượng HTTP qua Nginx (bao gồm đăng nhập, duyệt trang, phát sinh lỗi 404, và điểm danh nhân viên), toàn bộ 21 panel trên 3 dashboard đều trả về kết quả số liệu thực tế từ Prometheus API:
   - Request ứng dụng: ghi nhận các route `/healthz`, `/login`, `/staff/dashboard`, `/staff/check-in`, `/staff/history`, `/admin/*`.
   - Lỗi 4xx: ghi nhận rate lỗi khi truy cập đường dẫn không tồn tại.
   - Nginx metrics: ghi nhận request rate ~0.78 req/s và active connections = 1.
   - MySQL metrics: ghi nhận 3 active threads, 151 max connections, QPS ~2.33 queries/s, buffer pool size 128MB.
   - Container metrics: ghi nhận dữ liệu CPU, RAM, Working set của toàn bộ 10 containers.

4. **Kiểm tra Bảo mật Endpoint `/metrics` từ bên ngoài:**
   Thực hiện gửi request tới `https://localhost/metrics` qua Nginx Reverse Proxy:
   - Kết quả: Nginx trả về mã HTTP `404 Not Found`. Endpoint `/metrics` hoàn toàn không bị lộ ra ngoài internet.

---

## 8. Cách Dừng và Dọn Dẹp Hệ Thống

- **Dừng toàn bộ hệ thống (giữ nguyên dữ liệu):**
  ```bash
  docker compose down
  ```
- **Dừng và xóa toàn bộ dữ liệu (volumes & networks):**
  ```bash
  docker compose down -v
  ```
