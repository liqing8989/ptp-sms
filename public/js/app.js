// 应用外壳：布局、路由、共享组件（表格/分页/筛选/弹窗/toast/标签）
window.App = (() => {
  let user = null;

  // ---------------- 基础工具 ----------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = {
    money: (n) => (Number(n || 0)).toFixed(2),
    time: (s) => String(s || '').slice(11, 19),
    dt: (s) => String(s || '')
  };

  // 北京时间（以世界时 +8 小时换算，与服务端时间口径一致）
  function bjDate() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return { y: d.getUTCFullYear(), mo: p(d.getUTCMonth() + 1), da: p(d.getUTCDate()), h: p(d.getUTCHours()), mi: p(d.getUTCMinutes()), s: p(d.getUTCSeconds()) };
  }

  // 账号剩余有效期（expire_at 为北京时间字符串）
  function expireLeft() {
    if (!user || !user.expire_at) return '--';
    const t = new Date(user.expire_at.replace(' ', 'T') + '+08:00').getTime() - Date.now();
    if (t <= 0) return '已过期';
    const d = Math.floor(t / 86400000);
    const h = Math.floor((t % 86400000) / 3600000);
    const m = Math.floor((t % 3600000) / 60000);
    const s = Math.floor((t % 60000) / 1000);
    return `${d}天${h}小时${m}分${s}秒`;
  }

  // ---------------- 图标 ----------------
  const ICONS = {
    home: '<path d="M3 10.5 12 3.5l9 7"/><path d="M5 9.8V20h14V9.8"/>',
    chat: '<path d="M4 5.5h16v10.5H9.5L5 20v-4H4z"/>',
    send: '<path d="M3.5 11.5 20.5 4l-5.5 16.5-4-7z"/><path d="M11 13.5 20.5 4"/>',
    inbox: '<path d="M4 5h16v14H4z"/><path d="M4 12h4.5l2 2.5h3L15.5 12H20"/>',
    shield: '<path d="M12 3.5l6.5 2.6v5.2c0 4.3-2.8 8-6.5 9.2-3.7-1.2-6.5-4.9-6.5-9.2V6.1z"/><path d="M9 11.8l2 2 4-4"/>',
    chart: '<path d="M4 20h16"/><path d="M7 20v-6"/><path d="M12 20V9"/><path d="M17 20V5"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7a2 2 0 0 1 2-2h12"/><path d="M15 14h2.5"/>',
    compress: '<path d="M4 4h5v5H4z"/><path d="M15 15h5v5h-5z"/><path d="M9 15l6 6"/><path d="M15 9l6-6"/>',
    channel: '<path d="M3 7h7"/><path d="M14 7h7"/><circle cx="12" cy="7" r="2"/><path d="M3 17h7"/><path d="M14 17h7"/><circle cx="12" cy="17" r="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    logo: '<path d="M5 7h9a4 4 0 0 1 0 8H9l-2 4V7z" fill="currentColor" stroke="none"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

  // ---------------- 菜单 ----------------
  const MENU = [
    { path: '/index', label: '首页', icon: 'home' },
    { path: '/chat', label: '聊天', icon: 'chat' },
    { path: '/batchchat', label: '批量发送', icon: 'send' },
    { path: '/messagelist', label: '消息管理', icon: 'inbox' },
    { path: '/phoneFilter', label: '号码检测', icon: 'shield' },
    { path: '/messagegroup', label: '批次统计', icon: 'chart' },
    { path: '/paydetail', label: '消费明细', icon: 'card' },
    { path: '/rechargelog', label: '余额记录', icon: 'wallet' },
    { path: '/userlist', label: '账户管理', icon: 'users', admin: true },
    { path: '/tool/compress', label: '图片压缩', icon: 'compress' },
    { path: '/settings', label: '通道设置', icon: 'channel', admin: true }
  ];
  const labelOf = (path) => { const m = MENU.find((x) => x.path === path); return m ? m.label : '未知页面'; };

  // ---------------- 标签与状态文案 ----------------
  const TAG = {
    success: 'success', fail: 'danger', pending: 'warning',
    completed: 'success', submitted: 'primary', accepted: 'primary',
    sending: 'warning', sent_to_provider: 'warning', waiting_callback: 'warning',
    send: 'primary', receive: 'success', batch: 'info', single: 'warning',
    '批量发送': 'primary', '单条发送': 'warning', '系统退款': 'success', '充值': 'success',
    '发送': 'primary', '接收': 'success', '成功': 'success', '失败': 'danger', '待发送': 'warning',
    '已完成': 'success', '处理中': 'warning', '已提交': 'primary', '已接受': 'primary',
    '发送中': 'warning', '已给运营商': 'warning', '等待回调': 'warning',
    '手动上传': 'primary', '导入文件': 'info', '有效': 'success', '无效': 'info'
  };
  const STATUS_TEXT = {
    submitted: '已提交', accepted: '已接受', sending: '发送中',
    sent_to_provider: '已给运营商', waiting_callback: '等待回调', completed: '已完成'
  };
  const DIR_TEXT = { send: '发送', receive: '接收' };
  const MSG_STATUS_TEXT = { pending: '待发送', success: '成功', fail: '失败' };
  const TYPE_TEXT = { batch: '批量', single: '单条' };

  const tag = (text) => { const k = TAG[text] || 'info'; return `<span class="el-tag el-tag--${k}">${esc(text)}</span>`; };
  const batchStatus = (code) => { const t = STATUS_TEXT[code] || code; return { text: t, html: tag(t) }; };

  // ---------------- Toast ----------------
  function toast(msg, type = 'success') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2400);
  }

  // ---------------- Modal ----------------
  function modal(opts = {}) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="dialog ${opts.large ? 'dialog--lg' : ''}">
        <div class="dialog-head"><span>${esc(opts.title || '提示')}</span><span class="x">&times;</span></div>
        <div class="dialog-body">${opts.body || ''}</div>
        <div class="dialog-foot">
          ${opts.showCancel !== false ? '<button class="el-btn" data-act="cancel">取 消</button>' : ''}
          ${opts.showOk !== false ? `<button class="el-btn el-btn--primary" data-act="ok">${esc(opts.okText || '确 定')}</button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('.x').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    const btnOk = ov.querySelector('[data-act="ok"]');
    const btnCancel = ov.querySelector('[data-act="cancel"]');
    if (btnOk) btnOk.onclick = async () => { const r = opts.onOk ? await opts.onOk() : true; if (r !== false) close(); };
    if (btnCancel) btnCancel.onclick = () => { if (opts.onCancel) opts.onCancel(); close(); };
    return close;
  }

  function confirm(msg, okText) {
    return new Promise((resolve) => {
      modal({ title: '操作确认', body: `<p style="font-size:14px">${esc(msg)}</p>`, okText: okText || '确 定', onOk: () => { resolve(true); return true; }, onCancel: () => resolve(false) });
    });
  }

  // ---------------- 表格 ----------------
  function renderTable(container, columns, rows, emptyText) {
    const th = columns.map((c) => `<th style="${c.width ? 'width:' + c.width : ''}">${esc(c.label)}</th>`).join('');
    let body = '';
    if (!rows || !rows.length) {
      body = `<tr class="empty-row"><td colspan="${columns.length}">${esc(emptyText || '暂无数据')}</td></tr>`;
    } else {
      body = rows.map((r) => {
        const tds = columns.map((c) => `<td class="${c.className || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
    }
    container.innerHTML = `<div class="table-wrap"><table class="el-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---------------- 分页 ----------------
  function pagination(container, { total, page, size, onChange }) {
    const pages = Math.max(1, Math.ceil(total / size));
    let html = `<span class="total">共 ${total} 条</span>`;
    const mk = (label, p, disabled, on) =>
      `<button ${disabled ? 'disabled' : ''} class="${on ? 'on' : ''}" data-p="${p}">${label}</button>`;
    html += mk('上一页', page - 1, page <= 1);
    const from = Math.max(1, page - 3), to = Math.min(pages, page + 3);
    for (let p = from; p <= to; p++) html += mk(p, p, false, p === page);
    html += mk('下一页', page + 1, page >= pages);
    container.innerHTML = `<div class="pager">${html}</div>`;
    container.querySelectorAll('button[data-p]').forEach((b) => {
      b.onclick = () => { const p = Number(b.dataset.p); if (p >= 1 && p <= pages && p !== page) onChange(p); };
    });
  }

  // ---------------- 筛选栏 ----------------
  // items: [{type:'select'|'input', key, label, options:[{value,label}], placeholder, width}]
  function filterBar(container, items, { onSearch, onReset }) {
    container.innerHTML = `<div class="filter-bar">${items.map((it, i) => {
      const id = 'fb-' + i;
      if (it.type === 'select') {
        return `<div class="item"><span class="lab">${esc(it.label || '')}</span>
          <select class="el-select" id="${id}" style="${it.width ? 'width:' + it.width : ''}">
            <option value="">${esc(it.placeholder || '请选择')}</option>
            ${(it.options || []).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
          </select></div>`;
      }
      return `<div class="item"><span class="lab">${esc(it.label || '')}</span>
        <input class="el-input" id="${id}" placeholder="${esc(it.placeholder || '请输入')}" style="${it.width ? 'width:' + it.width : ''}"></div>`;
    }).join('')}
      <div class="item"><button class="el-btn el-btn--primary" id="fb-search">搜 索</button>
      <button class="el-btn" id="fb-reset">重 置</button></div></div>`;
    const val = (i) => { const el = container.querySelector('#fb-' + i); return el ? el.value.trim() : ''; };
    container.querySelector('#fb-search').onclick = () => {
      const v = {}; items.forEach((it, i) => { v[it.key] = val(i); }); onSearch(v);
    };
    container.querySelector('#fb-reset').onclick = () => {
      items.forEach((it, i) => { const el = container.querySelector('#fb-' + i); if (el) el.value = ''; });
      onReset();
    };
  }

  // ---------------- 外壳渲染 ----------------
  function renderShell() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="brand"><div style="text-align:center"><span style="display:flex;align-items:center;justify-content:center;gap:8px">${icon('logo')} PTP</span><small>短信营销管理后台</small></div></div>
          <nav class="menu" id="sidebar-menu"></nav>
          <div class="foot">PTP SMS 1.0</div>
        </aside>
        <div class="main">
          <header class="topbar">
            <div class="breadcrumb"><span id="crumb-root">首页</span><span class="sep">/</span><span id="crumb-cur"></span></div>
            <div class="account">
              <div class="item avatar" id="user-avatar"></div>
              <div class="item">账号：<b id="acct-user"></b></div>
              <div class="item"><span class="lab">账户余额：</span><b class="balance" id="acct-balance"></b></div>
              <div class="item"><span class="lab">账号有效期剩余：</span><b class="expire" id="acct-expire"></b></div>
              <div class="item"><span class="lab">北京时间</span><b class="clock" id="bj-clock"></b></div>
              <div class="item logout" id="btn-logout">退出登录</div>
            </div>
          </header>
          <div class="content" id="content"></div>
        </div>
      </div>`;
    const menu = document.getElementById('sidebar-menu');
    const visibleMenu = MENU.filter((m) => !m.admin || (user && user.is_admin === 1));
    menu.innerHTML = visibleMenu.map((m) => `<a href="${m.path}" data-path="${m.path}">${icon(m.icon)}<span>${m.label}</span></a>`).join('');
    document.getElementById('btn-logout').onclick = () => {
      localStorage.removeItem('token');
      location.href = '/login';
    };
  }

  function render() {
    if (!document.getElementById('app').children.length) renderShell();
    const path = location.pathname;
    document.querySelectorAll('#sidebar-menu a').forEach((a) => a.classList.toggle('active', a.dataset.path === path));
    document.getElementById('crumb-cur').textContent = labelOf(path);
    const content = document.getElementById('content');
    content.innerHTML = '';
    const page = window.Pages[path];
    if (!page) {
      content.innerHTML = `<div class="el-card"><div class="card-body" style="text-align:center;padding:60px">页面不存在（404）<br><a href="/index" style="color:#409EFF">返回首页</a></div></div>`;
      return;
    }
    page.render(content);
    tickTopbar();
  }

  function tickTopbar() {
    const clock = document.getElementById('bj-clock');
    const expire = document.getElementById('acct-expire');
    if (clock) { const b = bjDate(); clock.textContent = `${b.y}-${b.mo}-${b.da} ${b.h}:${b.mi}:${b.s}`; }
    if (expire) expire.textContent = expireLeft();
  }

  const AVATAR_COLORS = ['#409EFF','#67C23A','#E6A23C','#F56C6C','#909399','#9B59B6','#1ABC9C','#E74C3C'];
  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function fillAvatar() {
    const a = document.getElementById('user-avatar');
    if (a && user) {
      a.textContent = (user.username || '?').charAt(0).toUpperCase();
      a.style.background = avatarColor(user.username || '?');
    }
  }

  async function refreshUser() {
    const d = await API.call('/api/user/me');
    user = d.user;
    const u = document.getElementById('acct-user');
    const b = document.getElementById('acct-balance');
    if (u) u.textContent = user.username;
    if (b) b.textContent = fmt.money(user.balance);
    fillAvatar();
    tickTopbar();
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const tk = params.get('token');
    if (tk) { localStorage.setItem('token', tk); history.replaceState({}, '', location.pathname); }
    if (location.pathname === '/login') return;
    if (!localStorage.getItem('token')) { location.replace('/login'); return; }
    try { await refreshUser(); } catch (e) { return; }
    render();
    // render 后 DOM 已渲染，补填顶部栏用户名/余额/头像（首次 refreshUser 时 DOM 还不存在）
    const _u = document.getElementById('acct-user');
    const _b = document.getElementById('acct-balance');
    if (_u && user) _u.textContent = user.username;
    if (_b && user) _b.textContent = fmt.money(user.balance);
    fillAvatar();
    window.addEventListener('popstate', render);
    setInterval(tickTopbar, 1000);
  }

  // 管理员独立后台
  async function bootAdmin() {
    if (!localStorage.getItem('token')) { location.replace('/login'); return; }
    try { await refreshUser(); } catch (e) { return; }
    // 非管理员不让进
    if (user && user.is_admin !== 1) { location.replace('/index'); return; }
    // 管理员后台默认进 /userlist
    if (location.pathname === '/admin') { history.replaceState({}, '', '/userlist'); }
    renderAdmin();
    const _u = document.getElementById('acct-user');
    const _b = document.getElementById('acct-balance');
    if (_u && user) _u.textContent = user.username;
    if (_b && user) _b.textContent = fmt.money(user.balance);
    fillAvatar();
    window.addEventListener('popstate', renderAdmin);
    setInterval(tickTopbar, 1000);
  }

  // 管理员后台渲染
  function renderAdmin() {
    const ADMIN_MENU = [
      { path: '/userlist', label: '账户管理', icon: 'users' },
      { path: '/rechargelog', label: '充值记录', icon: 'wallet' },
      { path: '/settings', label: '通道设置', icon: 'channel' },
    ];
    if (!document.getElementById('app').children.length) {
      document.getElementById('app').innerHTML = `
        <aside class="sidebar">
          <div class="logo"><svg viewBox="0 0 24 24" fill="currentColor" style="width:28px;height:28px">${ICONS.logo}</svg><span>PTP SMS 1.0</span></div>
          <div class="sidebar-sub">管理后台</div>
          <nav class="menu" id="sidebar-menu"></nav>
          <div class="sidebar-foot">© PTP SMS 1.0</div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="crumb"><span id="crumb-cur"></span></div>
            <div class="topbar-right">
              <span class="tb-item"><span class="lab">账号：</span><span id="acct-user">--</span></span>
              <span class="tb-item"><span class="lab">账户余额：</span><span id="acct-balance">--</span></span>
              <span class="tb-item"><span class="lab">账号有效期剩余：</span><span id="acct-expire">--</span></span>
              <span class="tb-item"><span class="lab">北京时间</span><span id="bj-clock">--</span></span>
              <span class="tb-item avatar" id="avatar-wrap"></span>
              <span class="tb-item logout" id="btn-logout">退出登录</span>
            </div>
          </header>
          <div class="content" id="content"></div>
        </main>
      `;
      document.getElementById('btn-logout').onclick = () => { localStorage.removeItem('token'); location.href = '/login'; };
    }
    const path = location.pathname;
    const menu = document.getElementById('sidebar-menu');
    menu.innerHTML = ADMIN_MENU.map((m) => `<a href="${m.path}" data-path="${m.path}">${icon(m.icon)}<span>${m.label}</span></a>`).join('');
    document.querySelectorAll('#sidebar-menu a').forEach((a) => a.classList.toggle('active', a.dataset.path === path));
    const m = ADMIN_MENU.find((x) => x.path === path);
    document.getElementById('crumb-cur').textContent = m ? m.label : '未知页面';
    const content = document.getElementById('content');
    content.innerHTML = '';
    const page = window.Pages[path];
    if (!page) {
      content.innerHTML = `<div class="el-card"><div class="card-body" style="text-align:center;padding:60px">页面不存在（404）<br><a href="/userlist" style="color:#409EFF">返回账户管理</a></div></div>`;
      return;
    }
    page.render(content);
    tickTopbar();
  }

  return { esc, fmt, icon, tag, batchStatus, STATUS_TEXT, DIR_TEXT, MSG_STATUS_TEXT, TYPE_TEXT, toast, modal, confirm, renderTable, pagination, filterBar, refreshUser, user: () => user, boot, bootAdmin };
})();
