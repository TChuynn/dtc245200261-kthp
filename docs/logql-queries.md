# Danh Sách Câu Truy Vấn LogQL (Loki Centralized Logging)

Hệ thống quản lý điểm danh triển khai lưu trữ và phân tích log tập trung sử dụng Grafana Loki và Promtail. Toàn bộ log của các container Docker được gán 3 nhãn chuẩn: `service`, `container`, `job="docker"`. Dưới đây là các câu truy vấn LogQL đã được chạy thực tế qua Loki HTTP API (`/loki/api/v1/query_range` và `/loki/api/v1/query`) với kết quả kiểm chứng thực tế.

---

## 1. Lọc Log theo Service (Dịch vụ Ứng dụng Node.js)

### Câu truy vấn LogQL:
```logql
{service="app"}
```

### Giải thích:
Lọc toàn bộ các dòng nhật ký được phát sinh từ dịch vụ ứng dụng `app` (Node.js Express) thông qua nhãn `service="app"`. Câu truy vấn này giúp theo dõi luồng xử lý nghiệp vụ, sự kiện hệ thống và các request HTTP đi vào backend.

### Kết quả chạy thật qua Loki API:
```json
{
  "status": "success",
  "data": {
    "resultType": "streams",
    "result": [
      {
        "stream": {
          "container": "diemdanh_app",
          "detected_level": "warn",
          "job": "docker",
          "service": "app",
          "service_name": "app"
        },
        "values": [
          [
            "1792696370248588390",
            "{\"time\":\"2026-10-22T19:12:50.248Z\",\"level\":\"warn\",\"event\":\"http_request\",\"path\":\"/login\",\"status\":401,\"duration_ms\":222,\"method\":\"POST\",\"ip\":\"172.22.0.1\"}"
          ],
          [
            "1792696370245611677",
            "{\"time\":\"2026-10-22T19:12:50.245Z\",\"level\":\"warn\",\"event\":\"login_failed\",\"path\":\"/login\",\"status\":401,\"username\":\"admin\",\"reason\":\"invalid_password\"}"
          ]
        ]
      },
      {
        "stream": {
          "container": "diemdanh_app",
          "detected_level": "info",
          "job": "docker",
          "service": "app",
          "service_name": "app"
        },
        "values": [
          [
            "1792696370012628029",
            "{\"time\":\"2026-10-22T19:12:50.012Z\",\"level\":\"info\",\"event\":\"http_request\",\"path\":\"/login\",\"status\":200,\"duration_ms\":2,\"method\":\"GET\",\"ip\":\"172.22.0.1\"}"
          ]
        ]
      }
    ]
  }
}
```

---

## 2. Lọc Request Lỗi từ Nginx Reverse Proxy (Mã trạng thái >= 400)

### Câu truy vấn LogQL:
```logql
{service="nginx"} | json | status >= 400
```

### Giải thích:
Lọc nhật ký từ dịch vụ `nginx`, phân tích cú pháp chuỗi log JSON bằng bộ lọc `| json` và lọc ra các yêu cầu HTTP có mã trạng thái lỗi của client hoặc máy chủ (`status >= 400`), ví dụ lỗi 401 Unauthorized, 404 Not Found hoặc 429 Too Many Requests do cơ chế Rate Limit kích hoạt.

### Kết quả chạy thật qua Loki API:
```json
{
  "status": "success",
  "data": {
    "resultType": "streams",
    "result": [
      {
        "stream": {
          "container": "diemdanh_nginx",
          "detected_level": "unknown",
          "job": "docker",
          "method": "POST",
          "remote_addr": "172.22.0.1",
          "request_time": "0.228",
          "service": "nginx",
          "service_name": "nginx",
          "status": "401",
          "time": "2026-10-22T19:12:50+00:00",
          "uri": "/login"
        },
        "values": [
          [
            "1792696370249068032",
            "{\"time\":\"2026-10-22T19:12:50+00:00\",\"remote_addr\":\"172.22.0.1\",\"method\":\"POST\",\"uri\":\"/login\",\"status\":401,\"request_time\":0.228}"
          ]
        ]
      },
      {
        "stream": {
          "container": "diemdanh_nginx",
          "detected_level": "unknown",
          "job": "docker",
          "method": "GET",
          "remote_addr": "172.22.0.1",
          "request_time": "0.000",
          "service": "nginx",
          "service_name": "nginx",
          "status": "429",
          "time": "2026-10-22T19:12:50+00:00",
          "uri": "/login"
        },
        "values": [
          [
            "1792696370268967812",
            "{\"time\":\"2026-10-22T19:12:50+00:00\",\"remote_addr\":\"172.22.0.1\",\"method\":\"GET\",\"uri\":\"/login\",\"status\":429,\"request_time\":0.000}"
          ],
          [
            "1792696370259503741",
            "{\"time\":\"2026-10-22T19:12:50+00:00\",\"remote_addr\":\"172.22.0.1\",\"method\":\"GET\",\"uri\":\"/login\",\"status\":429,\"request_time\":0.000}"
          ]
        ]
      }
    ]
  }
}
```

