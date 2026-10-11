// 通道设置（仅管理员）：Twilio 凭证配置 + 测试连接 + webhook 地址说明
window.Pages = window.Pages || {};
window.Pages['/settings'] = {
  title: '通道设置',
  state: { loaded: false, data: null },
  render: function (container) {
    const isAdmin = !!(App.user() && App.user().is_admin === 1);
    if (!isAdmin) {
      container.innerHTML = `
        <div class="page-title" style="margin-bottom:14px">通道设置</div>
        <div class="el-card"><div class="card-body" style="text-align:center;padding:48px">
          当前账号无权限访问该页面，仅管理员可配置发送通道。<br><br>
          <a href="/index" style="color:#409EFF">返回首页</a></div></div>`;
      return;
    }
    const origin = location.origin;
    container.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <div class="page-title">通道设置</div>
      </div>
      <div class="el-card" style="margin-bottom:14px">
        <div class="card-body" id="set-mode">数据加载中...</div>
      </div>
      <div class="el-card" style="margin-bottom:14px">
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:14px;max-width:560px">
            <div>
              <div style="font-size:13px;color:#606266;margin-bottom:6px">Twilio Account SID</div>
              <input class="el-input" id="set-sid" placeholder="AC 开头的 34 位字符串">
            </div>
            <div>
              <div style="font-size:13px;color:#606266;margin-bottom:6px">Twilio Auth Token</div>
              <input class="el-input" id="set-token" type="password" placeholder="留空表示不修改已保存的 Token">
            </div>
            <div>
              <div style="font-size:13px;color:#606266;margin-bottom:6px">Twilio 发件号码（From）</div>
              <input class="el-input" id="set-from" placeholder="E.164 格式，如 +14155550100（10DLC 号码）">
            </div>
            <div style="display:flex;gap:10px">
              <button class="el-btn el-btn--primary" id="btn-save">保存配置</button>
              <button class="el-btn" id="btn-test">测试连接</button>
            </div>
          </div>
        </div>
      </div>
      <div class="el-card">
        <div class="card-body">
          <div style="font-size:14px;font-weight:600;margin-bottom:10px">Webhook 回调地址（在 Twilio 控制台配置）</div>
          <div style="font-size:13px;color:#606266;line-height:2">
            状态回调（Message Status Callback）：<code style="background:#f4f4f5;padding:2px 6px;border-radius:3px">${App.esc(origin)}/api/twilio/status</code><br>
            入站回调（A Message Comes In）：<code style="background:#f4f4f5;padding:2px 6px;border-radius:3px">${App.esc(origin)}/api/twilio/inbound</code><br>
            <span style="color:#909399">提示：本机调试时可用 ngrok 等内网穿透工具把上面的 localhost 地址换成公网地址后填进 Twilio 控制台。</span>
          </div>
        </div>
      </div>`;
    container.querySelector('#btn-save').onclick = () => this.save(container);
    container.querySelector('#btn-test').onclick = () => this.test(container);
    this.load(container);
  },
  load: async function (container) {
    const modeBox = container.querySelector('#set-mode');
    try {
      const d = await API.call('/api/settings');
      this.state.data = d;
      if (d.twilio_account_sid) document.getElementById('set-sid').value = d.twilio_account_sid;
      if (d.twilio_from_number) document.getElementById('set-from').value = d.twilio_from_number;
      modeBox.innerHTML = d.mode === 'twilio'
        ? `<div style="display:flex;align-items:center;gap:10px">
             <span class="el-tag el-tag--success">已启用真实通道</span>
             <span style="font-size:13px;color:#606266">当前发送将通过 Twilio 真实下发（Auth Token 已${d.token_set ? '配置' : '清空'}）</span></div>`
        : `<div style="display:flex;align-items:center;gap:10px">
             <span class="el-tag el-tag--info">模拟模式</span>
             <span style="font-size:13px;color:#606266">未完整配置三项凭证，批量发送走本地模拟队列，前端体验不受影响</span></div>`;
    } catch (e) {
      modeBox.innerHTML = `<span style="color:#F56C6C">加载失败：${App.esc(e.message)}</span>`;
    }
  },
  collect: function () {
    return {
      twilio_account_sid: document.getElementById('set-sid').value.trim(),
      twilio_auth_token: document.getElementById('set-token').value.trim(),
      twilio_from_number: document.getElementById('set-from').value.trim()
    };
  },
  save: async function (container) {
    const v = this.collect();
    if (!v.twilio_account_sid || !v.twilio_from_number) {
      App.toast('请完整填写 SID 与发件号码', 'warning');
      return;
    }
    try {
      await API.call('/api/settings', { method: 'POST', body: JSON.stringify(v) });
      App.toast('配置已保存');
      document.getElementById('set-token').value = '';
      this.state.data = null;
      this.load(container);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
  test: async function (container) {
    const v = this.collect();
    try {
      const d = await API.call('/api/settings/test-twilio', { method: 'POST', body: JSON.stringify(v) });
      App.modal({
        title: '测试连接结果',
        body: `<p style="font-size:14px">${d.ok ? '✅' : '❌'} ${App.esc(d.message)}</p>`,
        showCancel: false
      });
      this.load(container);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
