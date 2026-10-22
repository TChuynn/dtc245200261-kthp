#!/bin/sh
set -e

# Khởi tạo người dùng riêng cho mysqld-exporter với quyền tối thiểu (PROCESS, REPLICATION CLIENT, SELECT)
if [ -n "$MYSQL_EXPORTER_PASSWORD" ]; then
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
    CREATE USER IF NOT EXISTS 'diemdanh_exporter'@'%' IDENTIFIED BY '$MYSQL_EXPORTER_PASSWORD';
    GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'diemdanh_exporter'@'%';
    FLUSH PRIVILEGES;
EOSQL
fi
