// 批次统计：列表 + 统计回复/过滤数量 + 批次详情（含消息分页）
window.Pages = window.Pages || {};
window.Pages['/messagegroup'] = {
  title: '批次统计',
  state: { page: 1, size: 10, filters: { status: '', search: '' } },
  render: function (container) {
    const self = this;
    container.innerHTML = `
      <div class="row-between">
        <div class="page-title">批次统计</div>
        <div style="display:flex;gap:8px">
          <button class="el-btn" id="mg-stat-reply">统计回复数量</button>
          <button class="el-btn" id="mg-stat-filter">统计过滤数量</button>
        </div>
      </div>
      <div class="el-card"><div class="card-body" id="mg-fb"></div></div>
      <div class="el-card">
        <div class="card-head">批次列表</div>
        <div class="card-body" id="mg-table" style="text-align:center;padding:32px;color:#909399">加载中...</div>
        <div class="card-body" style="padding-top:0" id="mg-pager"></div>
      </div>`;
    App.filterBar(container.querySelector('#mg-fb'), [
      { type: 'select', key: 'status', label: '完成状态', placeholder: '全部状态', options: [
        { value: 'completed', label: '已完成' },
        { value: 'sending', label: '发送中' },
        { value: 'waiting_callback', label: '等待回调' },
        { value: 'submitted', label: '已提交' },
        { value: 'accepted', label: '已接受' },
        { value: 'sent_to_provider', label: '已给运营商' }
      ] },
      { type: 'input', key: 'search', label: '搜索', placeholder: '按主题/备注搜索' }
    ], {
      onSearch: (v) => {
        self.state.filters = { status: v.status, search: v.search };
        self.state.page = 1;
        self.load(container);
      },
      onReset: () => {
        self.state.filters = { status: '', search: '' };
        self.state.page = 1;
        self.load(container);
      }
    });
    container.querySelector('#mg-stat-reply').onclick = async () => {
      try {
        const d = await API.call('/api/batches/stat-reply', { method: 'POST', body: '{}' });
        App.toast(d.message || '统计完成');
        self.load(container);
      } catch (e) { App.toast(e.message, 'error'); }
    };
    container.querySelector('#mg-stat-filter').onclick = async () => {
      try {
        const d = await API.call('/api/batches/stat-filter', { method: 'POST', body: '{}' });
        App.toast(d.message || '统计完成');
        self.load(container);
      } catch (e) { App.toast(e.message, 'error'); }
    };
    this.load(container);
  },
  load: async function (container) {
    const st = this.state;
    const self = this;
    const wrap = container.querySelector('#mg-table');
    const pager = container.querySelector('#mg-pager');
    wrap.innerHTML = '<div style="padding:32px;color:#909399">加载中...</div>';
    const qs = new URLSearchParams({ page: st.page, size: st.size });
    if (st.filters.status) qs.set('status', st.filters.status);
    if (st.filters.search) qs.set('search', st.filters.search);
    let data;
    try {
      data = await API.call('/api/batches?' + qs.toString());
    } catch (e) {
      wrap.innerHTML = `<div style="padding:32px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    App.renderTable(wrap, [
      { label: '用户账号', width: '110px', render: (r) => App.esc(r.username) },
      { label: '消息总数', width: '80px', render: (r) => App.esc(r.message_count) },
      { label: '成功数', width: '70px', render: (r) => App.esc(r.success_count) },
      { label: '失败数', width: '70px', render: (r) => App.esc(r.fail_count) },
      { label: '回复数', width: '70px', render: (r) => App.esc(r.reply_count) },
      { label: '首条回复率(%)', width: '110px', render: (r) => (Number(r.reply_rate) || 0).toFixed(2) },
      { label: 'T/固/虚拟过滤数量', width: '140px', render: (r) => App.esc(r.filter_count) },
      { label: '完成状态', width: '90px', render: (r) => App.batchStatus(r.status).html },
      { label: '备注', render: (r) => App.esc(r.note || '-') },
      { label: '创建时间', width: '160px', render: (r) => App.esc(r.created_at) },
      { label: '操作', width: '80px', render: (r) => `<button class="el-btn" data-detail="${App.esc(r.id)}">详情</button>` }
    ], data.list || [], '暂无批次');
    App.pagination(pager, {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; self.load(container); }
    });
    wrap.querySelectorAll('button[data-detail]').forEach((b) => {
      b.onclick = () => self.openDetail(b.dataset.detail);
    });
  },
  openDetail: function (id) {
    const st = { page: 1, size: 10 };
    App.modal({
      title: '批次详情', large: true, okText: '关 闭', showCancel: false,
      body: '<div id="mgd-info"></div><div id="mgd-table"></div><div id="mgd-pager"></div>'
    });
    const self = this;
    const load = async () => {
      let d;
      try {
        d = await API.call(`/api/batches/${encodeURIComponent(id)}/detail?page=${st.page}&size=${st.size}`);
      } catch (e) {
        const el = document.getElementById('mgd-info');
        if (el) el.innerHTML = `<div style="padding:12px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
        return;
      }
      const b = d.batch || {};
      const info = document.getElementById('mgd-info');
      if (info) info.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:6px 24px;margin-bottom:12px;font-size:13px">
          <span>账号：<b>${App.esc(b.username)}</b></span>
          <span>主题：<b>${App.esc(b.topic)}</b></span>
          <span>状态：${App.batchStatus(b.status).html}</span>
          <span>消息总数：<b>${App.esc(b.message_count)}</b></span>
          <span>成功：<b>${App.esc(b.success_count)}</b></span>
          <span>失败：<b>${App.esc(b.fail_count)}</b></span>
          <span>回复：<b>${App.esc(b.reply_count)}</b></span>
          <span>创建时间：<b>${App.esc(b.created_at)}</b></span>
          <span>备注：<b>${App.esc(b.note || '-')}</b></span>
        </div>`;
      const tbl = document.getElementById('mgd-table');
      if (tbl) App.renderTable(tbl, [
        { label: '发送号码', width: '110px', render: (m) => App.esc(m.from_number) },
        { label: '接收号码', width: '110px', render: (m) => App.esc(m.to_number) },
        { label: '消息内容', render: (m) => App.esc(m.content) },
        { label: '方向', width: '70px', render: (m) => App.tag(App.DIR_TEXT[m.direction] || m.direction) },
        { label: '状态', width: '70px', render: (m) => App.tag(App.MSG_STATUS_TEXT[m.status] || m.status) },
        { label: '发送时间', width: '150px', render: (m) => App.esc(m.created_at) }
      ], d.list || [], '该批次暂无消息');
      const pager = document.getElementById('mgd-pager');
      if (pager) App.pagination(pager, {
        total: d.total, page: st.page, size: st.size,
        onChange: (p) => { st.page = p; load(); }
      });
    };
    load();
  }
};
