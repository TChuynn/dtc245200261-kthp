#!/usr/bin/env bash
# ==============================================================================
# Script Kiểm Tra An Ninh & Vận Hành Hệ Thống (scripts/verify.sh)
# Hỗ trợ chạy trên: Git Bash (Windows), WSL, Linux, macOS.
# Mục tiêu: Tự động kiểm tra 10 nhóm tiêu chuẩn hardening và monitoring.
# In rõ PASS / FAIL cho từng mục và thoát mã khác 0 nếu có bất kỳ mục nào FAIL.
# ==============================================================================

set -u

# Ngăn Git Bash / MSYS tự động chuyển đổi đường dẫn Unix sang Windows
export MSYS_NO_PATHCONV=1

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TOTAL=0
PASSED=0
FAILED=0

pass() {
  TOTAL=$((TOTAL + 1))
  PASSED=$((PASSED + 1))
  echo -e "  [${GREEN}PASS${NC}] $1"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  echo -e "  [${RED}FAIL${NC}] $1"
  if [ -n "${2:-}" ]; then
    echo -e "         ${YELLOW}Chi tiết:${NC} $2"
  fi
}

echo -e "\n${BLUE}==================================================================${NC}"
echo -e "${BLUE}  KIỂM TRA AN NINH & VẬN HÀNH HỆ THỐNG ĐIỂM DANH (AUTOMATED AUDIT)${NC}"
echo -e "${BLUE}==================================================================${NC}\n"

# ------------------------------------------------------------------------------
# 1. KIỂM TRA NGƯỜI DÙNG NON-ROOT
# ------------------------------------------------------------------------------
echo -e "${YELLOW}1. Kiểm tra tiến trình vận hành dưới User Non-root:${NC}"

# App (Node.js) -> User node (1000)
APP_UID=$(docker exec diemdanh_app id -u 2>/dev/null || echo "error")
if [ "$APP_UID" = "1000" ]; then
  pass "App container (Node.js) chạy non-root (UID=1000 - node)"
else
  fail "App container (Node.js) không chạy dưới user node" "UID=$APP_UID (kỳ vọng 1000)"
fi

# Nginx -> User nginx (101)
NGINX_UID=$(docker exec diemdanh_nginx id -u 2>/dev/null || echo "error")
if [ "$NGINX_UID" = "101" ]; then
  pass "Nginx container chạy non-root (UID=101 - nginx)"
else
  fail "Nginx container không chạy dưới user nginx" "UID=$NGINX_UID (kỳ vọng 101)"
fi

# MySQL -> Tiến trình mysqld chạy UID 999 (mysql)
MYSQL_TOP_UID=$(docker top diemdanh_mysql 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
if [ "$MYSQL_TOP_UID" = "999" ] || [ "$MYSQL_TOP_UID" = "mysql" ]; then
  pass "MySQL database daemon chạy non-root (UID=999 - mysql)"
else
  fail "MySQL không chạy dưới user mysql" "UID=$MYSQL_TOP_UID"
fi

# Prometheus -> User nobody (65534)
PROM_UID=$(docker exec diemdanh_prometheus id -u 2>/dev/null || echo "error")
if [ "$PROM_UID" = "65534" ]; then
  pass "Prometheus chạy non-root (UID=65534 - nobody)"
else
  fail "Prometheus không chạy dưới user nobody" "UID=$PROM_UID"
fi

# Grafana -> User 472 (grafana)
GRAFANA_UID=$(docker exec diemdanh_grafana id -u 2>/dev/null || echo "error")
if [ "$GRAFANA_UID" = "472" ]; then
  pass "Grafana chạy non-root (UID=472 - grafana)"
else
  fail "Grafana không chạy dưới user 472" "UID=$GRAFANA_UID"
fi

# Loki -> User 10001 (loki)
LOKI_USER=$(docker inspect diemdanh_loki --format '{{.Config.User}}' 2>/dev/null || echo "error")
if [ "$LOKI_USER" = "10001" ] || [ "$LOKI_USER" = "10001:10001" ]; then
  pass "Loki chạy non-root (User=$LOKI_USER)"
else
  fail "Loki không chạy dưới user 10001" "User=$LOKI_USER"
fi

# Exporters -> Non-root
MYSQL_EXP_USER=$(docker inspect diemdanh_mysqld_exporter --format '{{.Config.User}}' 2>/dev/null || echo "error")
NGINX_EXP_USER=$(docker inspect diemdanh_nginx_exporter --format '{{.Config.User}}' 2>/dev/null || echo "error")
if [ "$MYSQL_EXP_USER" = "nobody" ] && [ "$NGINX_EXP_USER" = "1001:1001" ]; then
  pass "MySQL Exporter (nobody) & Nginx Exporter (1001) chạy non-root"
else
  fail "Exporters không cấu hình non-root" "mysqld_exp=$MYSQL_EXP_USER, nginx_exp=$NGINX_EXP_USER"
fi

# ------------------------------------------------------------------------------
# 2. KIỂM TRA CỔNG MỞ & BẢO MẬT CỔNG QUẢN TRỊ
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}2. Kiểm tra quản lý cổng mở (Port Exposure & Isolation):${NC}"

