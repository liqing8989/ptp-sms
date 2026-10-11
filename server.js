// PTP SMS 1.0 短信营销群发管理后台 —— 服务入口
// 技术栈：Express + Node 内置 node:sqlite（文件型 SQLite，Windows 直接可用）
const path = require('path');
const express = require('express');
const { open } = require('./lib/db');
const { bjNow, bjToday, bjMonth, round2, addDaysBJ } = require('./lib/time');
const { hashPassword, verifyPassword, signToken, auth, requireAdmin } = require('./lib/auth');
const { checkContent } = require('./lib/sensitive');
const { parseNumbers } = require('./lib/filter');
const queue = require('./lib/queue');
const settings = require('./lib/settings');
const twilio = require('./lib/twilio');
const e164 = require('./lib/e164');

const PORT = 8080;
const db = open();
queue.init(db);

const app = express();
app.set('x-powered-by', false);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false })); // Twilio 回调为 form 编码
app.use(express.static(path.join(__dirname, 'public')));

const ok = (data) => ({ code: 0, data });
const err = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

function safeUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, balance: u.balance, expire_at: u.expire_at, is_admin: u.is_admin, created_at: u.created_at };
}

function likeEscape(s) {
  return String(s || '').replace(/[\\%_]/g, (c) => '\\' + c);
}

// ---------- 认证 ----------
app.post('/api/auth/register', (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const name = String(username || '').trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) throw err(400, '用户名需为 3-20 位字母、数字或下划线');
    if (!password || String(password).length < 6) throw err(400, '密码至少 6 位');
    const exists = db.prepare('SELECT id FROM users WHERE username=?').get(name);
    if (exists) throw err(400, '用户名已存在');
    const r = db.prepare('INSERT INTO users(username,password_hash,balance,expire_at,is_admin,created_at) VALUES(?,?,?,?,?,?)')
      .run(name, hashPassword(password), 500, addDaysBJ(300), 0, bjNow());
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
    const token = signToken({ uid: user.id, u: user.username, exp: Date.now() + 7 * 24 * 3600 * 1000 });
    res.json(ok({ token, user: safeUser(user) }));
  } catch (e) { next(e); }
});

app.post('/api/auth/login', (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim());
    if (!user || !verifyPassword(password, user.password_hash)) throw err(400, '用户名或密码错误');
    if (user.expire_at && new Date(user.expire_at.replace(' ', 'T') + '+08:00').getTime() < Date.now()) {
      throw err(403, '账号有效期已过期，请联系上级充值或续期');
    }
    const token = signToken({ uid: user.id, u: user.username, exp: Date.now() + 7 * 24 * 3600 * 1000 });
    res.json(ok({ token, user: safeUser(user) }));
  } catch (e) { next(e); }
});

app.get('/api/user/me', auth(db), (req, res) => {
  res.json(ok({ user: safeUser(req.user) }));
});

// ---------- 首页统计 ----------
app.get('/api/stats', auth(db), (req, res) => {
  const uid = req.user.id;
  const today = bjToday();
  const month = bjMonth();
  const q = (sql, ...p) => db.prepare(sql).get(...p);
  const todayBatches = q("SELECT COUNT(*) c FROM batches WHERE user_id=? AND substr(created_at,1,10)=?", uid, today).c;
  const todayBatchMsgs = q("SELECT IFNULL(SUM(message_count),0) s FROM batches WHERE user_id=? AND substr(created_at,1,10)=?", uid, today).s;
  const todaySent = q("SELECT COUNT(*) c FROM messages WHERE user_id=? AND direction='send' AND status='success' AND substr(created_at,1,10)=?", uid, today).c;
  const monthSent = q("SELECT COUNT(*) c FROM messages WHERE user_id=? AND direction='send' AND status='success' AND substr(created_at,1,7)=?", uid, month).c;
  const totalSent = q("SELECT COUNT(*) c FROM messages WHERE user_id=? AND direction='send' AND status='success'", uid).c;
  const todayRecv = q("SELECT COUNT(*) c FROM messages WHERE user_id=? AND direction='receive' AND substr(created_at,1,10)=?", uid, today).c;
  const totalRecv = q("SELECT COUNT(*) c FROM messages WHERE user_id=? AND direction='receive'", uid).c;
  const pct = (a, b) => (b > 0 ? round2((a / b) * 100) : 0);
  res.json(ok({
    today_batches: todayBatches,
    today_batch_msgs: todayBatchMsgs,
    today_reply_rate: pct(todayRecv, todaySent),
    total_reply_rate: pct(totalRecv, totalSent),
    today_sent: todaySent,
    month_sent: monthSent,
    total_sent: totalSent
  }));
});

