// 系统设置（key/value 表）：当前用于存储 Twilio 通道凭证，仅管理员可读
const KEYS = ['twilio_account_sid', 'twilio_auth_token', 'twilio_from_number'];

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : '';
}

function setSetting(db, key, value) {
  db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value == null ? '' : value));
}

function getTwilioConfig(db) {
  const sid = getSetting(db, 'twilio_account_sid').trim();
  const token = getSetting(db, 'twilio_auth_token').trim();
  const from = getSetting(db, 'twilio_from_number').trim();
  return { sid, token, from, configured: !!(sid && token && from) };
}

module.exports = { KEYS, getSetting, setSetting, getTwilioConfig };