# Kiểm tra các cổng mở ra 0.0.0.0
PUBLIC_PORTS=$(docker ps --format '{{.Names}}: {{.Ports}}' | grep '0.0.0.0' || true)
PUBLIC_CONTAINERS=$(echo "$PUBLIC_PORTS" | awk -F: '{print $1}' | tr -d ' ' | sort -u)

if [ "$PUBLIC_CONTAINERS" = "diemdanh_nginx" ]; then
  pass "Chỉ duy nhất Nginx mở cổng ra ngoài host (0.0.0.0:80, 0.0.0.0:443)"
else
  fail "Có dịch vụ khác ngoài Nginx mở cổng ra ngoài 0.0.0.0" "$PUBLIC_PORTS"
fi

# Cổng quản trị phpMyAdmin, Prometheus, Grafana chỉ bind 127.0.0.1
PMA_PORT_BIND=$(docker port diemdanh_phpmyadmin 2>/dev/null | grep '127.0.0.1' || true)
PROM_PORT_BIND=$(docker port diemdanh_prometheus 2>/dev/null | grep '127.0.0.1' || true)
GRAF_PORT_BIND=$(docker port diemdanh_grafana 2>/dev/null | grep '127.0.0.1' || true)

if [ -n "$PMA_PORT_BIND" ] && [ -n "$PROM_PORT_BIND" ] && [ -n "$GRAF_PORT_BIND" ]; then
  pass "Các cổng quản trị (phpMyAdmin: 8081, Prometheus: 9090, Grafana: 3000) chỉ bind 127.0.0.1"
else
  fail "Cổng quản trị không được bind chặt chẽ trên 127.0.0.1"
fi

# Các service nội bộ không publish cổng ra host
MYSQL_PORT_COUNT=$(docker port diemdanh_mysql 2>/dev/null | wc -l)
LOKI_PORT_COUNT=$(docker port diemdanh_loki 2>/dev/null | wc -l)
CADVISOR_PORT_COUNT=$(docker port diemdanh_cadvisor 2>/dev/null | wc -l)

if [ "$MYSQL_PORT_COUNT" -eq 0 ] && [ "$LOKI_PORT_COUNT" -eq 0 ] && [ "$CADVISOR_PORT_COUNT" -eq 0 ]; then
  pass "MySQL, Loki, cAdvisor, Exporters hoàn toàn không publish cổng ra máy host"
else
  fail "Dịch vụ nội bộ đang bị lộ cổng ra máy host" "mysql=$MYSQL_PORT_COUNT, loki=$LOKI_PORT_COUNT"
fi

# ------------------------------------------------------------------------------
# 3. KIỂM TRA NGINX SECURITY HEADERS
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}3. Kiểm tra Security Headers trên Nginx:${NC}"