app.get('/api/announcements', auth(db), (req, res) => {
  const list = db.prepare('SELECT id,title,content,created_at FROM announcements ORDER BY sort ASC, id ASC').all();
  res.json(ok({ list }));
});

// ---------- 聊天 ----------
app.get('/api/chat/conversations', auth(db), (req, res) => {
  const uid = req.user.id;
  const tab = String(req.query.tab || 'all');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const msgs = db.prepare("SELECT * FROM messages WHERE user_id=? AND status='success' ORDER BY created_at DESC, id DESC").all(uid);
  const map = new Map();
  for (const m of msgs) {
    const key = m.direction === 'send' ? m.to_number : m.from_number;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { number: key, send_count: 0, reply_count: 0, unread_count: 0, last_content: '', last_time: '' });
    }
    const c = map.get(key);
    if (m.direction === 'send') c.send_count++;
    else {
      c.reply_count++;
      if (m.read_flag === 0) c.unread_count++;
    }
    if (!c.last_time || m.created_at > c.last_time) { c.last_time = m.created_at; c.last_content = m.content; }
  }
  let list = [...map.values()];
  if (tab === 'replied') list = list.filter((c) => c.reply_count > 0);
  if (tab === 'unread') list = list.filter((c) => c.unread_count > 0);
  list.sort((a, b) => (a.last_time < b.last_time ? 1 : -1));
  const total = list.length;
  const rows = list.slice((page - 1) * size, page * size);
  res.json(ok({ total, list: rows }));
});

app.get('/api/chat/number/:number/messages', auth(db), (req, res) => {
  const uid = req.user.id;
  const num = decodeURIComponent(req.params.number);
  db.prepare("UPDATE messages SET read_flag=1 WHERE user_id=? AND direction='receive' AND from_number=? AND read_flag=0").run(uid, num);
  const list = db.prepare("SELECT id,direction,type,status,content,created_at FROM messages WHERE user_id=? AND (to_number=? OR from_number=?) ORDER BY created_at ASC, id ASC")
    .all(uid, num, num);
  res.json(ok({ number: num, list }));
});