---

## 3. Lọc Sự Kiện Đăng Nhập Thất Bại của Ứng Dụng (`login_failed`)

### Câu truy vấn LogQL:
```logql
{service="app"} | json | event="login_failed"
```

### Giải thích:
Lọc dòng log từ container ứng dụng Node.js, bóc tách cấu trúc JSON và lọc chính xác các bản ghi có thuộc tính `event` bằng `"login_failed"`. Phục vụ kiểm toán an ninh, phát hiện các hành vi dò quét mật khẩu hoặc tài khoản nhân viên đăng nhập sai.

### Kết quả chạy thật qua Loki API:
```json
{
  "status": "success",
  "data": {
    "resultType": "streams",
    "result": [
      {
        "stream": {
          "container": "diemdanh_app",
          "detected_level": "warn",
          "event": "login_failed",
          "job": "docker",
          "level": "warn",
          "path": "/login",
          "reason": "invalid_password",
          "service": "app",
          "service_name": "app",
          "status": "401",
          "time": "2026-10-22T19:12:50.245Z",
          "username": "admin"
        },
        "values": [
          [
            "1792696370245611677",
            "{\"time\":\"2026-10-22T19:12:50.245Z\",\"level\":\"warn\",\"event\":\"login_failed\",\"path\":\"/login\",\"status\":401,\"username\":\"admin\",\"reason\":\"invalid_password\"}"
          ]
        ]
      }
    ]
  }
}
```

---

## 4. Đo Tốc Độ Log Phát Sinh Theo Service (`rate`)

### Câu truy vấn LogQL:
```logql
sum by (service) (rate({job="docker"}[1m]))
```

### Giải thích:
Tính tốc độ phát sinh dòng nhật ký trung bình trên mỗi giây của từng dịch vụ trong khoảng thời gian cửa sổ trượt 1 phút. Dùng để vẽ biểu đồ giám sát lưu lượng log trong Dashboard Grafana nhằm phát hiện bất thường hoặc bùng phát lưu lượng.

### Kết quả chạy thật qua Loki API:
```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "service": "grafana"
        },
        "value": [
          1792697077.295,
          "0.016666666666666666"
        ]
      },
      {
        "metric": {
          "service": "loki"
        },
        "value": [
          1792697077.295,
          "0.9"
        ]
      },
      {
        "metric": {
          "service": "nginx"
        },
        "value": [
          1792697077.295,
          "0.1"
        ]
      }
    ]
  }
}
```

---

## 5. Tổng Số Dòng Log Phát Sinh Theo Service Trong 10 Phút (`count_over_time`)

### Câu truy vấn LogQL:
```logql
sum by (service) (count_over_time({job="docker"}[10m]))
```

### Giải thích:
Đếm tổng số lượng dòng log được ghi nhận từ từng service trong khoảng thời gian 10 phút gần nhất. Giúp đánh giá tỷ trọng và khối lượng dữ liệu log của từng thành phần hệ thống.

### Kết quả chạy thật qua Loki API:
```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "service": "cadvisor"
        },
        "value": [
          1792697077.295,
          "13"
        ]
      },
      {
        "metric": {
          "service": "grafana"
        },
        "value": [
          1792697077.295,
          "3824"
        ]
      },
      {
        "metric": {
          "service": "loki"
        },
        "value": [
          1792697077.295,
          "129"
        ]
      },
      {
        "metric": {
          "service": "nginx"
        },
        "value": [
          1792697077.295,
          "59"
        ]
      },
      {
        "metric": {
          "service": "promtail"
        },
        "value": [
          1792697077.295,
          "17"
        ]
      }
    ]
  }
}
```
