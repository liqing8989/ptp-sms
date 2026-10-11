// 发送队列（双模式）：
//  - settings 配置了 Twilio 三项凭证 → 真实通道模式：逐条调用 Twilio Messages API，
//    成功存 twilio_sid / channel_status，失败写 fail_reason；退订号码自动跳过；
//  - 未配置 → 模拟模式（现状）：随机成功/失败 + 随机生成回复。
// 真实通道的最终投递状态由 /api/twilio/status 回调异步更新。
const { bjNow, round2 } = require('./time');
const settings = require('./settings');
const twilio = require('./twilio');
const e164 = require('./e164');

const PRICE_PER_MSG = 0.05;
const STAGES = ['submitted', 'accepted', 'sending', 'sent_to_provider', 'waiting_callback', 'completed'];
const TICK_MS = 1500;
const SLICE = 8; // 每个 tick 最多真实发送条数，避免过快打爆通道

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

let queue = [];
let timer = null;
let db = null;

function init(_db) {
  db = _db;
  const rows = db.prepare("SELECT * FROM batches WHERE status != 'completed'").all();
  for (const r of rows) {
    queue.push({ batchId: r.id, userId: r.user_id, stage: r.status, charged: false });
  }
  if (rows.length) console.log(`[queue] 恢复 ${rows.length} 个未完成批次`);
  timer = setInterval(() => { tick().catch((e) => console.error('[queue] tick error:', e.message)); }, TICK_MS);
  timer.unref && timer.unref();
}

function enqueue(batchId, userId, status) {
  queue.push({ batchId, userId, stage: status || 'submitted', charged: true });
}

function queueStatus() {
  const cfg = settings.getTwilioConfig(db);
  const first = queue[0];
  let current = null;
  if (first) {
    const batch = db.prepare('SELECT id,user_id,topic,status,message_count,note FROM batches WHERE id=?').get(first.batchId);
    if (batch) {
      current = {
        id: batch.id,
        topic: batch.topic,
        note: batch.note,
        status: batch.status,
        stage: first.stage,
        messageCount: batch.message_count,
        step: STAGES.indexOf(batch.status) + 1
      };
    }
  }
  return { queueLen: queue.length, current, stages: STAGES, mode: cfg.configured ? 'twilio' : 'mock' };
}

function clearProgress() {
  if (queue.length === 0) return { ok: true, cleared: true };
  return { ok: true, cleared: false, message: '当前仍有任务在队列中，无法清空' };
}

function chargeBatch(item, batch) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(item.userId);
  if (!user) return true;
  const cost = round2(batch.message_count * PRICE_PER_MSG);
  if (user.balance < cost) {
    db.prepare("UPDATE batches SET status='completed', note=IFNULL(note,'')||'；余额不足任务终止' WHERE id=?").run(batch.id);
    db.prepare("UPDATE messages SET status='fail', fail_reason='余额不足，任务终止', channel_status='skipped' WHERE batch_id=? AND status='pending'").run(batch.id);
    item.charged = true;
    item.stage = 'completed';
    queue.shift();
    return true;
  }
  const before = round2(user.balance);
  const after = round2(before - cost);
  db.prepare('UPDATE users SET balance=? WHERE id=?').run(after, user.id);
  db.prepare('INSERT INTO charge_logs(user_id,type,amount,balance_before,balance_after,note,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(user.id, '批量发送', -cost, before, after, `批次#${batch.id} 共${batch.message_count}条`, bjNow());
  item.charged = true;
  return false;
}

// 模拟模式：pending → success/fail
function flipMessages(batchId) {
  const rows = db.prepare("SELECT id FROM messages WHERE batch_id=? AND status='pending'").all(batchId);
  const up = db.prepare('UPDATE messages SET status=? WHERE id=?');
  let success = 0;
  for (const r of rows) {
    const ok = Math.random() < 0.93;
    up.run(ok ? 'success' : 'fail', r.id);
    if (ok) success++;
  }
  return success;
}

// 模拟模式：随机生成回复
function generateReplies(batch) {
  const nums = db.prepare("SELECT DISTINCT to_number FROM messages WHERE batch_id=? AND direction='send' AND status='success'").all(batch.id);
  const ins = db.prepare('INSERT INTO messages(batch_id,user_id,from_number,to_number,e164_to,content,direction,type,status,read_flag,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const r of nums) {
    if (Math.random() < 0.2) {
      const content = REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)];
      ins.run(batch.id, batch.user_id, r.to_number, '', null, content, 'receive', 'batch', 'success', Math.random() < 0.5 ? 0 : 1, bjNow());
      n++;
    }
  }
  return n;
}

