const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const logger = require('../logger');
const { redirectIfAuth } = require('../middleware/auth');

const router = express.Router();

// GET /login
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', {
    title: 'Đăng Nhập - Hệ Thống Điểm Danh',
    error: req.query.error || null,
    username: '',
  });
});

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      logger.warn('login_failed', {
        path: '/login',
        status: 400,
        meta: { reason: 'missing_credentials' },
      });
      return res.status(400).render('login', {
        title: 'Đăng Nhập - Hệ Thống Điểm Danh',
        error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.',
        username: username || '',
      });
    }

    const [rows] = await query('SELECT * FROM users WHERE username = ?', [username.trim()]);

    if (rows.length === 0) {
      logger.warn('login_failed', {
        path: '/login',
        status: 401,
        meta: { username: username.trim(), reason: 'user_not_found' },
      });
      return res.status(401).render('login', {
        title: 'Đăng Nhập - Hệ Thống Điểm Danh',
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác hoặc tài khoản đã bị khóa.',
        username: username.trim(),
      });
    }

    const user = rows[0];

    // Kiểm tra tài khoản có bị khóa hay không
    if (user.is_active !== 1) {
      logger.warn('login_failed', {
        path: '/login',
        status: 401,
        meta: { username: user.username, reason: 'account_locked' },
      });
      return res.status(401).render('login', {
        title: 'Đăng Nhập - Hệ Thống Điểm Danh',
        error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.',
        username: user.username,
      });
    }

    // So khớp mật khẩu với hàm băm bcrypt
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      logger.warn('login_failed', {
        path: '/login',
        status: 401,
        meta: { username: user.username, reason: 'invalid_password' },
      });
      return res.status(401).render('login', {
        title: 'Đăng Nhập - Hệ Thống Điểm Danh',
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác hoặc tài khoản đã bị khóa.',
        username: user.username,
      });
    }

    // Thiết lập thông tin người dùng vào Session
    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };

    logger.info('login_success', {
      user_id: user.id,
      path: '/login',
      status: 200,
    });

    if (user.role === 'admin') {
      return res.redirect('/admin/reports');
    }
    return res.redirect('/staff/dashboard');
  } catch (err) {
    next(err);
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  const userId = req.session && req.session.user ? req.session.user.id : null;
  req.session.destroy((err) => {
    if (err) {
      logger.error('logout_failed', { user_id: userId, message: err.message });
    }
    res.clearCookie('diemdanh_session');
    res.redirect('/login');
  });
});

module.exports = router;
