const crypto = require('crypto');
const logger = require('../logger');

function csrfMiddleware(req, res, next) {
  // 1. Tạo token CSRF cho phiên nếu chưa có
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  // 2. Gán vào res.locals để mọi template EJS tự động nhận được
  res.locals.csrfToken = req.session.csrfToken;

  // 3. Với các phương thức thay đổi trạng thái (POST, PUT, DELETE, PATCH), bắt buộc kiểm tra token
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const clientToken = (req.body && req.body._csrf) || req.headers['x-csrf-token'];

  if (!clientToken || clientToken !== req.session.csrfToken) {
    logger.warn('csrf_validation_failed', {
      path: req.originalUrl,
      user_id: req.session.user ? req.session.user.id : null,
      message: 'CSRF Token không hợp lệ hoặc bị thiếu.',
    });
    return res.status(403).render('error', {
      title: '403 - Lỗi Bảo Mật CSRF',
      message: 'Yêu cầu của bạn bị từ chối do mã xác thực bảo mật (CSRF Token) không khớp hoặc đã hết hạn.',
      statusCode: 403,
    });
  }

  next();
}

module.exports = csrfMiddleware;
