const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const logger = require('./logger');
const { healthCheck, initDb } = require('./db');
const csrfMiddleware = require('./middleware/csrf');
const { promClient, metricsMiddleware } = require('./metrics');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Tắt header x-powered-by để tránh lộ thông tin công nghệ
app.disable('x-powered-by');

// 1. Cấu hình Trust Proxy (đứng sau Nginx Reverse Proxy)
app.set('trust proxy', 1);

// 2. Cấu hình View Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 3. Phục vụ tài nguyên tĩnh (CSS, hình ảnh)
app.use('/public', express.static(path.join(__dirname, '../public')));

// 4. Endpoint Prometheus metrics nội bộ (đặt trước CSRF để scrape không bị chặn)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// 5. Middleware đo lường HTTP metrics
app.use(metricsMiddleware);

// 6. Phân tích dữ liệu Request Body và Cookie
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 7. Cấu hình Session Cookie bảo mật
const isProduction = process.env.NODE_ENV === 'production';
app.use(
  session({
    name: 'diemdanh_session',
    secret: process.env.SESSION_SECRET || 'super-secret-key-diemdanh-2026!',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction, // Chỉ gửi qua HTTPS khi ở chế độ production
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 giờ làm việc
    },
  })
);

// 8. Middleware ghi log HTTP Request dạng JSON đơn dòng ra stdout
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Không ghi log định kỳ cho /healthz và /metrics để tránh làm đầy log hệ thống
    if (req.path === '/healthz' || req.path === '/metrics') return;

    const duration_ms = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const userId = req.session && req.session.user ? req.session.user.id : null;

    logger.logEvent({
      level,
      event: 'http_request',
      user_id: userId,
      path: req.originalUrl,
      status,
      duration_ms,
      meta: {
        method: req.method,
        ip: req.ip,
      },
    });
  });
  next();
});

// 9. Middleware chống CSRF
app.use(csrfMiddleware);

// 10. Cung cấp thông tin user hiện tại cho mọi View
app.use((req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
});

// 11. Endpoint kiểm tra sức khỏe hệ thống (Health Check)
app.get('/healthz', async (req, res) => {
  try {
    const isDbHealthy = await healthCheck();
    if (isDbHealthy) {
      return res.status(200).json({ status: 'ok', db: 'connected' });
    }
    return res.status(503).json({ status: 'error', db: 'disconnected' });
  } catch (err) {
    return res.status(503).json({ status: 'error', db: 'error', message: err.message });
  }
});

// 12. Định tuyến chính
app.get('/', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/reports');
  }
  return res.redirect('/staff/dashboard');
});

// 13. Các router chức năng
app.use(authRoutes);
app.use('/staff', staffRoutes);
app.use('/admin', adminRoutes);

// 14. Xử lý lỗi 404 (Không tìm thấy trang)
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Không Tìm Thấy Trang',
    message: 'Địa chỉ bạn yêu cầu không tồn tại trên hệ thống.',
    statusCode: 404,
  });
});

// 15. Xử lý lỗi 500 (Ẩn chi tiết lỗi nội bộ để đảm bảo an toàn)
app.use((err, req, res, next) => {
  const userId = req.session && req.session.user ? req.session.user.id : null;
  logger.error('internal_error', {
    user_id: userId,
    path: req.originalUrl,
    status: 500,
    message: err.message,
    meta: {
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
  });

  res.status(500).render('error', {
    title: '500 - Lỗi Hệ Thống',
    message: 'Đã xảy ra sự cố nội bộ trong quá trình xử lý yêu cầu. Vui lòng thử lại sau.',
    statusCode: 500,
  });
});

// 16. Kiểm tra độ mạnh mật khẩu quản trị viên khởi tạo (Hardening)
function validateAdminPassword() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const samplePasswords = [
    'mat_khau_admin_khoi_tao',
    'sinh_bang_lenh_openssl_rand_base64_24',
    'your-password-here',
    'admin',
    'admin123',
    'password',
    '123456',
    '12345678',
    'changeme',
    'root',
  ];

  if (!adminPassword || samplePasswords.includes(adminPassword)) {
    logger.error('security_validation_failed', {
      message: 'Mật khẩu SEED_ADMIN_PASSWORD đang sử dụng giá trị mẫu hoặc bị bỏ trống. Ứng dụng từ chối khởi động để đảm bảo an toàn.',
    });
    process.exit(1);
  }

  // Yêu cầu: tối thiểu 12 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt
  const hasMinLength = adminPassword.length >= 12;
  const hasUpperCase = /[A-Z]/.test(adminPassword);
  const hasLowerCase = /[a-z]/.test(adminPassword);
  const hasNumber = /[0-9]/.test(adminPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(adminPassword);

  if (!hasMinLength || !hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecial) {
    logger.error('security_validation_failed', {
      message: 'Mật khẩu SEED_ADMIN_PASSWORD quá yếu (yêu cầu tối thiểu 12 ký tự, đủ chữ hoa, thường, số và ký tự đặc biệt). Ứng dụng từ chối khởi động.',
    });
    process.exit(1);
  }
}

// 17. Khởi động máy chủ sau khi kiểm tra an ninh và CSDL
async function startServer() {
  validateAdminPassword();
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('server_started', {
      message: `Máy chủ điểm danh Node.js đang chạy tại cổng ${PORT}`,
      meta: { port: PORT, env: process.env.NODE_ENV || 'production' },
    });
  });
}

startServer().catch((err) => {
  logger.error('server_boot_error', { message: err.message });
  process.exit(1);
});

