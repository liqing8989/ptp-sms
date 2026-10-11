// 号码 E.164 标准化（提交时调用）：
//  - 已带 + 号：保留 + 后仅留数字
//  - 纯 10 位（美国手机号）：自动补 +1 前缀
//  - 其余（如国内 11 位手机号）：原样保留数字串（真实 Twilio 通道下会因号码格式被标记失败，属预期）
function normalizeNumber(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    return '+' + raw.slice(1).replace(/\D/g, '');
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits;
}

// 真实通道下是否为可发送的 E.164（+ 开头，10~15 位数字）
function isE164(num) {
  return /^\+\d{10,15}$/.test(String(num || ''));
}

module.exports = { normalizeNumber, isE164 };
