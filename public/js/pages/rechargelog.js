// 余额记录：充值流水列表 + 管理员给用户充值
window.Pages = window.Pages || {};
window.Pages['/rechargelog'] = {
  title: '余额记录',
  state: { page: 1, size: 10, filters: { type: '', search: '' } },
  render: function (container) {
    const isAdmin = !!(App.user() && App.user().is_admin === 1);
    container.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <div class="page-title">余额记录</div>
        ${isAdmin ? '<button class="el-btn el-btn--primary" id="btn-recharge">给用户充值</button>' : ''}
      </div>
      <div class="el-card">
        <div class="card-body"><div id="rl-filter"></div></div>
      </div>
      <div class="el-card">
        <div class="card-body" style="text-align:center;padding:32px">数据加载中...</div>
      </div>`;
    App.filterBar(container.querySelector('#rl-filter'), [
      { type: 'select', key: 'type', label: '类型', placeholder: '全部类型', options: [{ value: '充值', label: '充值' }], width: '140px' },
      { type: 'input', key: 'search', label: '搜索', placeholder: '收款方 / 套餐 / 备注', width: '220px' }
    ], {
      onSearch: (v) => {
        this.state.filters = { type: v.type || '', search: v.search || '' };
        this.state.page = 1;
        this.load(container);
      },
      onReset: () => {
        this.state.filters = { type: '', search: '' };
        this.state.page = 1;
        this.load(container);
      }
    });
    if (isAdmin) {
      container.querySelector('#btn-recharge').onclick = () => this.openRecharge(container);
    }
    this.load(container);
  },
  load: async function (container) {
    const st = this.state;
    const card = container.querySelectorAll('.el-card')[1];
    card.innerHTML = '<div class="card-body" style="text-align:center;padding:32px">数据加载中...</div>';
    const qs = `type=${encodeURIComponent(st.filters.type)}&search=${encodeURIComponent(st.filters.search)}&page=${st.page}&size=${st.size}`;
    let data;
    try {
      data = await API.call('/api/recharges?' + qs);
    } catch (e) {
      card.innerHTML = `<div class="card-body" style="text-align:center;padding:32px">加载失败：${App.esc(e.message)}</div>`;
      return;
    }
    App.renderTable(card, [
      { key: 'upper_name', label: '上级用户', width: '110px', render: (r) => App.esc(r.upper_name || '-') },
      { key: 'target_name', label: '收款方', width: '110px', render: (r) => App.esc(r.target_name || '-') },
      { key: 'type', label: '类型', width: '90px', render: (r) => App.tag(r.type || '') },
      { key: 'amount', label: '余额', width: '100px', render: (r) => App.fmt.money(r.amount) },
      { key: 'package_name', label: '套餐名称', width: '120px', render: (r) => App.esc(r.package_name || '-') },
      { key: 'note', label: '备注', render: (r) => App.esc(r.note || '-') },
      { key: 'created_at', label: '充值时间', width: '170px', render: (r) => App.esc(r.created_at || '') }
    ], data.list, '暂无充值记录');
    const pager = document.createElement('div');
    card.appendChild(pager);
    App.pagination(pager, {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; this.load(container); }
    });
  },
  openRecharge: function (container) {
    App.modal({
      title: '给用户充值',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div><span style="display:block;margin-bottom:6px;font-size:13px;color:#606266">账号</span>
            <input class="el-input" id="rc-username" placeholder="输入被充值用户账号"></div>
          <div><span style="display:block;margin-bottom:6px;font-size:13px;color:#606266">金额（元）</span>
            <input class="el-input" id="rc-amount" type="number" min="0" step="0.01" placeholder="如 100"></div>
          <div><span style="display:block;margin-bottom:6px;font-size:13px;color:#606266">套餐</span>
            <select class="el-select" id="rc-package">
              <option value="基础套餐">基础套餐</option>
              <option value="标准套餐">标准套餐</option>
              <option value="旗舰套餐">旗舰套餐</option>
            </select></div>
          <div><span style="display:block;margin-bottom:6px;font-size:13px;color:#606266">备注</span>
            <input class="el-input" id="rc-note" placeholder="可选"></div>
        </div>`,
      okText: '确认充值',
      onOk: async () => {
        const username = document.getElementById('rc-username').value.trim();
        const amount = Number(document.getElementById('rc-amount').value);
        const package_name = document.getElementById('rc-package').value;
        const note = document.getElementById('rc-note').value.trim();
        if (!username) { App.toast('请输入账号', 'warning'); return false; }
        if (!amount || amount <= 0) { App.toast('请输入有效金额', 'warning'); return false; }
        try {
          await API.call('/api/recharges/admin', {
            method: 'POST',
            body: JSON.stringify({ username, amount, package_name, note })
          });
          App.toast('充值成功');
          await App.refreshUser();
          this.load(container);
          return true;
        } catch (e) {
          App.toast(e.message, 'error');
          return false;
        }
      }
    });
  }
};
