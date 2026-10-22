const mysql = require('mysql2/promise');
const logger = require('./logger');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'diemdanh_app',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'quan_ly_diem_danh',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,
});

async function healthCheck() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

async function initDb() {
  try {
    const isHealthy = await healthCheck();
    if (isHealthy) {
      logger.info('db_connected', { message: 'Kết nối cơ sở dữ liệu MySQL thành công.' });
    }

    // Kiểm tra và tự động nạp seed data nếu bảng users đang trống
    const [userCount] = await pool.query('SELECT COUNT(*) AS count FROM users');
    if (userCount[0].count === 0) {
      logger.info('db_auto_seed', { message: 'Bảng users chưa có dữ liệu, thực hiện tự động seed...' });
      const seed = require('../db/seed');
      await seed();
      logger.info('db_auto_seed_success', { message: 'Tự động seed dữ liệu hoàn tất.' });
    }
  } catch (err) {
    logger.error('db_init_failed', { message: 'Khởi tạo kết nối DB thất bại: ' + err.message });
  }
}

module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  healthCheck,
  initDb,
};