HEADERS=$(curl -k -s -I https://127.0.0.1/ || true)

check_header() {
  local header_name="$1"
  if echo "$HEADERS" | grep -qi "$header_name"; then
    pass "Header '$header_name' có mặt"
  else
    fail "Thiếu Security Header '$header_name'"
  fi
}

check_header "Strict-Transport-Security"
check_header "X-Content-Type-Options: nosniff"
check_header "X-Frame-Options: DENY"
check_header "Referrer-Policy"
check_header "Permissions-Policy"
check_header "Content-Security-Policy"

# ------------------------------------------------------------------------------
# 4. KIỂM TRA CHẶN ENDPOINT /metrics TỪ BÊN NGOÀI
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}4. Kiểm tra Endpoint /metrics bị chặn từ bên ngoài:${NC}"

METRICS_STATUS=$(curl -k -s -I https://127.0.0.1/metrics | head -n 1 || echo "")
if echo "$METRICS_STATUS" | grep -q "404"; then
  pass "Truy cập /metrics qua Nginx trả về mã 404 (Đã chặn hoàn toàn)"
else
  fail "Truy cập /metrics không bị chặn" "Status: $METRICS_STATUS (kỳ vọng 404 Not Found)"
fi

# ------------------------------------------------------------------------------
# 5. KIỂM TRA PHÂN QUYỀN DATABASE TỐI THIỂU (LEAST PRIVILEGE)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}5. Kiểm tra Đặc quyền CSDL Tối thiểu (Least Privilege):${NC}"

ROOT_PASS="RootPassword_2026_UltraSecure!"
if [ -f .env ]; then
  ENV_ROOT_PASS=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | cut -d '=' -f2- | tr -d '\r\n')
  [ -n "$ENV_ROOT_PASS" ] && ROOT_PASS="$ENV_ROOT_PASS"
fi

APP_GRANTS=$(docker exec -i diemdanh_mysql mysql -u root -p"$ROOT_PASS" 2>/dev/null <<'EOF'
SHOW GRANTS FOR 'diemdanh_app'@'%';
EOF
)

if echo "$APP_GRANTS" | grep -q "SELECT, INSERT, UPDATE, DELETE ON \`quan_ly_diem_danh\`"; then
  pass "User 'diemdanh_app' chỉ được cấp đúng SELECT, INSERT, UPDATE, DELETE trên database nghiệp vụ"
else
  fail "User 'diemdanh_app' quyền hạn không đúng thiết kế" "$APP_GRANTS"
fi

if echo "$APP_GRANTS" | grep -qv "ALL PRIVILEGES"; then
  pass "User 'diemdanh_app' KHÔNG có quyền ALL PRIVILEGES"
else
  fail "User 'diemdanh_app' bị gán ALL PRIVILEGES"
fi

# Kiểm tra xóa bỏ quyền root từ xa
ROOT_REMOTE_COUNT=$(docker exec -i diemdanh_mysql mysql -u root -p"$ROOT_PASS" -s -N 2>/dev/null <<'EOF'
SELECT COUNT(*) FROM mysql.user WHERE User='root' AND Host='%';
EOF
)

ROOT_REMOTE_COUNT=$(echo "$ROOT_REMOTE_COUNT" | tr -d '\r\n ')
if [ "$ROOT_REMOTE_COUNT" = "0" ]; then
  pass "Tài khoản 'root'@'%' từ xa đã bị vô hiệu hóa hoàn toàn (count = 0)"
else
  fail "Tài khoản 'root'@'%' vẫn còn tồn tại trong hệ thống" "count=$ROOT_REMOTE_COUNT"
fi

# ------------------------------------------------------------------------------
# 6. KIỂM TRA CÔ LẬP MẠNG BACKEND & DATABASE
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}6. Kiểm tra Cô lập Mạng Nội bộ (Network Isolation):${NC}"

IS_INTERNAL=$(docker network inspect phatsungcuoicung_backend --format '{{.Internal}}' 2>/dev/null || echo "false")
if [ "$IS_INTERNAL" = "true" ]; then
  pass "Mạng 'backend' được cấu hình 'internal: true'"
else
  fail "Mạng 'backend' chưa bật thuộc tính 'internal: true'"
fi