app.post('/api/chat/number/:number/reply', auth(db), (req, res, next) => {
  try {
    const uid = req.user.id;
    const num = decodeURIComponent(req.params.number);
    const content = String((req.body || {}).content || '').trim();
    if (!content) throw err(400, '回复内容不能为空');
    if (content.length > 200) throw err(400, '回复内容过长');
    if (round2(req.user.balance) < queue.PRICE_PER_MSG) throw err(400, '余额不足，无法发送单条消息');
    const before = round2(req.user.balance);
    const after = round2(before - queue.PRICE_PER_MSG);
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(after, uid);
    const r = db.prepare("INSERT INTO messages(batch_id,user_id,from_number,to_number,content,direction,type,status,read_flag,created_at) VALUES(NULL,?,?,?,?,?,?,?,?,?)")
      .run(uid, '10690188', num, content, 'send', 'single', 'success', 0, bjNow());
    db.prepare('INSERT INTO charge_logs(user_id,type,amount,balance_before,balance_after,note,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(uid, '单条发送', -queue.PRICE_PER_MSG, before, after, `回复 ${num}`, bjNow());
    res.json(ok({ message_id: Number(r.lastInsertRowid), balance: after }));
  } catch (e) { next(e); }
});

// ---------- 批量发送 ----------
app.get('/api/batch/status', auth(db), (req, res) => {
  res.json(ok(queue.queueStatus()));
});

app.post('/api/batch/clear', auth(db), (req, res) => {
  res.json(ok(queue.clearProgress()));
});

app.post('/api/batch/submit', auth(db), (req, res, next) => {
  try {
    const uid = req.user.id;
    const b = req.body || {};
    const toLines = (v) => (Array.isArray(v) ? v.join('\n') : String(v == null ? '' : v));
    const contentLines = toLines(b.contentLines).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const uniqueContent = [...new Set(contentLines)];
    if (uniqueContent.length < 10) throw err(400, `短信内容至少 10 条（去重后当前 ${uniqueContent.length} 条）`);

    const parsed = parseNumbers(toLines(b.numbers));
    if (parsed.valid < 10 || parsed.valid > 100) {
      throw err(400, `有效号码需在 10 ~ 100 之间（当前有效 ${parsed.valid} 个，共 ${parsed.total} 行）`);
    }

    const needReview = b.needReview !== false; // 默认开启内容审核
    const joined = uniqueContent.join('\n');
    const chk = checkContent(joined, needReview);
    if (chk.blocked) {
      throw err(400, `内容审核未通过：命中违规词「${chk.matched}」，请修改后重试`);
    }

    const sendCount = parsed.valid;
    const cost = round2(sendCount * queue.PRICE_PER_MSG);
    if (round2(req.user.balance) < cost) {
      throw err(400, `余额不足：需要 ${cost.toFixed(2)} 元，当前余额 ${round2(req.user.balance).toFixed(2)} 元，请先充值`);
    }

    const needFilter = b.needFilter !== false;
    const filterCount = needFilter ? (parsed.total - parsed.valid) : 0;
    const topic = String(b.topic || '默认主题').trim() || '默认主题';
    const note = String(b.note || '').trim();
    const content = uniqueContent.join('\n');

    const rb = db.prepare(`INSERT INTO batches(user_id,topic,content,status,message_count,valid_count,success_count,fail_count,reply_count,filter_count,input_total,need_filter,note,created_at)
      VALUES(?,?,?,'submitted',?,?,0,0,0,?,?,?,?,?)`)
      .run(uid, topic, content, sendCount, sendCount, filterCount, parsed.total, needFilter ? 1 : 0, note, bjNow());
    const batchId = Number(rb.lastInsertRowid);

    const mi = db.prepare("INSERT INTO messages(batch_id,user_id,from_number,to_number,e164_to,content,direction,type,status,read_flag,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    parsed.validList.forEach((num, i) => {
      mi.run(batchId, uid, '10690188', num, e164.normalizeNumber(num), uniqueContent[i % uniqueContent.length], 'send', 'batch', 'pending', 0, bjNow());
    });

    const before = round2(req.user.balance);
    const after = round2(before - cost);
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(after, uid);
    db.prepare('INSERT INTO charge_logs(user_id,type,amount,balance_before,balance_after,note,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(uid, '批量发送', -cost, before, after, `批次#${batchId} 共${sendCount}条`, bjNow());

    queue.enqueue(batchId, uid, 'submitted');

    res.json(ok({ batch_id: batchId, message_count: sendCount, valid_count: sendCount, filter_count: filterCount, cost, balance: after, queue_len: queue.queueStatus().queueLen }));
  } catch (e) { next(e); }
});

// ---------- 消息管理 ----------
app.get('/api/messages', auth(db), (req, res) => {
  const uid = req.user.id;
  const direction = String(req.query.direction || '');
  const type = String(req.query.type || '');
  const status = String(req.query.status || '');
  const search = likeEscape(req.query.search);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const conds = ['m.user_id=?'];
  const params = [uid];
  if (direction) { conds.push('m.direction=?'); params.push(direction); }
  if (type) { conds.push('m.type=?'); params.push(type); }
  if (status) { conds.push('m.status=?'); params.push(status); }
  if (search) { conds.push('m.content LIKE ? ESCAPE "\\"'); params.push('%' + search + '%'); }
  const where = conds.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM messages m WHERE ${where}`).get(...params).c;
  const list = db.prepare(`SELECT m.id,m.batch_id,m.user_id,m.from_number,m.to_number,m.content,m.direction,m.type,m.status,m.channel_status,m.twilio_sid,m.fail_reason,m.created_at,u.username
    FROM messages m JOIN users u ON m.user_id=u.id WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`)
    .all(...params, size, (page - 1) * size);
  res.json(ok({ total, list }));
});

// ---------- 号码检测 ----------
app.post('/api/phone-filter/tasks', auth(db), (req, res, next) => {
  try {
    const uid = req.user.id;
    const b = req.body || {};
    const parsed = parseNumbers(b.numbers);
    if (parsed.total === 0) throw err(400, '号码列表为空');
    const resultJson = JSON.stringify({
      valid: parsed.validList.slice(0, 300),
      filtered: parsed.filteredList.slice(0, 300),
      invalidCount: parsed.invalid
    });
    const r = db.prepare('INSERT INTO phone_filter_tasks(user_id,total,valid,t_voip_count,status,source,note,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uid, parsed.total, parsed.valid, parsed.tVoip, 'completed', String(b.source || '手动上传'), String(b.note || '').trim(), resultJson, bjNow());
    res.json(ok({
      task_id: Number(r.lastInsertRowid),
      total: parsed.total,
      valid: parsed.valid,
      t_voip_count: parsed.tVoip,
      invalid: parsed.invalid
    }));
  } catch (e) { next(e); }
});

app.get('/api/phone-filter/tasks', auth(db), (req, res) => {
  const uid = req.user.id;
  const status = String(req.query.status || '');
  const source = String(req.query.source || '');
  const search = likeEscape(req.query.search);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const conds = ['user_id=?'];
  const params = [uid];
  if (status) { conds.push('status=?'); params.push(status); }
  if (source) { conds.push('source=?'); params.push(source); }
  if (search) { conds.push('note LIKE ? ESCAPE "\\"'); params.push('%' + search + '%'); }
  const where = conds.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM phone_filter_tasks WHERE ${where}`).get(...params).c;
  const list = db.prepare(`SELECT id,total,valid,t_voip_count,status,source,note,created_at FROM phone_filter_tasks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, size, (page - 1) * size);
  res.json(ok({ total, list }));
});

app.get('/api/phone-filter/tasks/:id', auth(db), (req, res) => {
  const row = db.prepare('SELECT * FROM phone_filter_tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) throw err(404, '任务不存在');
  let result = null;
  try { result = row.result_json ? JSON.parse(row.result_json) : null; } catch (e) { /* ignore */ }
  res.json(ok({ task: row, result }));
});

// ---------- 批次统计 ----------
app.get('/api/batches', auth(db), (req, res) => {
  const uid = req.user.id;
  const status = String(req.query.status || '');
  const search = likeEscape(req.query.search);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const conds = ['b.user_id=?'];
  const params = [uid];
  if (status) { conds.push('b.status=?'); params.push(status); }
  if (search) { conds.push('(b.note LIKE ? ESCAPE "\\" OR b.topic LIKE ? ESCAPE "\\")'); params.push('%' + search + '%', '%' + search + '%'); }
  const where = conds.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM batches b WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT b.*,u.username FROM batches b JOIN users u ON b.user_id=u.id
    WHERE ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`).all(...params, size, (page - 1) * size);
  const list = rows.map((r) => ({
    id: r.id, username: r.username, topic: r.topic, status: r.status,
    message_count: r.message_count, valid_count: r.valid_count,
    success_count: r.success_count, fail_count: r.fail_count,
    reply_count: r.reply_count,
    reply_rate: r.success_count > 0 ? round2((r.reply_count / r.success_count) * 100) : 0,
    filter_count: r.filter_count, need_filter: r.need_filter, note: r.note, created_at: r.created_at
  }));
  res.json(ok({ total, list }));
});

