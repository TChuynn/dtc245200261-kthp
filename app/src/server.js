const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const logger = require('./logger');
const { healthCheck, initDb } = require('./db');
const csrfMiddleware = require('./middleware/csrf');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 1. Cấu hình Trust Proxy (đứng sau Nginx Reverse Proxy)
app.set('trust proxy', 1);

// 2. Cấu hình View Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 3. Phục vụ tài nguyên tĩnh (CSS, hình ảnh)
app.use('/public', express.static(path.join(__dirname, '../public')));

// 4. Phân tích dữ liệu Request Body và Cookie
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 5. Cấu hình Session Cookie bảo mật
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

// 6. Middleware ghi log HTTP Request dạng JSON đơn dòng ra stdout
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Không ghi log định kỳ cho /healthz để tránh làm đầy log hệ thống
    if (req.path === '/healthz') return;

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

// 7. Middleware chống CSRF
app.use(csrfMiddleware);

// 8. Cung cấp thông tin user hiện tại cho mọi View
app.use((req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
});

// 9. Endpoint kiểm tra sức khỏe hệ thống (Health Check)
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

// 10. Định tuyến chính
app.get('/', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/reports');
  }
  return res.redirect('/staff/dashboard');
});

// 11. Các router chức năng
app.use(authRoutes);
app.use('/staff', staffRoutes);
app.use('/admin', adminRoutes);

// 12. Xử lý lỗi 404 (Không tìm thấy trang)
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Không Tìm Thấy Trang',
    message: 'Địa chỉ bạn yêu cầu không tồn tại trên hệ thống.',
    statusCode: 404,
  });
});

// 13. Xử lý lỗi 500 (Ẩn chi tiết lỗi nội bộ để đảm bảo an toàn)
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

// 14. Khởi động máy chủ sau khi kiểm tra CSDL
async function startServer() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('server_started', {
      message: `Máy chủ điểm danh Node.js đang chạy tại cổng ${PORT}`,
      meta: { port: PORT, env: process.env.NODE_ENV || 'development' },
    });
  });
}

startServer().catch((err) => {
  logger.error('server_boot_error', { message: err.message });
  process.exit(1);
});