# Kiểm tra MySQL không kết nối được ra ngoài internet
MYSQL_OUTBOUND=$(docker exec diemdanh_mysql getent hosts 8.8.8.8 2>&1 || true)
if echo "$MYSQL_OUTBOUND" | grep -qiE "failed|unknown|not found|error" || [ -z "$MYSQL_OUTBOUND" ]; then
  pass "MySQL bị cô lập hoàn toàn, không thể kết nối ra ngoài Internet"
else
  fail "MySQL có thể kết nối ra Internet" "$MYSQL_OUTBOUND"
fi

# ------------------------------------------------------------------------------
# 7. KIỂM TRA PROMETHEUS TARGETS TRẠNG THÁI UP
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}7. Kiểm tra Trạng thái Prometheus Targets:${NC}"

for job in "app" "cadvisor" "mysqld-exporter" "nginx-exporter"; do
  # Truy vấn metric up của từng target trực tiếp qua Prometheus API
  JOB_UP=$(curl -s "http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22$job%22%7D" 2>/dev/null || echo "")
  if echo "$JOB_UP" | grep -q ',"1"]'; then
    pass "Prometheus Target '$job' đang hoạt động (metric up=1)"
  else
    fail "Prometheus Target '$job' không ở trạng thái UP" "$JOB_UP"
  fi
done

# ------------------------------------------------------------------------------
# 8. KIỂM TRA LOKI LOGGING & LOGQL QUERIES
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}8. Kiểm tra Hệ thống Log Tập trung (Loki & Promtail):${NC}"

GF_ADMIN_PASS="GrafanaAdmin_2026!"
if [ -f .env ]; then
  ENV_GF_PASS=$(grep -E '^GF_SECURITY_ADMIN_PASSWORD=' .env | cut -d '=' -f2- | tr -d '\r\n')
  [ -n "$ENV_GF_PASS" ] && GF_ADMIN_PASS="$ENV_GF_PASS"
fi

# 8.1 Lấy danh sách nhãn từ Loki qua Grafana DataSource proxy
LOKI_LABELS=$(curl -s -u "admin:$GF_ADMIN_PASS" "http://127.0.0.1:3000/api/datasources/proxy/uid/P8E80F9AEF21F6940/loki/api/v1/labels" 2>/dev/null || echo "")
if echo "$LOKI_LABELS" | grep -q '"status":"success"'; then
  pass "Loki API hoạt động và nhận diện các nhãn log (status=success)"
else
  fail "Loki API không trả về nhãn log hợp lệ" "$LOKI_LABELS"
fi

# 8.2 Kiểm tra Loki có log của app
LOKI_SERVICES=$(curl -s -u "admin:$GF_ADMIN_PASS" "http://127.0.0.1:3000/api/datasources/proxy/uid/P8E80F9AEF21F6940/loki/api/v1/label/service/values" 2>/dev/null || echo "")
if echo "$LOKI_SERVICES" | grep -q '"app"'; then
  pass "Loki nhận diện và lưu trữ log của service='app'"
else
  fail "Loki chưa có log từ nhãn service='app'" "$LOKI_SERVICES"
fi

# 8.3 Kiểm tra Loki có log của nginx
if echo "$LOKI_SERVICES" | grep -q '"nginx"'; then
  pass "Loki nhận diện và lưu trữ log của service='nginx'"
else
  fail "Loki chưa có log từ nhãn service='nginx'" "$LOKI_SERVICES"
fi

# ------------------------------------------------------------------------------
# 9. KIỂM TRA CONTAINER SECURITY OPTIONS (no-new-privileges & cap_drop)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}9. Kiểm tra Thuộc tính An ninh Container (Security Options):${NC}"

# Kiểm tra no-new-privileges trên tất cả container
ALL_CONTAINERS=$(docker compose ps -q 2>/dev/null || docker ps -q)
NNP_MISMATCH=0
for c in $ALL_CONTAINERS; do
  NNP=$(docker inspect "$c" --format '{{.HostConfig.SecurityOpt}}' 2>/dev/null || echo "")
  if ! echo "$NNP" | grep -q "no-new-privileges:true"; then
    CNAME=$(docker inspect "$c" --format '{{.Name}}')
    fail "Container $CNAME chưa cấu hình no-new-privileges:true"
    NNP_MISMATCH=$((NNP_MISMATCH + 1))
  fi
