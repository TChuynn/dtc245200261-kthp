// Tiện ích xử lý ngày và giờ theo múi giờ chuẩn Asia/Ho_Chi_Minh (UTC+7)
function getVietnamDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // Định dạng: YYYY-MM-DD
}

function getVietnamTimeString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date); // Định dạng: HH:MM:SS
}

function getVietnamDateTimeString(date = new Date()) {
  return `${getVietnamDateString(date)} ${getVietnamTimeString(date)}`;
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getCurrentMinutesVietnam() {
  const timeStr = getVietnamTimeString();
  return timeStringToMinutes(timeStr);
}

module.exports = {
  getVietnamDateString,
  getVietnamTimeString,
  getVietnamDateTimeString,
  timeStringToMinutes,
  getCurrentMinutesVietnam,
};