// 真实通道模式：逐条发送一个分片
async function sendSlice(batch) {
  const cfg = settings.getTwilioConfig(db);
  const pend = db.prepare("SELECT id, e164_to, to_number, content FROM messages WHERE batch_id=? AND status='pending' LIMIT ?").all(batch.id, SLICE);
  for (const m of pend) {
    const dest = m.e164_to || m.to_number;
    // 退订检查：命中 opt_out 表直接跳过
    const opt = db.prepare('SELECT phone FROM phone_opt_out WHERE phone=?').get(dest);
    if (opt) {
      db.prepare("UPDATE messages SET status='fail', channel_status='skipped', fail_reason='用户已退订（STOP），跳过发送' WHERE id=?").run(m.id);
      continue;
    }
    if (!e164.isE164(dest)) {
      db.prepare("UPDATE messages SET status='fail', channel_status='invalid', fail_reason='号码格式不符合 E.164（示例：+1XXXXXXXXXX），无法发送' WHERE id=?").run(m.id);
      continue;
    }
    try {
      const res = await twilio.sendSms({ sid: cfg.sid, token: cfg.token, from: cfg.from, to: dest, body: m.content });
      db.prepare("UPDATE messages SET status='success', twilio_sid=?, channel_status=? WHERE id=?").run(res.sid || null, res.status || 'queued', m.id);
    } catch (e) {
      db.prepare("UPDATE messages SET status='fail', channel_status='error', fail_reason=? WHERE id=?").run(String(e.message).slice(0, 200), m.id);
    }
  }
}

async function tick() {
  if (!queue.length) return;
  const item = queue[0];
  const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(item.batchId);
  if (!batch) { queue.shift(); return; }

  if (!item.charged) {
    const done = chargeBatch(item, batch);
    if (done) return;
  }

  const cfg = settings.getTwilioConfig(db);

  // 真实通道：在 accepted/sending 阶段持续处理 pending，直到全部处理完
  if (cfg.configured && (item.stage === 'accepted' || item.stage === 'sending')) {
    await sendSlice(batch);
    const pendingLeft = db.prepare("SELECT COUNT(*) c FROM messages WHERE batch_id=? AND status='pending'").get(batch.id).c;
    if (pendingLeft === 0) {
      const succ = db.prepare("SELECT COUNT(*) c FROM messages WHERE batch_id=? AND status='success'").get(batch.id).c;
      const fail = db.prepare("SELECT COUNT(*) c FROM messages WHERE batch_id=? AND status='fail'").get(batch.id).c;
      db.prepare("UPDATE batches SET status='sent_to_provider', success_count=?, fail_count=? WHERE id=?").run(succ, fail, batch.id);
      item.stage = 'sent_to_provider';
    } else {
      db.prepare("UPDATE batches SET status='sending' WHERE id=?").run(batch.id);
      item.stage = 'sending';
    }
    return;
  }

  const i = STAGES.indexOf(item.stage);
  if (i === -1) { queue.shift(); return; }
  if (i === STAGES.length - 1) {
    db.prepare("UPDATE batches SET status='completed' WHERE id=?").run(batch.id);
    queue.shift();
    return;
  }
  const next = STAGES[i + 1];
  if (next === 'sending') {
    const ok = flipMessages(batch.id);
    db.prepare("UPDATE batches SET status='sending', success_count=?, fail_count=? WHERE id=?").run(ok, batch.message_count - ok, batch.id);
  } else if (next === 'completed') {
    if (cfg.configured) {
      db.prepare("UPDATE batches SET status='completed' WHERE id=?").run(batch.id);
      queue.shift();
      return;
    }
    const n = generateReplies(batch);
    db.prepare("UPDATE batches SET status='completed', reply_count=? WHERE id=?").run(n, batch.id);
    queue.shift();
    return;
  } else {
    db.prepare('UPDATE batches SET status=? WHERE id=?').run(next, batch.id);
  }
  item.stage = next;
}

module.exports = { init, enqueue, queueStatus, clearProgress, tick, PRICE_PER_MSG };
