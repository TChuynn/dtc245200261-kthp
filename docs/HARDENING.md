# Bảng Tổng Hợp Biện Pháp An Ninh & Hardening Hệ Thống

Tài liệu này tổng hợp toàn bộ các biện pháp an ninh và làm cứng (hardening) được triển khai trên toàn bộ hệ sinh thái dịch vụ của Hệ thống Quản lý Điểm danh, bao gồm vị trí cấu hình, câu lệnh kiểm chứng thực tế và kết quả mong đợi.

---

## Bảng Biện Pháp Hardening Chi Tiết

| STT | Biện pháp An ninh | Vị trí File / Dòng | Lệnh kiểm chứng | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Vận hành tiến trình dưới User Non-root** (Ứng dụng Node.js chạy user `node`) | `app/Dockerfile` (dòng 27) | `docker exec diemdanh_app id` | `uid=1000(node) gid=1000(node) groups=1000(node)` (Không phải root) |
| **2** | **Vận hành tiến trình dưới User Non-root** (Nginx chạy user `nginx`) | `nginx/Dockerfile` (dòng 11) | `docker exec diemdanh_nginx id` | `uid=101(nginx) gid=101(nginx) groups=101(nginx)` |
| **3** | **Vận hành tiến trình dưới User Non-root** (MySQL tự drop privilege xuống user `mysql`) | `docker-compose.yml` (`mysql`) | `docker top diemdanh_mysql` | Tiến trình `mysqld` chạy dưới UID `999` (`mysql`) |
| **4** | **Vận hành tiến trình dưới User Non-root** (Prometheus chạy user `nobody`) | `docker-compose.yml` (dòng 247) | `docker exec diemdanh_prometheus id` | `uid=65534(nobody) gid=65534(nobody)` |
| **5** | **Vận hành tiến trình dưới User Non-root** (Grafana chạy user `472`) | `docker-compose.yml` (dòng 288) | `docker exec diemdanh_grafana id` | `uid=472(grafana) gid=472(grafana) groups=472(grafana)` |
| **6** | **Vận hành tiến trình dưới User Non-root** (Loki chạy user `10001`) | `docker-compose.yml` (`loki`) | `docker inspect diemdanh_loki --format '{{.Config.User}}'` | `10001` (User non-root của image `grafana/loki`) |
| **7** | **Vận hành tiến trình dưới User Non-root** (MySQL Exporter chạy user `nobody`) | `docker-compose.yml` (`mysqld-exporter`) | `docker inspect diemdanh_mysqld_exporter --format '{{.Config.User}}'` | `nobody` (UID 65534) |
| **8** | **Vận hành tiến trình dưới User Non-root** (Nginx Exporter chạy user non-root) | `docker-compose.yml` (`nginx-exporter`) | `docker inspect diemdanh_nginx_exporter --format '{{.Config.User}}'` | `1001:1001` |
| **9** | **Ngoại lệ Non-root có giải trình** (`promtail`, `cadvisor`, `phpmyadmin`) | `README.md` (mục Ngoại lệ) | `docker inspect diemdanh_promtail diemdanh_cadvisor diemdanh_phpmyadmin --format '{{.Name}}: {{.Config.User}}'` | Promtail cần đọc `docker.sock`; cAdvisor cần đọc sysfs/cgroups; phpMyAdmin Apache master fork worker `www-data` |
| **10** | **Tước bỏ toàn bộ Linux Capabilities** (`cap_drop: ALL`) | `docker-compose.yml` (app, nginx, prometheus, grafana, loki, promtail, exporters) | `docker inspect diemdanh_app diemdanh_nginx diemdanh_loki --format '{{.Name}}: {{.HostConfig.CapDrop}}'` | `CapDrop: [ALL]` cho tất cả container dịch vụ chính |
| **11** | **Bổ sung Capability tối thiểu có kiểm soát** (`NET_BIND_SERVICE` cho Nginx) | `docker-compose.yml` (dòng 140) | `docker inspect diemdanh_nginx --format '{{.HostConfig.CapAdd}}'` | `[NET_BIND_SERVICE]` (cho phép non-root bind cổng 80/443) |
| **12** | **Ngăn chặn nâng đặc quyền** (`no-new-privileges: true`) | `docker-compose.yml` (Toàn bộ 11 dịch vụ) | `docker inspect $(docker compose ps -q) --format '{{.Name}}: {{.HostConfig.SecurityOpt}}'` | Toàn bộ container hiển thị `[no-new-privileges:true]` |
| **13** | **Hệ thống tệp chỉ đọc** (`read_only: true` + `tmpfs`) trên `app` | `docker-compose.yml` (dòng 72-74) | `docker inspect diemdanh_app --format 'ReadOnly={{.HostConfig.ReadonlyRootfs}} Tmpfs={{json .HostConfig.Tmpfs}}'` | `ReadOnly=true Tmpfs={"/tmp":"rw,noexec,nosuid,size=64m"}` |
| **14** | **Hệ thống tệp chỉ đọc** (`read_only: true` + `tmpfs`) trên `nginx` | `docker-compose.yml` (dòng 111-115) | `docker inspect diemdanh_nginx --format 'ReadOnly={{.HostConfig.ReadonlyRootfs}}'` | `ReadOnly=true` kết hợp tmpfs `/tmp`, `/var/cache/nginx`, `/var/run` |
| **15** | **Giới hạn tài nguyên phần cứng** (`mem_limit` và `cpus`) | `docker-compose.yml` (Toàn bộ dịch vụ) | `docker inspect diemdanh_app diemdanh_mysql diemdanh_nginx diemdanh_loki --format '{{.Name}}: Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'` | Giới hạn bộ nhớ và CPU cụ thể cho từng service, không có container nào không giới hạn |
| **16** | **Không sử dụng cờ đặc quyền** (`privileged: false`) | `docker-compose.yml` | `docker inspect $(docker compose ps -q) --format '{{.Name}}: Privileged={{.HostConfig.Privileged}}'` | Tất cả container đều trả về `Privileged=false` |
| **17** | **Cô lập Mạng Nội bộ Backend** (`internal: true`) | `docker-compose.yml` (dòng 397) | `docker network inspect phatsungcuoicung_backend --format '{{.Internal}}'` | `true` (Ngăn chặn kết nối ra ngoài Internet từ mạng backend) |
| **18** | **Không mở cổng Database ra ngoài Host** | `docker-compose.yml` (`mysql`) | `docker port diemdanh_mysql` | Trả về rỗng (MySQL không bind bất kỳ cổng nào trên host) |
| **19** | **Ngăn chặn Database truy cập Internet** | `docker-compose.yml` (`mysql`) | `docker exec diemdanh_mysql getent hosts google.com` | Thất bại hoặc trả về rỗng (Database bị cô lập hoàn toàn) |
| **20** | **Chỉ Nginx mở cổng công khai ra ngoài Host** | `docker-compose.yml` (`nginx`) | `docker ps --format '{{.Names}}: {{.Ports}}' \| grep '0.0.0.0'` | Chỉ có `diemdanh_nginx` lắng nghe trên `0.0.0.0:80` và `0.0.0.0:443` |
| **21** | **Cổng Quản trị chỉ bind trên Localhost** (phpMyAdmin, Prometheus, Grafana) | `docker-compose.yml` (dòng 149, 256, 309) | `docker ps --format '{{.Names}}: {{.Ports}}' \| grep '127.0.0.1'` | phpMyAdmin (8081), Prometheus (9090), Grafana (3000) chỉ bind `127.0.0.1` |
| **22** | **Loki & Exporters không publish cổng ra Host** | `docker-compose.yml` (loki, promtail, cadvisor, exporters) | `docker port diemdanh_loki && docker port diemdanh_mysqld_exporter` | Trả về rỗng (Loki và các exporter chỉ giao tiếp qua mạng Docker) |
| **23** | **Từ chối khởi động nếu Mật khẩu Admin yếu/mẫu** | `app/src/server.js` (dòng 150-197) | Kiểm tra bằng cách chạy app với `SEED_ADMIN_PASSWORD=admin123` | App ghi log `security_validation_failed` và thoát với mã `1` |
| **24** | **Hướng dẫn sinh mật khẩu an toàn trong `.env.example`** | `.env.example` (dòng 3-7) | `grep -E 'openssl rand -base64 24' .env.example` | Xuất hiện cú pháp lệnh sinh chuỗi ngẫu nhiên mạnh |
| **25** | **Đặc quyền CSDL tối thiểu cho App** (`diemdanh_app`) | `app/db/02_permissions.sql` (dòng 5-6) | `docker exec -i diemdanh_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR 'diemdanh_app'@'%';"` | Chỉ có quyền `SELECT, INSERT, UPDATE, DELETE` trên `quan_ly_diem_danh.*` |
| **26** | **Đặc quyền CSDL tối thiểu cho Exporter** (`diemdanh_exporter`) | `app/db/03_exporter.sh` (dòng 8) | `docker exec -i diemdanh_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR 'diemdanh_exporter'@'%';"` | Chỉ có quyền `PROCESS, REPLICATION CLIENT, SELECT` trên `*.*` |
| **27** | **Xóa bỏ tài khoản `root` truy cập từ xa** | `app/db/02_permissions.sql` (dòng 9) | `docker exec -i diemdanh_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT User, Host FROM mysql.user WHERE User='root';"` | Chỉ còn `root@localhost` hoặc `root@127.0.0.1`, không có `root@%` |
| **28** | **Nginx Security Headers** (HSTS, nosniff, DENY, CSP, Referrer, Permissions) | `nginx/nginx.conf` (dòng 73-78) | `curl.exe -kI https://127.0.0.1/` | Có mặt đầy đủ 6 header bảo mật bắt buộc |
| **29** | **Chặn truy cập trái phép vào endpoint `/metrics`** | `nginx/nginx.conf` (dòng 81-83) | `curl.exe -k -s -o /dev/null -w "%{http_code}" https://127.0.0.1/metrics` | `404` (Nginx chặn và trả mã 404 cho client bên ngoài) |
| **30** | **Rate Limiting chống Brute-force trên `/login`** | `nginx/nginx.conf` (dòng 44-45, 87) | Gửi > 5 request liên tiếp tới `/login` | Nginx trả về mã HTTP `429 Too Many Requests` |
