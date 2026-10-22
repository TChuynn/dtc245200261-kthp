const express = require('express');
const { query } = require('../db');
const logger = require('../logger');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getVietnamDateString,
  getVietnamTimeString,
  getVietnamDateTimeString,
  timeStringToMinutes,
  getCurrentMinutesVietnam,
} = require('../utils/time');
const { attendanceCheckinsTotal } = require('../metrics');

const router = express.Router();

// Mọi route staff yêu cầu đăng nhập và có quyền staff
router.use(requireAuth);
router.use(requireRole('staff'));

// GET /staff/dashboard - Xem ca hôm nay và trạng thái điểm danh
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const todayStr = getVietnamDateString();
    const nowTimeStr = getVietnamTimeString();

    const [assignments] = await query(
      `SELECT 
         sa.id AS assignment_id,
         sa.assigned_date,
         s.id AS shift_id,
         s.name AS shift_name,
         s.start_time,
         s.end_time,
         al.id AS attendance_id,
         al.check_in,
         al.check_out,
         al.status
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       LEFT JOIN attendance_logs al ON al.assignment_id = sa.id
       WHERE sa.user_id = ? AND sa.assigned_date = ?
       ORDER BY s.start_time ASC`,
      [userId, todayStr]
    );

    res.render('staff/dashboard', {
      title: 'Bảng Điều Khiển Nhân Viên - Điểm Danh',
      todayStr,
      nowTimeStr,
      assignments,
      success: req.query.success || null,
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /staff/check-in - Điểm danh vào ca
router.post('/check-in', async (req, res, next) => {
  const userId = req.session.user.id;
  try {
    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Thiếu thông tin ca làm việc.'));
    }

    const [assignments] = await query(
      `SELECT sa.*, s.start_time, s.end_time, s.name AS shift_name
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       WHERE sa.id = ? AND sa.user_id = ?`,
      [assignment_id, userId]
    );

    if (assignments.length === 0) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Không tìm thấy ca làm việc được phân công.'));
    }

    const assignment = assignments[0];
    const todayStr = getVietnamDateString();

    if (assignment.assigned_date !== todayStr) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Chỉ được phép điểm danh cho ca làm việc trong ngày hôm nay.'));
    }

    // Kiểm tra quy tắc: mỗi ca mỗi ngày chỉ điểm danh một lần
    const [existingLogs] = await query(
      'SELECT id, check_in FROM attendance_logs WHERE assignment_id = ?',
      [assignment.id]
    );

    if (existingLogs.length > 0 && existingLogs[0].check_in) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Bạn đã thực hiện điểm danh vào (check-in) cho ca này rồi.'));
    }

    // Kiểm tra thời gian: từ 30 phút trước giờ bắt đầu đến hết ca
    const currentMinutes = getCurrentMinutesVietnam();
    const startMinutes = timeStringToMinutes(assignment.start_time);
    const endMinutes = timeStringToMinutes(assignment.end_time);

    if (currentMinutes < startMinutes - 30) {
      const allowedTime = assignment.start_time.slice(0, 5);
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent(
        `Chưa đến giờ điểm danh. Bạn chỉ có thể điểm danh từ 30 phút trước khi bắt đầu ca (${allowedTime}).`
      ));
    }

    if (currentMinutes > endMinutes) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent(
        `Ca làm việc (${assignment.shift_name}) đã kết thúc lúc ${assignment.end_time.slice(0, 5)}, không thể điểm danh.`
      ));
    }

    // Quy tắc: check-in sau giờ bắt đầu 10 phút tính là đi muộn
    const status = currentMinutes > startMinutes + 10 ? 'late' : 'on_time';
    const nowDateTime = getVietnamDateTimeString();

    await query(
      `INSERT INTO attendance_logs (assignment_id, user_id, shift_id, attendance_date, check_in, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [assignment.id, userId, assignment.shift_id, todayStr, nowDateTime, status]
    );

    // Ghi nhận metric nghiệp vụ check-in theo trạng thái on_time/late
    attendanceCheckinsTotal.inc({ status });

    logger.info('check_in', {
      user_id: userId,
      path: '/staff/check-in',
      status: 200,
      meta: {
        assignment_id: assignment.id,
        shift_id: assignment.shift_id,
        attendance_status: status,
      },
    });

    const msg = status === 'late'
      ? 'Điểm danh vào thành công lúc ' + nowDateTime.slice(11) + ' (Ghi nhận: Đi muộn).'
      : 'Điểm danh vào thành công lúc ' + nowDateTime.slice(11) + ' (Ghi nhận: Đúng giờ).';

    res.redirect('/staff/dashboard?success=' + encodeURIComponent(msg));
  } catch (err) {
    logger.error('check_in_error', { user_id: userId, message: err.message });
    next(err);
  }
});

// POST /staff/check-out - Điểm danh ra ca
router.post('/staff/check-out', (req, res) => res.redirect(307, '/staff/check-out')); // alias nếu có
router.post('/check-out', async (req, res, next) => {
  const userId = req.session.user.id;
  try {
    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Thiếu thông tin ca làm việc.'));
    }

    const [assignments] = await query(
      `SELECT sa.*, s.start_time, s.end_time, s.name AS shift_name
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       WHERE sa.id = ? AND sa.user_id = ?`,
      [assignment_id, userId]
    );

    if (assignments.length === 0) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Không tìm thấy ca làm việc.'));
    }

    const assignment = assignments[0];

    const [logs] = await query(
      'SELECT id, check_in, check_out FROM attendance_logs WHERE assignment_id = ?',
      [assignment.id]
    );

    if (logs.length === 0 || !logs[0].check_in) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Bạn chưa điểm danh vào (check-in) cho ca này.'));
    }

    if (logs[0].check_out) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Bạn đã điểm danh ra (check-out) cho ca này rồi.'));
    }

    const nowDateTime = getVietnamDateTimeString();

    // Quy tắc: check-out phải sau check-in
    if (nowDateTime <= logs[0].check_in) {
      return res.redirect('/staff/dashboard?error=' + encodeURIComponent('Thời gian check-out phải sau thời gian check-in.'));
    }

    await query(
      'UPDATE attendance_logs SET check_out = ? WHERE id = ?',
      [nowDateTime, logs[0].id]
    );

    logger.info('check_out', {
      user_id: userId,
      path: '/staff/check-out',
      status: 200,
      meta: {
        assignment_id: assignment.id,
        shift_id: assignment.shift_id,
      },
    });

    res.redirect('/staff/dashboard?success=' + encodeURIComponent('Điểm danh ra (check-out) thành công lúc ' + nowDateTime.slice(11) + '.'));
  } catch (err) {
    logger.error('check_out_error', { user_id: userId, message: err.message });
    next(err);
  }
});

// GET /staff/history - Lịch sử điểm danh cá nhân theo tháng có phân trang
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const currentMonth = getVietnamDateString().slice(0, 7);
    const month = req.query.month || currentMonth;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 10;
    const offset = (page - 1) * limit;

    // Đếm tổng số bản ghi
    const [countRows] = await query(
      `SELECT COUNT(*) AS total
       FROM attendance_logs
       WHERE user_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
      [userId, month]
    );
    const totalCount = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    // Lấy danh sách nhật ký
    const [logs] = await query(
      `SELECT 
         al.id,
         al.attendance_date,
         al.check_in,
         al.check_out,
         al.status,
         s.name AS shift_name,
         s.start_time,
         s.end_time,
         CASE 
           WHEN al.check_in IS NOT NULL AND al.check_out IS NOT NULL 
           THEN ROUND(TIMESTAMPDIFF(SECOND, al.check_in, al.check_out) / 3600.0, 2)
           ELSE 0
         END AS duration_hours
       FROM attendance_logs al
       JOIN shifts s ON al.shift_id = s.id
       WHERE al.user_id = ? AND DATE_FORMAT(al.attendance_date, '%Y-%m') = ?
       ORDER BY al.attendance_date DESC, al.check_in DESC
       LIMIT ? OFFSET ?`,
      [userId, month, limit, offset]
    );

    res.render('staff/history', {
      title: 'Lịch Sử Điểm Danh Cá Nhân',
      month,
      page,
      totalPages,
      totalCount,
      logs,
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