done
if [ "$NNP_MISMATCH" -eq 0 ]; then
  pass "Toàn bộ $(echo "$ALL_CONTAINERS" | wc -w) container đều bật 'no-new-privileges: true'"
fi

# Kiểm tra cap_drop ALL trên các container trọng yếu
for c in diemdanh_app diemdanh_nginx diemdanh_prometheus diemdanh_grafana diemdanh_loki diemdanh_promtail; do
  CAPS=$(docker inspect "$c" --format '{{.HostConfig.CapDrop}}' 2>/dev/null || echo "")
  if echo "$CAPS" | grep -q "ALL"; then
    pass "Container $c đã áp dụng cap_drop: [ALL]"
  else
    fail "Container $c chưa áp dụng cap_drop: [ALL]" "CapDrop=$CAPS"
  fi
done

# Kiểm tra read_only trên app và nginx
APP_RO=$(docker inspect diemdanh_app --format '{{.HostConfig.ReadonlyRootfs}}' 2>/dev/null || echo "false")
NGINX_RO=$(docker inspect diemdanh_nginx --format '{{.HostConfig.ReadonlyRootfs}}' 2>/dev/null || echo "false")
if [ "$APP_RO" = "true" ] && [ "$NGINX_RO" = "true" ]; then
  pass "Hệ thống tệp read_only: true được kích hoạt trên App và Nginx"
else
  fail "Hệ thống tệp read_only chưa bật trên App hoặc Nginx" "app=$APP_RO, nginx=$NGINX_RO"
fi

# ------------------------------------------------------------------------------
# 10. KIỂM TRA GIỚI HẠN TÀI NGUYÊN (RESOURCE LIMITS)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}10. Kiểm tra Giới hạn Tài nguyên (mem_limit & cpus):${NC}"

LIMIT_MISMATCH=0
for c in diemdanh_mysql diemdanh_app diemdanh_nginx diemdanh_prometheus diemdanh_grafana diemdanh_loki diemdanh_promtail; do
  MEM=$(docker inspect "$c" --format '{{.HostConfig.Memory}}' 2>/dev/null || echo "0")
  CPUS=$(docker inspect "$c" --format '{{.HostConfig.NanoCpus}}' 2>/dev/null || echo "0")
  if [ "$MEM" -gt 0 ] && [ "$CPUS" -gt 0 ]; then
    pass "Container $c có giới hạn tài nguyên (Memory: $((MEM/1024/1024))MB, NanoCpus: $CPUS)"
  else
    fail "Container $c thiếu cấu hình giới hạn tài nguyên" "Memory=$MEM, NanoCpus=$CPUS"
    LIMIT_MISMATCH=$((LIMIT_MISMATCH + 1))
  fi
done

# ------------------------------------------------------------------------------
# TỔNG KẾT KẾT QUẢ
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}==================================================================${NC}"
echo -e "${BLUE}  TỔNG KẾT KẾT QUẢ KIỂM CHỨNG HỆ THỐNG${NC}"
echo -e "${BLUE}==================================================================${NC}"
echo -e "  Tổng số hạng mục kiểm tra : ${TOTAL}"
echo -e "  Số hạng mục ĐẠT (PASS)    : ${GREEN}${PASSED}${NC}"
echo -e "  Số hạng mục LỖI (FAIL)    : ${RED}${FAILED}${NC}"

if [ "$FAILED" -eq 0 ]; then
  echo -e "\n${GREEN}>>> KẾT QUẢ CHUNG: TOÀN BỘ TIÊU CHUẨN AN NINH & VẬN HÀNH ĐẠT YÊU CẦU! <<<${NC}\n"
  exit 0
else
  echo -e "\n${RED}>>> KẾT QUẢ CHUNG: CÓ ${FAILED} HẠNG MỤC THẤT BẠI! YÊU CẦU KIỂM TRA LẠI. <<<${NC}\n"
  exit 1
fi
