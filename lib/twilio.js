// Twilio REST 客户端：零依赖，直接用 Node 内置 https 调用
// 文档：https://www.twilio.com/docs/usage/api
const https = require('https');

function request(method, path, auth, formBody) {
  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: 'Basic ' + Buffer.from(auth.user + ':' + auth.pass).toString('base64'),
      'User-Agent': 'LiQingSMS/1.0'
    };
    let payload = null;
    if (formBody) {
      payload = new URLSearchParams(formBody).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: 'api.twilio.com', path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* 非 JSON 响应 */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, json });
        } else {
          const msg = json && json.message ? json.message : data.slice(0, 200);
          const code = json && json.code != null ? ` (错误码 ${json.code})` : '';
          reject(new Error(`Twilio 返回 ${res.statusCode}: ${msg}${code}`));
        }
      });
    });
    req.on('error', (e) => reject(new Error('网络请求失败: ' + e.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

// 验证凭证：GET /2010-04-01/Accounts/{Sid}.json
async function verifyCredentials(sid, token) {
  return request('GET', `/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, { user: sid, pass: token });
}

// 发送短信：POST /2010-04-01/Accounts/{Sid}/Messages.json
// to 需为 E.164（如 +1XXXXXXXXXX）
async function sendSms({ sid, token, from, to, body }) {
  const r = await request('POST', `/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    { user: sid, pass: token }, { To: to, From: from, Body: body });
  return { sid: r.json && r.json.sid, status: r.json && r.json.status, price: r.json && r.json.price };
}

module.exports = { verifyCredentials, sendSms };
