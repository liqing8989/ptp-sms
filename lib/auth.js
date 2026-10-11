// 认证：scrypt 密码哈希 + HMAC 签名 token（零第三方依赖）
const crypto = require('crypto');
const SECRET = 'lvqing-sms-demo-secret-2026';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// 认证中间件：校验 Bearer token 并加载用户，校验账号有效期
function auth(db) {
  return function (req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ code: 1, message: '未登录或登录已过期，请重新登录' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) {
      return res.status(401).json({ code: 1, message: '账号不存在' });
    }
    if (user.expire_at && new Date(user.expire_at.replace(' ', 'T') + '+08:00').getTime() < Date.now()) {
      return res.status(403).json({ code: 1, message: '账号有效期已过期，请联系上级充值或续期' });
    }
    req.user = user;
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.is_admin !== 1) {
    return res.status(403).json({ code: 1, message: '仅管理员可执行该操作' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, auth, requireAdmin };
