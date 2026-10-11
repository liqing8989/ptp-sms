// 号码检测：任务列表 + 创建检测任务 + 查看详情
window.Pages = window.Pages || {};
window.Pages['/phoneFilter'] = {
  title: '号码检测',
  state: { page: 1, size: 10, filters: { status: '', source: '', search: '' } },
  render: function (container) {
    const self = this;
    container.innerHTML = `
      <div class="row-between">
        <div class="page-title">号码检测</div>
        <div><button class="el-btn el-btn--primary" id="pf-create">创建号码检测任务</button></div>
      </div>
      <div class="el-card"><div class="card-body" id="pf-fb"></div></div>
      <div class="el-card">
        <div class="card-head">检测任务列表</div>
        <div class="card-body" id="pf-table" style="text-align:center;padding:32px;color:#909399">加载中...</div>
        <div class="card-body" style="padding-top:0" id="pf-pager"></div>
      </div>`;
    App.filterBar(container.querySelector('#pf-fb'), [
      { type: 'select', key: 'status', label: '状态', placeholder: '全部状态', options: [
        { value: 'completed', label: '已完成' },
        { value: 'processing', label: '处理中' }
      ] },
      { type: 'select', key: 'source', label: '来源', placeholder: '全部来源', options: [
        { value: '手动上传', label: '手动上传' },
        { value: '导入文件', label: '导入文件' }
      ] },
      { type: 'input', key: 'search', label: '搜索', placeholder: '按备注搜索' }
    ], {
      onSearch: (v) => {
        self.state.filters = { status: v.status, source: v.source, search: v.search };
        self.state.page = 1;
        self.load(container);
      },
      onReset: () => {
        self.state.filters = { status: '', source: '', search: '' };
        self.state.page = 1;
        self.load(container);
      }
    });
    container.querySelector('#pf-create').onclick = () => self.openCreate(container);
    this.load(container);
  },
  load: async function (container) {
    const st = this.state;
    const self = this;
    const wrap = container.querySelector('#pf-table');
    const pager = container.querySelector('#pf-pager');
    wrap.innerHTML = '<div style="padding:32px;color:#909399">加载中...</div>';
    const qs = new URLSearchParams({ page: st.page, size: st.size });
    if (st.filters.status) qs.set('status', st.filters.status);
    if (st.filters.source) qs.set('source', st.filters.source);
    if (st.filters.search) qs.set('search', st.filters.search);
    let data;
    try {
      data = await API.call('/api/phone-filter/tasks?' + qs.toString());
    } catch (e) {
      wrap.innerHTML = `<div style="padding:32px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    App.renderTable(wrap, [
      { label: '号码总数', width: '90px', render: (r) => App.esc(r.total) },
      { label: '有效数量', width: '90px', render: (r) => App.esc(r.valid) },
      { label: 'T/固/虚拟数量', width: '120px', render: (r) => App.esc(r.t_voip_count) },
      { label: '备注', render: (r) => App.esc(r.note || '-') },
      { label: '状态', width: '90px', render: (r) => App.tag(r.status === 'completed' ? '已完成' : '处理中') },
      { label: '来源', width: '100px', render: (r) => App.tag(r.source || '') },
      { label: '创建时间', width: '160px', render: (r) => App.esc(r.created_at) },
      { label: '操作', width: '90px', render: (r) => `<button class="el-btn" data-detail="${App.esc(r.id)}">查看详情</button>` }
    ], data.list || [], '暂无检测任务');
    App.pagination(pager, {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; self.load(container); }
    });
    wrap.querySelectorAll('button[data-detail]').forEach((b) => {
      b.onclick = () => self.openDetail(b.dataset.detail);
    });
  },
  openCreate: function (container) {
    const self = this;
    App.modal({
      title: '创建号码检测任务',
      body: `
        <div style="margin:6px 0">号码列表（每行一个）</div>
        <textarea class="el-textarea" id="pf-num-input" rows="6" placeholder="13800000000&#10;13900000000"></textarea>
        <div style="margin:8px 0 4px">来源</div>
        <select class="el-select" id="pf-src-input">
          <option value="手动上传">手动上传</option>
          <option value="导入文件">导入文件</option>
        </select>
        <div style="margin:8px 0 4px">备注</div>
        <input class="el-input" id="pf-note-input" placeholder="选填">`,
      okText: '开始检测',
      onOk: async () => {
        const numbers = document.getElementById('pf-num-input').value;
        const source = document.getElementById('pf-src-input').value;
        const note = document.getElementById('pf-note-input').value.trim();
        if (!numbers.trim()) { App.toast('请输入号码列表', 'warning'); return false; }
        try {
          const d = await API.call('/api/phone-filter/tasks', { method: 'POST', body: JSON.stringify({ numbers, source, note }) });
          App.toast(`检测完成：总数 ${d.total}，有效 ${d.valid}，无效 ${d.invalid}`);
          self.load(container);
        } catch (e) { App.toast(e.message, 'error'); return false; }
      }
    });
  },
  openDetail: async function (id) {
    App.modal({
      title: '号码检测详情', large: true, okText: '关 闭', showCancel: false,
      body: '<div id="pfd-body" style="text-align:center;padding:24px;color:#909399">加载中...</div>'
    });
    let data;
    try {
      data = await API.call('/api/phone-filter/tasks/' + encodeURIComponent(id));
    } catch (e) {
      const el = document.getElementById('pfd-body');
      if (el) el.innerHTML = `<div style="padding:12px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    const t = data.task || {};
    const r = data.result || {};
    const validList = r.valid || [];
    const chips = validList.length
      ? validList.slice(0, 50).map((n) => `<span class="el-tag el-tag--info" style="margin:2px 4px 2px 0">${App.esc(n)}</span>`).join('')
      : '<span style="color:#909399">暂无有效号码</span>';
    const el = document.getElementById('pfd-body');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="val">${App.esc(t.total)}</div><div class="lab">号码总数</div></div>
        <div class="stat-card"><div class="val">${App.esc(t.valid)}</div><div class="lab">有效数量</div></div>
        <div class="stat-card"><div class="val">${App.esc(t.t_voip_count)}</div><div class="lab">T/固/虚拟数量</div></div>
        <div class="stat-card"><div class="val">${App.esc(r.invalidCount)}</div><div class="lab">无效数量</div></div>
      </div>
      <div style="margin:8px 0">有效号码示例（最多展示 50 个）</div>
      <div>${chips}</div>`;
  }
};