app.post('/api/batches/stat-reply', auth(db), (req, res) => {
  const uid = req.user.id;
  const batches = db.prepare('SELECT id FROM batches WHERE user_id=?').all(uid);
  const upd = db.prepare('UPDATE batches SET reply_count=? WHERE id=?');
  let updated = 0;
  for (const b of batches) {
    const c = db.prepare("SELECT COUNT(*) c FROM messages WHERE batch_id=? AND direction='receive'").get(b.id).c;
    upd.run(c, b.id);
    updated++;
  }
  res.json(ok({ updated, message: `已重新统计 ${updated} 个批次的回复数量` }));
});

app.post('/api/batches/stat-filter', auth(db), (req, res) => {
  const uid = req.user.id;
  const batches = db.prepare('SELECT id,input_total,valid_count FROM batches WHERE user_id=?').all(uid);
  const upd = db.prepare('UPDATE batches SET filter_count=? WHERE id=?');
  let updated = 0;
  for (const b of batches) {
    const fc = Math.max(0, (b.input_total || 0) - (b.valid_count || 0));
    upd.run(fc, b.id);
    updated++;
  }
  res.json(ok({ updated, message: `已重新统计 ${updated} 个批次的过滤数量` }));
});

app.get('/api/batches/:id/detail', auth(db), (req, res) => {
  const batch = db.prepare('SELECT b.*,u.username FROM batches b JOIN users u ON b.user_id=u.id WHERE b.id=? AND b.user_id=?')
    .get(req.params.id, req.user.id);
  if (!batch) throw err(404, '批次不存在');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const total = db.prepare('SELECT COUNT(*) c FROM messages WHERE batch_id=?').get(batch.id).c;
  const list = db.prepare('SELECT id,from_number,to_number,content,direction,type,status,created_at FROM messages WHERE batch_id=? ORDER BY id ASC LIMIT ? OFFSET ?')
    .all(batch.id, size, (page - 1) * size);
  res.json(ok({ batch, total, list }));
});

