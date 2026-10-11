// 消费明细：列表 + 账户统计（余额/累计消费/累计充值）
window.Pages = window.Pages || {};
window.Pages['/paydetail'] = {
  title: '消费明细',
  state: { page: 1, size: 10, filters: { type: '', search: '' } },
  render: function (container) {
    const self = this;
    container.innerHTML = `
      <div class="row-between">
        <div class="page-title">消费明细</div>
        <div><button class="el-btn el-btn--primary" id="pd-sum-btn">统计余额</button></div>
      </div>
      <div class="el-card"><div class="card-body" id="pd-fb"></div></div>
      <div class="el-card">
        <div class="card-head">消费记录</div>
        <div class="card-body" id="pd-table" style="text-align:center;padding:32px;color:#909399">加载中...</div>
        <div class="card-body" style="padding-top:0" id="pd-pager"></div>
      </div>`;
    App.filterBar(container.querySelector('#pd-fb'), [
      { type: 'select', key: 'type', label: '消费类型', placeholder: '全部类型', options: [
        { value: '批量发送', label: '批量发送' },
        { value: '单条发送', label: '单条发送' },
        { value: '系统退款', label: '系统退款' },
        { value: '充值', label: '充值' }
      ] },
      { type: 'input', key: 'search', label: '搜索', placeholder: '按备注搜索' }
    ], {
      onSearch: (v) => {
        self.state.filters = { type: v.type, search: v.search };
        self.state.page = 1;
        self.load(container);
      },
      onReset: () => {
        self.state.filters = { type: '', search: '' };
        self.state.page = 1;
        self.load(container);
      }
    });
    container.querySelector('#pd-sum-btn').onclick = () => self.openSum();
    this.load(container);
  },
  load: async function (container) {
    const st = this.state;
    const self = this;
    const wrap = container.querySelector('#pd-table');
    const pager = container.querySelector('#pd-pager');
    wrap.innerHTML = '<div style="padding:32px;color:#909399">加载中...</div>';
    const qs = new URLSearchParams({ page: st.page, size: st.size });
    if (st.filters.type) qs.set('type', st.filters.type);
    if (st.filters.search) qs.set('search', st.filters.search);
    let data;
    try {
      data = await API.call('/api/paydetails?' + qs.toString());
    } catch (e) {
      wrap.innerHTML = `<div style="padding:32px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    App.renderTable(wrap, [
      { label: '用户账号', width: '120px', render: (r) => App.esc(r.username) },
      { label: '消费类型', width: '100px', render: (r) => App.tag(r.type || '') },
      { label: '余额', width: '110px', render: (r) => {
        const v = Number(r.amount) || 0;
        return `<span class="${v < 0 ? 'text-red' : ''}">${App.fmt.money(v)}</span>`;
      } },
      { label: '消费前余额', width: '110px', render: (r) => App.fmt.money(r.balance_before) },
      { label: '消费后余额', width: '110px', render: (r) => App.fmt.money(r.balance_after) },
      { label: '备注', render: (r) => App.esc(r.note || '-') },
      { label: '创建时间', width: '160px', render: (r) => App.esc(r.created_at) }
    ], data.list || [], '暂无消费记录');
    App.pagination(pager, {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; self.load(container); }
    });
  },
  openSum: function () {
    App.modal({
      title: '账户统计', okText: '关 闭', showCancel: false,
      body: '<div id="pd-sum-body" style="text-align:center;padding:20px;color:#909399">加载中...</div>'
    });
    (async () => {
      let d;
      try {
        d = await API.call('/api/paydetails/sum');
      } catch (e) {
        const el = document.getElementById('pd-sum-body');
        if (el) el.innerHTML = `<div style="padding:12px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
        return;
      }
      const el = document.getElementById('pd-sum-body');
      if (!el) return;
      el.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="val">${App.fmt.money(d.balance)}</div><div class="lab">当前余额（元）</div></div>
          <div class="stat-card"><div class="val">${App.fmt.money(d.consumed)}</div><div class="lab">累计消费（元）</div></div>
          <div class="stat-card"><div class="val">${App.fmt.money(d.recharged)}</div><div class="lab">累计充值（元）</div></div>
        </div>`;
    })();
  }
};
