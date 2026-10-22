const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const logger = require('../logger');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getVietnamDateString } = require('../utils/time');

const router = express.Router();

// Mọi route admin yêu cầu đăng nhập và có quyền admin
router.use(requireAuth);
router.use(requireRole('admin'));

// GET /admin/reports - Báo cáo tổng hợp theo tháng
router.get('/reports', async (req, res, next) => {
  try {
    const currentMonth = getVietnamDateString().slice(0, 7);
    const month = req.query.month || currentMonth;

    const [reports] = await query(
      `SELECT 
         u.id AS user_id,
         u.username,
         u.full_name,
         u.is_active,
         COUNT(DISTINCT sa.id) AS total_assigned_shifts,
         COUNT(DISTINCT al.id) AS total_attended_shifts,
         COUNT(DISTINCT CASE WHEN al.status = 'late' THEN al.id END) AS late_count,
         COALESCE(ROUND(SUM(CASE WHEN al.check_in IS NOT NULL AND al.check_out IS NOT NULL THEN TIMESTAMPDIFF(SECOND, al.check_in, al.check_out) / 3600.0 ELSE 0 END), 2), 0) AS total_working_hours
       FROM users u
       LEFT JOIN shift_assignments sa ON u.id = sa.user_id AND DATE_FORMAT(sa.assigned_date, '%Y-%m') = ?
       LEFT JOIN attendance_logs al ON sa.id = al.assignment_id
       WHERE u.role = 'staff'
       GROUP BY u.id, u.username, u.full_name, u.is_active
       ORDER BY u.id ASC`,
      [month]
    );

    res.render('admin/reports', {
      title: 'Báo Cáo Điểm Danh Tháng - Quản Trị Viên',
      month,
      reports,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/reports/export-csv - Xuất file CSV báo cáo tháng
router.get('/reports/export-csv', async (req, res, next) => {
  try {
    const currentMonth = getVietnamDateString().slice(0, 7);
    const month = req.query.month || currentMonth;

    const [reports] = await query(
      `SELECT 
         u.id AS user_id,
         u.username,
         u.full_name,
         COUNT(DISTINCT sa.id) AS total_assigned_shifts,
         COUNT(DISTINCT al.id) AS total_attended_shifts,
         COUNT(DISTINCT CASE WHEN al.status = 'late' THEN al.id END) AS late_count,
         COALESCE(ROUND(SUM(CASE WHEN al.check_in IS NOT NULL AND al.check_out IS NOT NULL THEN TIMESTAMPDIFF(SECOND, al.check_in, al.check_out) / 3600.0 ELSE 0 END), 2), 0) AS total_working_hours
       FROM users u
       LEFT JOIN shift_assignments sa ON u.id = sa.user_id AND DATE_FORMAT(sa.assigned_date, '%Y-%m') = ?
       LEFT JOIN attendance_logs al ON sa.id = al.assignment_id
       WHERE u.role = 'staff'
       GROUP BY u.id, u.username, u.full_name
       ORDER BY u.id ASC`,
      [month]
    );

    // Ký tự UTF-8 BOM (\uFEFF) giúp Microsoft Excel hiển thị đúng dấu tiếng Việt
    let csv = '\uFEFF';
    csv += 'Mã NV,Tên đăng nhập,Họ và tên,Số ca phân công,Số ca đã làm,Số lần đi muộn,Tổng giờ làm (giờ)\n';

    for (const r of reports) {
      const escape = (str) => `"${String(str).replace(/"/g, '""')}"`;
      csv += [
        r.user_id,
        escape(r.username),
        escape(r.full_name),
        r.total_assigned_shifts,
        r.total_attended_shifts,
        r.late_count,
        r.total_working_hours,
      ].join(',') + '\n';
    }

    logger.info('admin_action', {
      user_id: req.session.user.id,
      path: '/admin/reports/export-csv',
      status: 200,
      meta: { action: 'export_csv', month, record_count: reports.length },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-thang-${month}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /admin/users - Quản lý danh sách nhân viên
router.get('/users', async (req, res, next) => {
  try {
    const [users] = await query(
      'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY role ASC, id ASC'
    );

    res.render('admin/users', {
      title: 'Quản Lý Người Dùng & Nhân Viên',
      users,
      success: req.query.success || null,
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/users - Tạo tài khoản nhân viên mới
router.post('/users', async (req, res, next) => {
  try {
    const { username, full_name, password } = req.body;

    if (!username || !full_name || !password) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Vui lòng điền đầy đủ các thông tin bắt buộc.'));
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Tên đăng nhập chỉ gồm 3-30 ký tự chữ thường, số hoặc gạch dưới.'));
    }

    if (password.length < 6) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Mật khẩu phải chứa ít nhất 6 ký tự.'));
    }

    const [existing] = await query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing.length > 0) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Tên đăng nhập này đã được sử dụng.'));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, "staff", 1)',
      [cleanUsername, passwordHash, full_name.trim()]
    );

    logger.info('admin_action', {
      user_id: req.session.user.id,
      path: '/admin/users',
      status: 200,
      meta: { action: 'create_user', target_username: cleanUsername },
    });

    res.redirect('/admin/users?success=' + encodeURIComponent(`Đã tạo tài khoản nhân viên "${cleanUsername}" thành công.`));
  } catch (err) {
    next(err);
  }
});

// POST /admin/users/:id/toggle - Khóa hoặc mở khóa tài khoản
router.post('/users/:id/toggle', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.session.user.id) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Không thể tự khóa tài khoản quản trị của chính mình.'));
    }

    const [targetRows] = await query('SELECT id, username, role, is_active FROM users WHERE id = ?', [targetId]);
    if (targetRows.length === 0) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Không tìm thấy tài khoản người dùng.'));
    }

    const targetUser = targetRows[0];
    const newStatus = targetUser.is_active === 1 ? 0 : 1;

    await query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, targetId]);

    logger.info('admin_action', {
      user_id: req.session.user.id,
      path: `/admin/users/${targetId}/toggle`,
      status: 200,
      meta: { action: 'toggle_user', target_user_id: targetId, new_status: newStatus },
    });

    const statusText = newStatus === 1 ? 'Mở khóa' : 'Khóa';
    res.redirect('/admin/users?success=' + encodeURIComponent(`Đã ${statusText.toLowerCase()} tài khoản "${targetUser.username}" thành công.`));
  } catch (err) {
    next(err);
  }
});

// GET /admin/shifts - Quản lý ca làm việc
router.get('/shifts', async (req, res, next) => {
  try {
    const [shifts] = await query('SELECT * FROM shifts ORDER BY start_time ASC');
    res.render('admin/shifts', {
      title: 'Quản Lý Ca Làm Việc',
      shifts,
      success: req.query.success || null,
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/shifts - Tạo ca làm việc mới
router.post('/shifts', async (req, res, next) => {
  try {
    const { name, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
      return res.redirect('/admin/shifts?error=' + encodeURIComponent('Vui lòng nhập tên ca, giờ bắt đầu và giờ kết thúc.'));
    }

    const startTimeFormatted = start_time.length === 5 ? `${start_time}:00` : start_time;
    const endTimeFormatted = end_time.length === 5 ? `${end_time}:00` : end_time;

    if (startTimeFormatted >= endTimeFormatted) {
      return res.redirect('/admin/shifts?error=' + encodeURIComponent('Giờ bắt đầu ca phải trước giờ kết thúc ca.'));
    }

    await query(
      'INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)',
      [name.trim(), startTimeFormatted, endTimeFormatted]
    );

    logger.info('admin_action', {
      user_id: req.session.user.id,
      path: '/admin/shifts',
      status: 200,
      meta: { action: 'create_shift', shift_name: name.trim() },
    });

    res.redirect('/admin/shifts?success=' + encodeURIComponent(`Đã thêm ca làm việc "${name.trim()}" thành công.`));
  } catch (err) {
    next(err);
  }
});

// GET /admin/assignments - Phân ca làm việc theo ngày
router.get('/assignments', async (req, res, next) => {
  try {
    const todayStr = getVietnamDateString();
    const date = req.query.date || todayStr;

    const [staffList] = await query(
      "SELECT id, username, full_name FROM users WHERE role = 'staff' AND is_active = 1 ORDER BY full_name ASC"
    );

    const [shiftList] = await query('SELECT id, name, start_time, end_time FROM shifts ORDER BY start_time ASC');

    const [assignments] = await query(
      `SELECT 
         sa.id AS assignment_id,
         sa.assigned_date,
         u.id AS user_id,
         u.username,
         u.full_name,
         s.id AS shift_id,
         s.name AS shift_name,
         s.start_time,
         s.end_time,
         al.check_in,
         al.check_out,
         al.status
       FROM shift_assignments sa
       JOIN users u ON sa.user_id = u.id
       JOIN shifts s ON sa.shift_id = s.id
       LEFT JOIN attendance_logs al ON al.assignment_id = sa.id
       WHERE sa.assigned_date = ?
       ORDER BY s.start_time ASC, u.full_name ASC`,
      [date]
    );

    res.render('admin/assignments', {
      title: 'Phân Ca Làm Việc Theo Ngày',
      date,
      staffList,
      shiftList,
      assignments,
      success: req.query.success || null,
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/assignments - Gán ca làm cho nhân viên
router.post('/assignments', async (req, res, next) => {
  try {
    const { user_id, shift_id, assigned_date } = req.body;

    if (!user_id || !shift_id || !assigned_date) {
      return res.redirect('/admin/assignments?error=' + encodeURIComponent('Vui lòng chọn nhân viên, ca làm và ngày phân công.'));
    }

    const [existing] = await query(
      'SELECT id FROM shift_assignments WHERE user_id = ? AND shift_id = ? AND assigned_date = ?',
      [user_id, shift_id, assigned_date]
    );

    if (existing.length > 0) {
      return res.redirect(`/admin/assignments?date=${assigned_date}&error=` + encodeURIComponent('Nhân viên này đã được phân ca làm việc này trong ngày đã chọn.'));
    }

    await query(
      'INSERT INTO shift_assignments (user_id, shift_id, assigned_date) VALUES (?, ?, ?)',
      [user_id, shift_id, assigned_date]
    );

    logger.info('admin_action', {
      user_id: req.session.user.id,
      path: '/admin/assignments',
      status: 200,
      meta: { action: 'assign_shift', target_user_id: user_id, shift_id, assigned_date },
    });

    res.redirect(`/admin/assignments?date=${assigned_date}&success=` + encodeURIComponent('Phân ca làm việc thành công.'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
