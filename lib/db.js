// 数据库：Node 22 内置 node:sqlite（文件型 SQLite，零原生依赖，Windows 直接可用）
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');
const { bjNow, bjToday, tsAgo, addDaysBJ, round2 } = require('./time');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'lvqing.db');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  expire_at TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER,
  user_id INTEGER NOT NULL,
  from_number TEXT,
  to_number TEXT,
  e164_to TEXT,
  content TEXT,
  direction TEXT NOT NULL DEFAULT 'send',
  type TEXT NOT NULL DEFAULT 'batch',
  status TEXT NOT NULL DEFAULT 'pending',
  channel_status TEXT,
  twilio_sid TEXT,
  fail_reason TEXT,
  read_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  topic TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  message_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  filter_count INTEGER NOT NULL DEFAULT 0,
  input_total INTEGER NOT NULL DEFAULT 0,
  need_filter INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS charge_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recharge_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upper_user INTEGER NOT NULL,
  target_user INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT '充值',
  amount REAL NOT NULL,
  package_name TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS phone_filter_tasks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  valid INTEGER NOT NULL DEFAULT 0,
  t_voip_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  source TEXT,
  note TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS phone_opt_out(
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`;

const REPLY_POOL = [
  '收到，谢谢',
  '请问活动到什么时候？',
  '这个怎么办理？',
  '好的，我了解一下',
  '已经退订了',
  '请问有优惠吗？',
  '这个多少钱？',
  '不需要了，谢谢'
];

// 生成 11 位演示手机号
function genNumber(i) {
  const seg = ['139', '138', '137', '136', '150', '151', '158', '159', '186', '188', '189', '133'][i % 12];
  const tail = String(10000000 + ((i * 7919) % 89999999));
  return seg + tail;
}

// 插入一个批次及其消息
function genBatch(db, userId, opts) {
  const {
    topic, content, count, success, reply, filter, inputTotal, note, created,
    status = 'completed', needFilter = 1
  } = opts;
  const ins = db.prepare(`INSERT INTO batches(user_id,topic,content,status,message_count,valid_count,success_count,fail_count,reply_count,filter_count,input_total,need_filter,note,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const bid = Number(ins.run(userId, topic, content, status, count, count - filter, success, count - success, reply, filter, inputTotal == null ? count : inputTotal, needFilter, note, created).lastInsertRowid);
  const mi = db.prepare(`INSERT INTO messages(batch_id,user_id,from_number,to_number,content,direction,type,status,read_flag,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < count; i++) {
    const num = genNumber(i);
    const st = status === 'submitted' ? 'pending' : (i < success ? 'success' : 'fail');
    mi.run(bid, userId, '10690188', num, content, 'send', 'batch', st, 0, created);
  }
  const rep = db.prepare(`INSERT INTO messages(batch_id,user_id,from_number,to_number,content,direction,type,status,read_flag,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < reply; i++) {
    const num = genNumber(i);
    const c = REPLY_POOL[i % REPLY_POOL.length];
    rep.run(bid, userId, num, '', c, 'receive', 'batch', 'success', i % 2 === 0 ? 0 : 1, created);
  }
  return bid;
}

function seed() {
  const nowTs = Date.now();
  const insUser = db.prepare('INSERT INTO users(username,password_hash,balance,expire_at,is_admin,created_at) VALUES(?,?,?,?,?,?)');
  const adminId = Number(insUser.run('admin', hashPassword('admin123'), 8848, addDaysBJ(365), 1, bjNow()).lastInsertRowid);
  const demoId = Number(insUser.run('demo', hashPassword('demo123'), 300, addDaysBJ(30), 0, bjNow()).lastInsertRowid);
  const agentId = Number(insUser.run('agent', hashPassword('agent123'), 100000, addDaysBJ(3000), 0, bjNow()).lastInsertRowid);

  // 管理员：4 个历史批次（含今日 2 个、昨日 1 个、3 天前 1 个）+ 1 个刚提交的演示队列任务
  const b1 = genBatch(db, adminId, { topic: '新品上市活动通知', content: '【PTP优选】新品上市，全场8.8折起，会员加赠好礼，回复TD退订。', count: 220, success: 205, reply: 46, filter: 8, inputTotal: 228, note: 'A批-8.8折活动', created: tsAgo(300) });
  const b2 = genBatch(db, adminId, { topic: '会员积分兑换提醒', content: '【PTP商城】您的会员积分即将到期，请尽快兑换礼品，回复TD退订。', count: 180, success: 170, reply: 32, filter: 5, inputTotal: 185, note: 'B批-积分提醒', created: tsAgo(200) });
  const b3 = genBatch(db, adminId, { topic: '周末会员日活动', content: '【PTP生活】周末会员日开启，购物满99元立减20元，回复TD退订。', count: 150, success: 145, reply: 28, filter: 12, inputTotal: 162, note: 'C批-周末活动', created: tsAgo(1500) });
  const b4 = genBatch(db, adminId, { topic: '商品补货通知', content: '【PTP资讯】您关注的商品已补货，查看最新优惠活动，回复TD退订。', count: 300, success: 288, reply: 60, filter: 20, inputTotal: 320, note: 'D批-补货通知', created: tsAgo(4320) });
  const b5 = genBatch(db, adminId, { topic: '国庆大促提前开启', content: '【PTP优选】国庆大促提前开启，爆款商品低至5折限量抢购，回复TD退订。', count: 200, success: 0, reply: 0, filter: 0, inputTotal: 200, note: '队列演示任务', created: tsAgo(60), status: 'submitted' });

  // 单条发送演示（聊天页回复产生）
  const si = db.prepare(`INSERT INTO messages(batch_id,user_id,from_number,to_number,content,direction,type,status,read_flag,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  si.run(null, adminId, '10690188', genNumber(501), '您好，请问产品还有货吗？', 'send', 'single', 'success', 0, tsAgo(90));
  si.run(null, adminId, genNumber(501), '', '还有的，麻烦发一下活动链接', 'receive', 'single', 'success', 0, tsAgo(88));
  si.run(null, adminId, '10690188', genNumber(502), '请问周末会员日全场都参与吗？', 'send', 'single', 'success', 0, tsAgo(500));

  // 消费明细（顺序保持余额一致，最终余额 8848，队列启动后 b5 会再扣 10 元）
  const cl = db.prepare('INSERT INTO charge_logs(user_id,type,amount,balance_before,balance_after,note,created_at) VALUES(?,?,?,?,?,?,?)');
  cl.run(adminId, '充值', 8888, 0, 8888, '管理员开通充值', tsAgo(2000));
  cl.run(adminId, '批量发送', -11.00, 8888, 8877, '批次#1 共220条', tsAgo(299));
  cl.run(adminId, '批量发送', -9.00, 8877, 8868, '批次#2 共180条', tsAgo(199));
  cl.run(adminId, '批量发送', -7.50, 8868, 8860.5, '批次#3 共150条', tsAgo(1499));
  cl.run(adminId, '批量发送', -15.00, 8860.5, 8845.5, '批次#4 共300条', tsAgo(4319));
  cl.run(adminId, '系统退款', 2.50, 8845.5, 8848, '批次#4 部分失败退款', tsAgo(4300));

  // 余额记录（上级→下级）
  const rl = db.prepare('INSERT INTO recharge_logs(upper_user,target_user,type,amount,package_name,note,created_at) VALUES(?,?,?,?,?,?,?)');
  rl.run(agentId, adminId, '充值', 8888, '旗舰套餐', '开通服务', tsAgo(2000));
  rl.run(agentId, demoId, '充值', 200, '体验套餐', '新用户体验', tsAgo(1900));
  rl.run(adminId, demoId, '充值', 100, '基础套餐', '测试充值', tsAgo(1800));

  // 号码检测任务
  const pft = db.prepare('INSERT INTO phone_filter_tasks(user_id,total,valid,t_voip_count,status,source,note,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  pft.run(adminId, 500, 463, 37, 'completed', '手动上传', '演示批次', JSON.stringify({ valid: [genNumber(1), genNumber(2), genNumber(3)], filtered: [{ num: '17012345678', kind: 'virtual' }, { num: '01012345678', kind: 'landline' }] }), tsAgo(1500));
  pft.run(adminId, 800, 720, 80, 'completed', '导入文件', '节流测试', JSON.stringify({ valid: [genNumber(4), genNumber(5)], filtered: [{ num: '17187654321', kind: 'virtual' }] }), tsAgo(1000));
  pft.run(adminId, 300, 0, 0, 'processing', '手动上传', '处理中演示', null, tsAgo(30));

  // 系统公告（合规运营文案，红色文字列表展示）
  const an = db.prepare('INSERT INTO announcements(title,content,sort,created_at) VALUES(?,?,?,?)');
  an.run('维护通知', '系统将于每日 02:00-03:00 进行例行维护，期间可能影响部分操作，请提前安排业务。', 1, tsAgo(3000));
  an.run('合规提醒', '请勿发送涉及赌博、诈骗、色情、冒充公检法等违法违规内容，一经发现将冻结账号。', 2, tsAgo(2900));
  an.run('功能说明', '短信发送为演示模式，未接入真实运营商通道，如需对接请咨询客服。', 3, tsAgo(2800));
  an.run('发送建议', '建议合理安排发送时段，避免在深夜打扰用户，降低投诉率。', 4, tsAgo(2700));
  an.run('新用户指引', '新用户注册后可免费体验基础功能，充值后即可开通批量发送。', 5, tsAgo(2600));

  // demo 用户少量数据（供演示登录查看）
  genBatch(db, demoId, { topic: '店铺开业通知', content: '【PTP小店】新店开业，全场9折，欢迎光临，回复TD退订。', count: 150, success: 148, reply: 20, filter: 2, inputTotal: 152, note: '演示用户数据', created: tsAgo(800) });

  console.log('[db] 种子数据已写入（admin/admin123、demo/demo123、agent/agent123）');
}

function open() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  // 老库迁移：补列
  const cols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  if (!cols.includes('e164_to')) { db.exec('ALTER TABLE messages ADD COLUMN e164_to TEXT'); }
  if (!cols.includes('channel_status')) { db.exec('ALTER TABLE messages ADD COLUMN channel_status TEXT'); }
  if (!cols.includes('twilio_sid')) { db.exec('ALTER TABLE messages ADD COLUMN twilio_sid TEXT'); }
  if (!cols.includes('fail_reason')) { db.exec('ALTER TABLE messages ADD COLUMN fail_reason TEXT'); }
  db.prepare('UPDATE messages SET e164_to = to_number WHERE e164_to IS NULL').run();
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c === 0) {
    seed();
  } else {
    // 每次启动把未完成的批次重新挂入队列（server.js 中处理）
    console.log('[db] 数据库已存在，跳过种子数据');
  }
  return db;
}

module.exports = { open, DB_PATH, SCHEMA };
