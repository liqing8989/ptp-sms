// 消息管理：方向/类型/状态筛选 + 搜索 + 分页表格，操作列弹窗查看完整内容
window.Pages = window.Pages || {};
window.Pages['/messagelist'] = {
  title: '消息管理',
  state: { page: 1, size: 10, filters: { direction: '', type: '', status: '', search: '' } },

  render: function (container) {
    container.innerHTML = `
      <div class="el-card">
        <div class="card-body" id="ml-filter"></div>
      </div>
      <div class="el-card">
        <div class="card-head">消息列表</div>
        <div class="card-body" id="ml-table">
          <div style="text-align:center;padding:32px;color:#909399">加载中...</div>
        </div>
        <div class="card-body" style="padding-top:0"><div id="ml-pager"></div></div>
      </div>`;

    App.filterBar(container.querySelector('#ml-filter'), [
      { type: 'select', key: 'direction', label: '消息方向', placeholder: '全部', options: [{ value: 'send', label: '发送' }, { value: 'receive', label: '接收' }] },
      { type: 'select', key: 'type', label: '发送类型', placeholder: '全部', options: [{ value: 'batch', label: '批量' }, { value: 'single', label: '单条' }] },
      { type: 'select', key: 'status', label: '提交状态', placeholder: '全部', options: [{ value: 'success', label: '成功' }, { value: 'fail', label: '失败' }, { value: 'pending', label: '待发送' }] },
      { type: 'input', key: 'search', label: '搜索', placeholder: '按消息内容模糊搜索' }
    ], {
      onSearch: (v) => {
        this.state.filters = { direction: v.direction || '', type: v.type || '', status: v.status || '', search: v.search || '' };
        this.state.page = 1;
        this.load(container);
      },
      onReset: () => {
        this.state.filters = { direction: '', type: '', status: '', search: '' };
        this.state.page = 1;
        this.load(container);
      }
    });

    this.load(container);
  },

  load: async function (container) {
    const st = this.state;
    const tableEl = container.querySelector('#ml-table');
    const pagerEl = container.querySelector('#ml-pager');
    const f = st.filters;
    const qs = `direction=${encodeURIComponent(f.direction)}&type=${encodeURIComponent(f.type)}&status=${encodeURIComponent(f.status)}&search=${encodeURIComponent(f.search)}&page=${st.page}&size=${st.size}`;

    let data;
    try {
      data = await API.call('/api/messages?' + qs);
    } catch (e) {
      tableEl.innerHTML = `<div style="text-align:center;padding:32px;color:#F56C6C">加载失败：${App.esc(e.message)}</div>`;
      pagerEl.innerHTML = '';
      return;
    }

    const rows = data.list || [];
    App.renderTable(tableEl, [
      { key: 'username', label: '用户账号', width: '110px' },
      { key: 'from_number', label: '发送号码', width: '130px' },
      { key: 'to_number', label: '接收号码', width: '130px' },
      {
        key: 'content', label: '消息内容', render: (row) => {
          const c = String(row.content || '');
          const short = c.length > 24 ? c.slice(0, 24) + '…' : c;
          return `<span title="${App.esc(c)}">${App.esc(short)}</span>`;
        }
      },
      { key: 'direction', label: '消息方向', width: '90px', render: (row) => App.tag(App.DIR_TEXT[row.direction] || row.direction) },
      { key: 'type', label: '发送类型', width: '90px', render: (row) => App.tag(App.TYPE_TEXT[row.type] || row.type) },
      { key: 'status', label: '提交状态', width: '90px', render: (row) => App.tag(App.MSG_STATUS_TEXT[row.status] || row.status) },
      { key: 'created_at', label: '发送时间', width: '170px', render: (row) => App.esc(row.created_at) },
      {
        key: 'op', label: '操作', width: '80px', render: (row) => {
          const id = row.id;
          return `<button class="el-btn el-btn--text" data-view="${App.esc(id)}">查 看</button>`;
        }
      }
    ], rows, '暂无消息记录');

    // 绑定「查看」弹窗
    tableEl.querySelectorAll('button[data-view]').forEach((btn) => {
      btn.onclick = () => {
        const row = rows.find((r) => String(r.id) === String(btn.dataset.view));
        if (!row) return;
        App.modal({
          title: '消息详情',
          showCancel: false,
          okText: '关 闭',
          body: `
            <div style="font-size:13px;line-height:1.9;color:#606266">
              <div>用户账号：${App.esc(row.username)}</div>
              <div>发送号码：${App.esc(row.from_number)}　接收号码：${App.esc(row.to_number)}</div>
              <div>方向：${App.tag(App.DIR_TEXT[row.direction] || row.direction)}　类型：${App.tag(App.TYPE_TEXT[row.type] || row.type)}　状态：${App.tag(App.MSG_STATUS_TEXT[row.status] || row.status)}</div>
              ${row.channel_status ? `<div>通道状态：${App.esc(row.channel_status)}${row.twilio_sid ? `　Twilio SID：${App.esc(row.twilio_sid)}` : ''}</div>` : ''}
              ${row.fail_reason ? `<div style="color:#F56C6C">失败原因：${App.esc(row.fail_reason)}</div>` : ''}
              <div>发送时间：${App.esc(row.created_at)}</div>
            </div>
            <div style="margin-top:12px;padding:12px;background:#f5f7fa;border-radius:6px;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow:auto">${App.esc(row.content)}</div>`
        });
      };
    });

    App.pagination(pagerEl, {
      total: data.total, page: st.page, size: st.size,
      onChange: (p) => { st.page = p; this.load(container); }
    });
  }
};
