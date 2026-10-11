// 聊天：会话列表（全部/有回复过/未读）+ 展开查看对话详情与回复
window.Pages = window.Pages || {};
window.Pages['/chat'] = {
  title: '聊天',
  state: { tab: 'all', page: 1, size: 10 },
  render: function (container) {
    container.innerHTML = `
      <div class="chat-tabs">
        <span class="tab" data-tab="all">全部列表</span>
        <span class="tab" data-tab="replied">有回复过</span>
        <span class="tab" data-tab="unread">未读列表</span>
      </div>
      <div class="el-card"><div class="card-body" style="text-align:center;padding:32px">加载中...</div></div>`;
    const st = this.state;
    container.querySelectorAll('.chat-tabs .tab').forEach((t) => {
      t.classList.toggle('on', t.dataset.tab === st.tab);
      t.onclick = () => { st.tab = t.dataset.tab; st.page = 1; this.render(container); };
    });
    this.load(container);
  },
  load: async function (container) {
    const st = this.state;
    const card = container.querySelector('.el-card');
    let data;
    try {
      data = await API.call(`/api/chat/conversations?tab=${st.tab}&page=${st.page}&size=${st.size}`);
    } catch (e) {
      card.innerHTML = `<div class="card-body" style="text-align:center;padding:32px">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    const listHtml = (data.list || []).map((c) => `
      <div class="chat-item" data-number="${App.esc(c.number)}">
        <div class="row">
          <div>
            <div class="num">${App.esc(c.number)}</div>
            <div class="meta">${App.esc(c.last_time)}　·　最后一条：${App.esc(c.last_content || '')}</div>
          </div>
          <div class="badges">
            <span class="badge badge--send">发送 ${c.send_count}</span>
            <span class="badge badge--reply">回复 ${c.reply_count}</span>
            <span class="badge badge--unread">未读 ${c.unread_count}</span>
          </div>
        </div>
        <div class="detail" style="display:none"></div>
      </div>`).join('') || '<div style="text-align:center;padding:32px;color:#909399">暂无会话</div>';
    card.innerHTML = `<div class="card-body chat-list">${listHtml}</div>
      <div class="card-body" style="padding-top:0"><div id="chat-pager"></div></div>`;
    App.pagination(card.querySelector('#chat-pager'), {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; this.load(container); }
    });
    card.querySelectorAll('.chat-item').forEach((item) => {
      item.querySelector('.row').onclick = () => this.toggleDetail(container, item);
    });
  },
  toggleDetail: async function (container, item) {
    const detail = item.querySelector('.detail');
    const number = item.dataset.number;
    if (detail.style.display !== 'none') { detail.style.display = 'none'; return; }
    detail.style.display = 'block';
    detail.innerHTML = '<div style="padding:12px;text-align:center;color:#909399">加载对话...</div>';
    try {
      const data = await API.call('/api/chat/number/' + encodeURIComponent(number) + '/messages');
      const thread = (data.list || []).map((m) => `
        <div class="msg-bubble ${m.direction === 'send' ? 'send' : 'receive'}">
          ${App.esc(m.content)}
          <div class="t">${App.esc(m.created_at)} · ${m.direction === 'send' ? '发送' : '接收'}${m.type === 'single' ? ' · 单条' : ''}</div>
        </div>`).join('');
      detail.innerHTML = `
        <div class="msg-thread">${thread || '<div style="text-align:center;color:#909399">暂无消息记录</div>'}</div>
        <div class="reply-box">
          <input class="el-input" placeholder="输入回复内容，按回车发送（每条按 0.05 元计费）" id="reply-input">
          <button class="el-btn el-btn--primary" id="reply-btn">回 复</button>
        </div>`;
      const input = detail.querySelector('#reply-input');
      const send = async () => {
        const content = input.value.trim();
        if (!content) { App.toast('请输入回复内容', 'warning'); return; }
        try {
          await API.call('/api/chat/number/' + encodeURIComponent(number) + '/reply', { method: 'POST', body: JSON.stringify({ content }) });
          App.toast('回复已发送');
          await App.refreshUser();
          await this.load(container);
          const again = container.querySelector(`.chat-item[data-number="${number}"]`);
          if (again) this.toggleDetail(container, again);
        } catch (e) { App.toast(e.message, 'error'); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      detail.querySelector('#reply-btn').onclick = send;
    } catch (e) {
      detail.innerHTML = `<div style="padding:12px;text-align:center;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
    }
  }
};