// ---------- 消费明细 ----------
app.get('/api/paydetails', auth(db), (req, res) => {
  const uid = req.user.id;
  const type = String(req.query.type || '');
  const search = likeEscape(req.query.search);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const conds = ['c.user_id=?'];
  const params = [uid];
  if (type) { conds.push('c.type=?'); params.push(type); }
  if (search) { conds.push('c.note LIKE ? ESCAPE "\\"'); params.push('%' + search + '%'); }
  const where = conds.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM charge_logs c WHERE ${where}`).get(...params).c;
  const list = db.prepare(`SELECT c.id,c.user_id,c.type,c.amount,c.balance_before,c.balance_after,c.note,c.created_at,u.username
    FROM charge_logs c JOIN users u ON c.user_id=u.id WHERE ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
    .all(...params, size, (page - 1) * size);
  res.json(ok({ total, list }));
});

app.get('/api/paydetails/sum', auth(db), (req, res) => {
  const uid = req.user.id;
  const sum = db.prepare("SELECT IFNULL(SUM(CASE WHEN amount<0 THEN amount ELSE 0 END),0) consumed, IFNULL(SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),0) recharged FROM charge_logs WHERE user_id=?").get(uid);
  res.json(ok({ balance: round2(req.user.balance), consumed: round2(-sum.consumed), recharged: round2(sum.recharged) }));
});

