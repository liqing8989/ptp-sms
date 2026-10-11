// 北京时间工具：系统内所有 created_at 均以北京时间（UTC+8）字符串存储
// 'YYYY-MM-DD HH:mm:ss'，统计按字符串前缀分组，保证与顶部北京时间一致。
const BJ_OFFSET = 8 * 3600 * 1000;

function p2(n) { return String(n).padStart(2, '0'); }

function bjNow(ms) {
  const d = new Date((ms == null ? Date.now() : ms) + BJ_OFFSET);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

function bjToday() { return bjNow().slice(0, 10); }
function bjMonth() { return bjNow().slice(0, 7); }

// 返回北京时间下的偏移分钟时间字符串
function tsAgo(minutes) { return bjNow(Date.now() - minutes * 60000); }

function addDaysBJ(days) { return bjNow(Date.now() + days * 86400000); }

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { bjNow, bjToday, bjMonth, tsAgo, addDaysBJ, round2 };
