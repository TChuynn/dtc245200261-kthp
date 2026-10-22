const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function seed() {
  const host = process.env.MYSQL_HOST || 'mysql';
  const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.MYSQL_USER || 'diemdanh_app';
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE || 'quan_ly_diem_danh';

  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'AdminPass_2026!';
  const staffPass = process.env.SEED_STAFF_PASSWORD || 'StaffPass_2026!';

  console.log('--- Bắt đầu khởi tạo dữ liệu mẫu (Seed Data) ---');

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4',
    timezone: '+07:00',
  });

  try {
    // 1. Kiểm tra nếu đã có dữ liệu người dùng thì không seed lại
    const [existingUsers] = await connection.query('SELECT COUNT(*) AS count FROM users');
    if (existingUsers[0].count > 0) {
      console.log('Dữ liệu người dùng đã tồn tại trong CSDL, bỏ qua seed.');
      return;
    }

    console.log('Băm mật khẩu người dùng bằng bcrypt...');
    const adminHash = await bcrypt.hash(adminPass, 10);
    const staffHash = await bcrypt.hash(staffPass, 10);

    // 2. Thêm người dùng (1 Admin + 10 Nhân viên)
    const usersData = [
      ['admin', adminHash, 'Quản Trị Viên', 'admin', 1],
      ['staff01', staffHash, 'Nguyễn Văn An', 'staff', 1],
      ['staff02', staffHash, 'Trần Thị Mai', 'staff', 1],
      ['staff03', staffHash, 'Lê Hoàng Long', 'staff', 1],
      ['staff04', staffHash, 'Phạm Minh Tuấn', 'staff', 1],
      ['staff05', staffHash, 'Hoàng Thu Trang', 'staff', 1],
      ['staff06', staffHash, 'Vũ Đức Thịnh', 'staff', 1],
      ['staff07', staffHash, 'Đỗ Bích Ngọc', 'staff', 1],
      ['staff08', staffHash, 'Bùi Quốc Huy', 'staff', 1],
      ['staff09', staffHash, 'Ngô Gia Bảo', 'staff', 1],
      ['staff10', staffHash, 'Đặng Thảo Vy', 'staff', 1],
    ];

    for (const u of usersData) {
      await connection.query(
        'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?)',
        u
      );
    }
    console.log(`Đã thêm ${usersData.length} tài khoản người dùng.`);

    // 3. Thêm 3 ca làm việc
    const shiftsData = [
      ['Ca Sáng', '08:00:00', '12:00:00'],
      ['Ca Chiều', '13:30:00', '17:30:00'],
      ['Ca Tối', '18:00:00', '22:00:00'],
    ];

    for (const s of shiftsData) {
      await connection.query(
        'INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)',
        s
      );
    }
    console.log('Đã tạo 3 ca làm việc chuẩn.');

    // Lấy ID của staff và shifts
    const [staffRows] = await connection.query("SELECT id, username FROM users WHERE role = 'staff' ORDER BY id ASC");
    const [shiftRows] = await connection.query('SELECT id, name, start_time, end_time FROM shifts ORDER BY id ASC');

    // 4. Sinh dữ liệu phân ca và điểm danh cho 30 ngày (từ 29 ngày trước đến hôm nay)
    console.log('Đang tạo dữ liệu phân ca và điểm danh cho 30 ngày...');
    const today = new Date();
    let totalAssignments = 0;
    let totalLogs = 0;

    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const dateStr = formatLocalDate(d);

      // Phân ca cho mỗi nhân viên một ca phù hợp
      for (let i = 0; i < staffRows.length; i++) {
        const staff = staffRows[i];
        // Xoay vòng ca làm việc: 3 ca
        const shift = shiftRows[(i + dayOffset) % shiftRows.length];

        const [assignRes] = await connection.query(
          'INSERT INTO shift_assignments (user_id, shift_id, assigned_date) VALUES (?, ?, ?)',
          [staff.id, shift.id, dateStr]
        );
        const assignmentId = assignRes.insertId;
        totalAssignments++;

        // Đối với các ngày trước hôm nay, sinh nhật ký điểm danh có sẵn
        if (dayOffset > 0) {
          // Phân bố: 85% đúng giờ, 15% đi muộn
          const isLate = (i + dayOffset) % 7 === 0;
          const status = isLate ? 'late' : 'on_time';

          const [startH, startM] = shift.start_time.split(':').map(Number);
          const [endH, endM] = shift.end_time.split(':').map(Number);

          let inH = startH;
          let inM = isLate ? startM + 15 : (startM - 10 >= 0 ? startM - 10 : 0);
          if (inM >= 60) {
            inH += Math.floor(inM / 60);
            inM %= 60;
          }

          const inTimeStr = `${dateStr} ${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:00`;
          const outTimeStr = `${dateStr} ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

          await connection.query(
            'INSERT INTO attendance_logs (assignment_id, user_id, shift_id, attendance_date, check_in, check_out, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [assignmentId, staff.id, shift.id, dateStr, inTimeStr, outTimeStr, status]
          );
          totalLogs++;
        }
      }
    }

    console.log(`Hoàn tất seed dữ liệu: ${totalAssignments} lượt phân ca, ${totalLogs} nhật ký điểm danh.`);
  } catch (err) {
    console.error('Lỗi khi chạy seed data:', err.message);
    throw err;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = seed;
