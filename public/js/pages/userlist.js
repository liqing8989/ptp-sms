// 账户管理页面（管理员）
window.Pages = window.Pages || {};
window.Pages['/userlist'] = {
  title: '账户管理',
  render: function (container) {
    const esc = App.esc;
    const fmt = App.fmt;

    container.innerHTML = `
      <div class="page-card">
        <div class="page-header">
          <h2>账户管理</h2>
          <div class="page-actions">
            <input type="text" id="search-input" placeholder="搜索用户名..." class="input" style="width:200px">
            <button class="btn btn-primary" id="search-btn">搜索</button>
          </div>
        </div>
        <div id="user-table-wrap"></div>
        <div id="pagination-wrap"></div>
      </div>
    `;

    let page = 1;
    let total = 0;
    const size = 10;

    async function load() {
      const search = document.getElementById('search-input').value.trim();
      const data = await API.call(`/api/users?page=${page}&size=${size}&search=${encodeURIComponent(search)}`);
      total = data.total;
      renderTable(data.list);
      renderPagination();
    }

    function renderTable(list) {
      if (!list.length) {
        document.getElementById('user-table-wrap').innerHTML = '<div class="empty">暂无用户</div>';
        return;
      }
      const rows = list.map(u => `
        <tr>
          <td>${esc(u.username)}</td>
          <td>${fmt.money(u.balance)} 元</td>
          <td>${esc(u.expire_at || '--')}</td>
          <td>${u.is_admin ? '<span class="tag tag-primary">管理员</span>' : '<span class="tag">用户</span>'}</td>
          <td>${u.is_blocked ? '<span class="tag tag-danger">已禁用</span>' : '<span class="tag tag-success">正常</span>'}</td>
          <td>${esc(u.created_at || '--')}</td>
          <td>
            <button class="btn btn-sm btn-primary" data-action="recharge" data-id="${u.id}" data-name="${esc(u.username)}">充值</button>
            <button class="btn btn-sm ${u.is_blocked ? 'btn-success' : 'btn-warning'}" data-action="toggle" data-id="${u.id}">${u.is_blocked ? '启用' : '禁用'}</button>
            <button class="btn btn-sm btn-danger" data-action="reset-pwd" data-id="${u.id}" data-name="${esc(u.username)}">重置密码</button>
          </td>
        </tr>
      `).join('');
      document.getElementById('user-table-wrap').innerHTML = `
        <table class="table">
          <thead><tr>
            <th>用户名</th><th>余额</th><th>有效期至</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    function renderPagination() {
      const pages = Math.ceil(total / size);
      if (pages <= 1) { document.getElementById('pagination-wrap').innerHTML = ''; return; }
      let html = '<div class="pagination">';
      for (let i = 1; i <= pages; i++) {
        html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : ''}" data-page="${i}">${i}</button>`;
      }
      html += '</div>';
      document.getElementById('pagination-wrap').innerHTML = html;
    }

    // 事件绑定
    document.getElementById('search-btn').onclick = () => { page = 1; load(); };
    document.getElementById('search-input').onkeydown = (e) => { if (e.key === 'Enter') { page = 1; load(); } };

    document.getElementById('user-table-wrap').onclick = async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name;

      if (action === 'recharge') {
        const amount = prompt(`给用户 ${name} 充值金额：`);
        if (!amount) return;
        await API.call('/api/recharges/admin', { method: 'POST', body: JSON.stringify({ username: name, amount: Number(amount), note: '管理员后台充值' }) });
        App.toast('充值成功');
        load();
      } else if (action === 'toggle') {
        await API.call(`/api/users/${id}/toggle-block`, { method: 'POST', body: '{}' });
        App.toast('操作成功');
        load();
      } else if (action === 'reset-pwd') {
        const pwd = prompt(`重置用户 ${name} 的新密码（至少 6 位）：`);
        if (!pwd) return;
        await API.call(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pwd }) });
        App.toast('密码已重置');
      }
    };

    document.getElementById('pagination-wrap').onclick = (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn) return;
      page = Number(btn.dataset.page);
      load();
    };

    load();
  }
};
