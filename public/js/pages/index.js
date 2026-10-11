// 首页：统计卡片 + 系统公告
window.Pages = window.Pages || {};
window.Pages['/index'] = {
  title: '首页',
  render: async function (container) {
    container.innerHTML = '<div class="el-card"><div class="card-body" style="text-align:center;padding:48px">数据加载中...</div></div>';
    let data, ann;
    try {
      data = await API.call('/api/stats');
      ann = await API.call('/api/announcements');
    } catch (e) {
      App.toast(e.message, 'error');
      container.innerHTML = `<div class="el-card"><div class="card-body" style="text-align:center;padding:48px">加载失败：${App.esc(e.message)}</div></div>`;
      return;
    }
    const cards = [
      { key: 'today_batches', label: '今日批次量', ic: 'chart', color: 'blue' },
      { key: 'today_batch_msgs', label: '批次消息量', ic: 'send', color: 'cyan' },
      { key: 'today_reply_rate', label: '今日回复率(%)', ic: 'chat', color: 'orange', suffix: '' },
      { key: 'total_reply_rate', label: '总回复率(%)', ic: 'chat', color: 'purple' },
      { key: 'today_sent', label: '今日发送量', ic: 'inbox', color: 'green' },
      { key: 'month_sent', label: '本月发送总量', ic: 'card', color: 'pink' },
      { key: 'total_sent', label: '历史发送总量', ic: 'chart', color: 'red' }
    ];
    const cardHtml = cards.map((c) => {
      let v = data[c.key];
      if (c.key.indexOf('rate') >= 0) v = Number(v).toFixed(2);
      else v = Number(v).toLocaleString();
      return `<div class="stat-card">
        <div class="ic ic-${c.color}">${App.icon(c.ic)}</div>
        <div><div class="val">${v}${c.suffix || ''}</div><div class="lab">${c.label}</div></div>
      </div>`;
    }).join('');
    const annHtml = (ann.list || []).map((a) => `
      <li><span class="dot">●</span><span>${App.esc(a.content)}</span><span class="time">${App.esc(a.created_at || '')}</span></li>`).join('') || '<li>暂无公告</li>';
    container.innerHTML = `
      <div class="stat-grid">${cardHtml}</div>
      <div class="el-card">
        <div class="card-head">系统公告</div>
        <div class="card-body"><ul class="announce-list">${annHtml}</ul></div>
      </div>`;
  }
};
