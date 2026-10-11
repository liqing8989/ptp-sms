// 号码检测（演示规则）：
//  - 有效：11 位，1[3-9] 开头，且不属于虚拟运营商号段
//  - 虚拟：虚拟运营商号段 170/171/162/165/167/192
//  - 固话：0 开头、10-12 位
//  - T（携号转网）：演示中按无效处理（无法从号码本身识别）
// 返回 { kind: 'valid'|'virtual'|'landline'|'invalid', digits }
const VIRTUAL_SEGMENTS = ['170', '171', '162', '165', '167', '192'];

function classifyLine(line) {
  const raw = String(line == null ? '' : line).trim();
  if (!raw) return { kind: 'invalid', digits: '' };
  // 允许形如 T138... 的前缀（演示），按 T 计为无效
  const tPrefix = /^[Tt]/.test(raw);
  const digits = raw.replace(/[^\d]/g, '');
  if (/^1[3-9]\d{9}$/.test(digits)) {
    const seg = digits.slice(0, 3);
    if (VIRTUAL_SEGMENTS.includes(seg)) return { kind: 'virtual', digits };
    return { kind: 'valid', digits };
  }
  if (/^0\d{9,11}$/.test(digits)) return { kind: 'landline', digits };
  if (/^1\d{10}$/.test(digits)) return { kind: 'virtual', digits };
  if (tPrefix && digits.length >= 8) return { kind: 'invalid', digits };
  return { kind: 'invalid', digits };
}

// 解析多行号码文本，返回统计结果
function parseNumbers(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const total = lines.length;
  let valid = 0, tVoip = 0, invalid = 0;
  const validList = [];
  const filteredList = []; // {num, kind}
  const invalidList = [];
  for (const line of lines) {
    const r = classifyLine(line);
    if (r.kind === 'valid') { valid++; validList.push(r.digits); }
    else if (r.kind === 'virtual' || r.kind === 'landline') { tVoip++; filteredList.push({ num: line, kind: r.kind }); }
    else { invalid++; invalidList.push({ num: line, kind: 'invalid' }); }
  }
  return { total, valid, tVoip, invalid, validList, filteredList, invalidList };
}

module.exports = { classifyLine, parseNumbers, VIRTUAL_SEGMENTS };
