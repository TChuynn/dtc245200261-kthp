const promClient = require('prom-client');

// 1. Tự động thu thập metrics mặc định của tiến trình Node.js (CPU, Memory, Event Loop, GC)
promClient.collectDefaultMetrics();

// 2. Metric đếm tổng số HTTP request
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Tổng số lượt HTTP request đã xử lý',
  labelNames: ['method', 'route', 'status'],
});

// 3. Metric đo độ trễ của HTTP request dạng Histogram
const httpRequestDurationSeconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request tính bằng giây',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// 4. Metric nghiệp vụ: Đếm số lượt điểm danh (check-in) theo trạng thái
const attendanceCheckinsTotal = new promClient.Counter({
  name: 'attendance_checkins_total',
  help: 'Tổng số lượt điểm danh vào (check-in) theo trạng thái đúng giờ (on_time) hoặc đi muộn (late)',
  labelNames: ['status'],
});

// Hàm chuẩn hóa route tránh bùng nổ cardinality nhãn
function normalizeRoute(req) {
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    const path = req.route.path === '/' && base !== '' ? '' : req.route.path;
    return `${base}${path}` || '/';
  }
  if (req.path.startsWith('/public/')) {
    return '/public/*';
  }
  return 'unmatched';
}

// Middleware đo đạc metrics cho mỗi HTTP request
function metricsMiddleware(req, res, next) {
  // Không tính metrics nội bộ cho endpoint scrape /metrics
  if (req.path === '/metrics') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const route = normalizeRoute(req);
    const status = res.statusCode ? res.statusCode.toString() : '500';

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status,
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status,
      },
      durationSeconds
    );
  });

  next();
}

module.exports = {
  promClient,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  attendanceCheckinsTotal,
  metricsMiddleware,
};