// ---------- 余额记录 ----------
app.get('/api/recharges', auth(db), (req, res) => {
  const uid = req.user.id;
  const isAdmin = req.user.is_admin === 1;
  const type = String(req.query.type || '');
  const search = likeEscape(req.query.search);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
  const conds = [];
  const params = [];
  if (!isAdmin) { conds.push('(r.target_user=? OR r.upper_user=?)'); params.push(uid, uid); }
  if (type) { conds.push('r.type=?'); params.push(type); }
  if (search) { conds.push('(r.note LIKE ? ESCAPE "\\" OR r.package_name LIKE ? ESCAPE "\\")'); params.push('%' + search + '%', '%' + search + '%'); }
  const where = conds.length ? ('WHERE ' + conds.join(' AND ')) : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM recharge_logs r ${where}`).get(...params).c;
  const list = db.prepare(`SELECT r.id,r.upper_user,r.target_user,r.type,r.amount,r.package_name,r.note,r.created_at,u1.username AS upper_name,u2.username AS target_name
    FROM recharge_logs r JOIN users u1 ON r.upper_user=u1.id JOIN users u2 ON r.target_user=u2.id ${where}
    ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`).all(...params, size, (page - 1) * size);
  res.json(ok({ total, list }));
});

app.post('/api/recharges/admin', auth(db), requireAdmin, (req, res, next) => {
  try {
    const b = req.body || {};
    const username = String(b.username || '').trim();
    const amount = Number(b.amount);
    if (!username) throw err(400, '请输入充值账号');
    if (!amount || amount <= 0) throw err(400, '充值金额需大于 0');
    const target = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!target) throw err(400, `用户 ${username} 不存在`);
    const before = round2(target.balance);
    const after = round2(before + amount);
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(after, target.id);
    db.prepare('INSERT INTO recharge_logs(upper_user,target_user,type,amount,package_name,note,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(req.user.id, target.id, '充值', amount, String(b.package_name || '基础套餐'), String(b.note || '管理员充值'), bjNow());
    db.prepare('INSERT INTO charge_logs(user_id,type,amount,balance_before,balance_after,note,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(target.id, '充值', amount, before, after, `管理员充值 ${amount.toFixed(2)} 元`, bjNow());
    res.json(ok({ username, amount, balance: after }));
  } catch (e) { next(e); }
});

// ---------- 元信息 ----------
app.get('/api/meta', (req, res) => {
  res.json(ok({
    price: queue.PRICE_PER_MSG,
    min_content: 10,
    min_numbers: 10,
    max_numbers: 100,
    min_content_note: '短信内容至少 10 条',
    numbers_note: '有效号码数量需在 10 ~ 100 之间'
  }));
});

// ---------- 通道设置（仅管理员） ----------
app.get('/api/settings', auth(db), requireAdmin, (req, res) => {
  const cfg = settings.getTwilioConfig(db);
  res.json(ok({
    twilio_account_sid: cfg.sid,
    twilio_from_number: cfg.from,
    token_set: !!cfg.token,
    mode: cfg.configured ? 'twilio' : 'mock'
  }));
});

app.post('/api/settings', auth(db), requireAdmin, (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.twilio_account_sid != null) settings.setSetting(db, 'twilio_account_sid', String(b.twilio_account_sid).trim());
    if (b.twilio_from_number != null) settings.setSetting(db, 'twilio_from_number', String(b.twilio_from_number).trim());
    // token 为空表示不修改旧值
    const tok = String(b.twilio_auth_token || '').trim();
    if (tok) settings.setSetting(db, 'twilio_auth_token', tok);
    const cfg = settings.getTwilioConfig(db);
    res.json(ok({ mode: cfg.configured ? 'twilio' : 'mock', token_set: !!cfg.token }));
  } catch (e) { next(e); }
});

app.post('/api/settings/test-twilio', auth(db), requireAdmin, async (req, res) => {
  const b = req.body || {};
  const sid = String(b.twilio_account_sid || settings.getSetting(db, 'twilio_account_sid')).trim();
  const token = String(b.twilio_auth_token || settings.getSetting(db, 'twilio_auth_token')).trim();
  if (!sid || !token) return res.json(ok({ ok: false, message: '请先填写 SID 与 Auth Token' }));
  try {
    await twilio.verifyCredentials(sid, token);
    res.json(ok({ ok: true, message: '连接成功，凭证有效' }));
  } catch (e) {
    res.json(ok({ ok: false, message: e.message }));
  }
});

// 当前发送模式（登录用户可读，用于批量发送页提示）
app.get('/api/settings/mode', auth(db), (req, res) => {
  const cfg = settings.getTwilioConfig(db);
  res.json(ok({ mode: cfg.configured ? 'twilio' : 'mock' }));
});

// ---------- Twilio 公开回调（无需登录） ----------
// 状态回调：Twilio 控制台配置为 POST <本服务公网地址>/api/twilio/status
app.post('/api/twilio/status', (req, res) => {
  const b = req.body || {};
  const sid = String(b.MessageSid || '').trim();
  const st = String(b.MessageStatus || '').trim().toLowerCase();
  if (!sid) return res.json({ ok: false, message: 'missing MessageSid' });
  const m = db.prepare('SELECT id FROM messages WHERE twilio_sid=?').get(sid);
  if (m) {
    const map = { queued: 'success', sending: 'success', sent: 'success', delivering: 'success', delivered: 'success', undelivered: 'fail', failed: 'fail' };
    db.prepare("UPDATE messages SET status=?, channel_status=? WHERE id=?").run(map[st] || 'success', st, m.id);
  }
  res.json({ ok: true });
});

// 入站回调：用户回复；STOP/UNSUBSCRIBE 写入退订表，HELP 返回帮助文案
app.post('/api/twilio/inbound', (req, res) => {
  const b = req.body || {};
  const from = e164.normalizeNumber(b.From);
  const text = String(b.Body || '').trim();
  const upper = text.toUpperCase();
  let xml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  if (/\b(STOP|UNSUBSCRIBE|CANCEL)\b/.test(upper) || text.includes('退订')) {
    db.prepare('INSERT OR IGNORE INTO phone_opt_out(phone,created_at) VALUES(?,?)').run(from, bjNow());
  } else if (/^(HELP|帮助|客服)/.test(upper)) {
    xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>【PTP SMS】帮助：回复 STOP 退订；如需人工服务请联系客服。</Message></Response>';
  }
  res.set('Content-Type', 'text/xml; charset=utf-8');
  res.send(xml);
});

// ---------- 静态与 SPA ----------
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ code: 1, message: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// 统一错误处理
app.use((e, req, res, next) => {
  const status = e.status || 500;
  const message = status === 500 ? ('服务器内部错误：' + e.message) : e.message;
  if (status === 500) console.error('[err]', e);
  res.status(status).json({ code: 1, message });
});

app.listen(PORT, () => {
  console.log('======================================');
  console.log('  PTP SMS 1.0 短信营销群发管理后台');
  console.log(`  访问地址: http://localhost:${PORT}/login`);
  console.log('  默认管理员: admin / admin123');
  console.log('======================================');
});
