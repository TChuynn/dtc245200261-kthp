-- Phân quyền tối thiểu cho người dùng ứng dụng và vô hiệu hóa root từ xa
USE quan_ly_diem_danh;

-- Thu hồi toàn bộ quyền thừa nếu có và chỉ cấp quyền SELECT, INSERT, UPDATE, DELETE cho user ứng dụng
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'diemdanh_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON quan_ly_diem_danh.* TO 'diemdanh_app'@'%';

-- Xóa quyền đăng nhập từ xa của root (chỉ cho phép đăng nhập tại localhost / bên trong container)
DROP USER IF EXISTS 'root'@'%';
FLUSH PRIVILEGES;
