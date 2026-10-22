// Module ghi log định dạng JSON đơn dòng ra stdout phục vụ thu thập log tập trung (Loki)
function logEvent({ level = 'info', event, user_id = null, path = null, status = null, duration_ms = null, message = null, meta = {} }) {
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
  };

  if (user_id !== null && user_id !== undefined) entry.user_id = user_id;
  if (path !== null && path !== undefined) entry.path = path;
  if (status !== null && status !== undefined) entry.status = status;
  if (duration_ms !== null && duration_ms !== undefined) entry.duration_ms = duration_ms;
  if (message) entry.message = message;

  // Ghép thêm metadata bổ sung nếu có
  if (meta && Object.keys(meta).length > 0) {
    Object.assign(entry, meta);
  }

  // Ghi đúng định dạng 1 dòng JSON ra stdout
  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports = {
  info: (event, opts = {}) => logEvent({ level: 'info', event, ...opts }),
  warn: (event, opts = {}) => logEvent({ level: 'warn', event, ...opts }),
  error: (event, opts = {}) => logEvent({ level: 'error', event, ...opts }),
  logEvent,
};
