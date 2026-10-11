// 批量发送：发送进度步骤条（6 步轮询）+ 新建批量任务表单
window.Pages = window.Pages || {};
window.Pages['/batchchat'] = {
  title: '批量发送',
  state: { meta: null, timer: null },

  STEP_LABELS: ['消息提交中', '已提交', '消息发送中', '已发送给运营商', '等待回调中', '已收到回调'],
  VIRTUAL_SEGMENTS: ['170', '171', '162', '165', '167', '192'],

  render: function (container) {
    // 清理上一次的轮询定时器，避免重复轮询
    if (this.state.timer) { clearInterval(this.state.timer); this.state.timer = null; }

    container.innerHTML = `
      <div class="row-between">
        <div class="page-title">批量发送</div>
        <div id="bc-price" style="color:#909399;font-size:13px">正在加载计费规则...</div>
      </div>
      <div class="el-card">
        <div class="card-head">发送进度</div>
        <div class="card-body" id="bc-steps-wrap">
          <div style="text-align:center;padding:24px;color:#909399">加载中...</div>
        </div>
      </div>
      <div class="el-card">
        <div class="card-head">新建批量任务</div>
        <div class="card-body">
          <div class="form-item" style="margin-bottom:16px">
            <label class="form-label" style="display:block;font-size:13px;color:#606266;margin-bottom:6px">短信内容列表（每行一条，按行去重）</label>
            <textarea class="el-textarea" id="bc-content" rows="7" placeholder="例如：【PTP优选】夏季新品上市，全场8.8折起，会员加赠好礼，回复TD退订"></textarea>
            <div id="bc-content-count" style="margin-top:6px;font-size:12px;color:#909399">当前 0 条，要求 ≥ 50</div>
          </div>
          <div class="form-item" style="margin-bottom:16px">
            <label class="form-label" style="display:block;font-size:13px;color:#606266;margin-bottom:6px">手机号码列表（每行一个号码）</label>
            <textarea class="el-textarea" id="bc-numbers" rows="7" placeholder="每行一个号码，支持大陆手机号；虚拟号段与固话将被过滤"></textarea>
            <div id="bc-numbers-count" style="margin-top:6px;font-size:12px;color:#909399">有效 0 个，要求 150 ~ 1000</div>
          </div>
          <div class="form-item" style="margin-bottom:16px">
            <label class="form-label" style="display:block;font-size:13px;color:#606266;margin-bottom:6px">话术主题</label>
            <select class="el-select" id="bc-topic">
              <option value="产品推广">产品推广</option>
              <option value="活动通知">活动通知</option>
              <option value="会员关怀">会员关怀</option>
              <option value="温馨提示">温馨提示</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div class="form-item" style="margin-bottom:16px">
            <label class="form-label" style="display:block;font-size:13px;color:#606266;margin-bottom:6px">备注</label>
            <input class="el-input" id="bc-note" placeholder="选填，便于后续识别批次">
          </div>
          <div class="form-item">
            <label class="form-label" style="display:inline-block;font-size:13px;color:#606266;margin-right:10px">是否需要号码检测</label>
            <label class="switch" style="vertical-align:middle">
              <input type="checkbox" id="bc-filter" checked>
              <span class="track"></span>
            </label>
            <span style="margin-left:8px;font-size:12px;color:#909399">开启后将过滤虚拟号段与固话等无效号码</span>
          </div>
          <div class="form-item" style="margin-top:16px">
            <button class="el-btn" id="bc-reset">重置内容</button>
            <button class="el-btn el-btn--primary" id="bc-submit" style="margin-left:12px">提交发送</button>
          </div>
        </div>
      </div>`;

    this.bindForm(container);
    this.loadMeta(container);
    this.loadStatus(container);
    // 每 2 秒轮询一次发送进度
    this.state.timer = setInterval(() => this.loadStatus(container), 2000);
  },

  // ---------- 计费元信息 ----------
  loadMeta: async function (container) {
    try {
      const m = await API.call('/api/meta');
      this.state.meta = m;
      let modeTxt = '';
      try {
        const md = await API.call('/api/settings/mode');
        modeTxt = md.mode === 'twilio' ? ' · 当前：Twilio 真实通道' : ' · 当前：模拟模式';
      } catch (e) { /* 模式获取失败时不影响页面 */ }
      const priceEl = container.querySelector('#bc-price');
      if (priceEl) priceEl.textContent = `单条价格 ${App.fmt.money(m.price)} 元 · 内容 ≥ ${m.min_content} 条 · 有效号码 ${m.min_numbers} ~ ${m.max_numbers} 个${modeTxt}`;
      this.updateCounters(container);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // ---------- 实时计数 ----------
  countContent: function (text) {
    const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return new Set(lines).size;
  },
  countValidNumbers: function (text) {
    const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    let valid = 0;
    lines.forEach((l) => {
      const d = l.replace(/\D/g, '');
      if (/^1[3-9]\d{9}$/.test(d) && !this.VIRTUAL_SEGMENTS.includes(d.slice(0, 3))) valid++;
    });
    return valid;
  },
  updateCounters: function (container) {
    const contentEl = container.querySelector('#bc-content');
    const numbersEl = container.querySelector('#bc-numbers');
    const ccEl = container.querySelector('#bc-content-count');
    const ncEl = container.querySelector('#bc-numbers-count');
    if (!contentEl || !numbersEl) return;
    const meta = this.state.meta || {};
    const minC = meta.min_content || 50;
    const minN = meta.min_numbers || 150;
    const maxN = meta.max_numbers || 1000;
    const price = meta.price || 0.05;

    const cc = this.countContent(contentEl.value);
    if (ccEl) {
      ccEl.textContent = `当前 ${cc} 条，要求 ≥ ${minC}` + (cc > 0 && cc < minC ? `（还差 ${minC - cc} 条）` : '');
      ccEl.style.color = cc >= minC ? '#67C23A' : '#909399';
    }
    const vn = this.countValidNumbers(numbersEl.value);
    if (ncEl) {
      let tip = `有效 ${vn} 个，要求 ${minN} ~ ${maxN}`;
      if (vn > 0 && (vn < minN || vn > maxN)) tip += vn < minN ? `（还差 ${minN - vn} 个）` : `（超出 ${vn - maxN} 个）`;
      tip += ` · 预估扣费 ${App.fmt.money(vn * price)} 元`;
      ncEl.textContent = tip;
      ncEl.style.color = (vn >= minN && vn <= maxN) ? '#67C23A' : '#909399';
    }
  },

  bindForm: function (container) {
    const contentEl = container.querySelector('#bc-content');
    const numbersEl = container.querySelector('#bc-numbers');
    contentEl.addEventListener('input', () => this.updateCounters(container));
    numbersEl.addEventListener('input', () => this.updateCounters(container));

    container.querySelector('#bc-reset').onclick = () => {
      contentEl.value = '';
      numbersEl.value = '';
      this.updateCounters(container);
      App.toast('已清空内容与号码列表');
    };

    const submitBtn = container.querySelector('#bc-submit');
    submitBtn.onclick = async () => {
      const meta = this.state.meta || {};
      const minC = meta.min_content || 50;
      const minN = meta.min_numbers || 150;
      const maxN = meta.max_numbers || 1000;
      const cc = this.countContent(contentEl.value);
      const vn = this.countValidNumbers(numbersEl.value);
      if (cc < minC) { App.toast(`短信内容去重后需 ≥ ${minC} 条，当前 ${cc} 条`, 'warning'); return; }
      if (vn < minN || vn > maxN) { App.toast(`有效号码需在 ${minN} ~ ${maxN} 之间，当前 ${vn} 个`, 'warning'); return; }

      submitBtn.disabled = true;
      try {
        const r = await API.call('/api/batch/submit', {
          method: 'POST',
          body: JSON.stringify({
            contentLines: contentEl.value,
            numbers: numbersEl.value,
            topic: container.querySelector('#bc-topic').value,
            note: container.querySelector('#bc-note').value,
            needReview: true,
            needFilter: container.querySelector('#bc-filter').checked
          })
        });
        App.toast(`批次 #${r.batch_id} 提交成功，扣费 ${App.fmt.money(r.cost)} 元（发送 ${r.message_count} 条）`);
        await App.refreshUser();
        this.loadStatus(container);
      } catch (e) {
        App.toast(e.message, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    };
  },

  // ---------- 进度步骤条 ----------
  loadStatus: async function (container) {
    const wrap = container.querySelector('#bc-steps-wrap');
    if (!wrap) return;
    let data;
    try {
      data = await API.call('/api/batch/status');
    } catch (e) {
      // 后台轮询失败不打断页面，仅静默保留上一次显示
      return;
    }
    this.renderStatus(container, wrap, data);
  },

  renderStatus: function (container, wrap, data) {
    const current = data.current;
    const idle = !current && (!data.queueLen || data.queueLen === 0);
    if (idle) {
      wrap.innerHTML = `
        <div class="row-between" style="padding:8px 0">
          <span style="color:#909399">当前未在队列中</span>
          <button class="el-btn" id="bc-clear">清空进度</button>
        </div>`;
      wrap.querySelector('#bc-clear').onclick = async () => {
        try {
          const r = await API.call('/api/batch/clear', { method: 'POST' });
          App.toast(r.message || (r.cleared ? '进度已清空' : '当前仍有任务在队列中，无法清空'));
          this.loadStatus(container);
        } catch (e) { App.toast(e.message, 'error'); }
      };
      return;
    }

    const step = Number(current.step) || 1;
    const stepsHtml = this.STEP_LABELS.map((label, i) => {
      const k = i + 1;
      const cls = k < step ? 'done' : (k === step ? 'active' : 'pending');
      return `<div class="step ${cls}"><div class="dot">${k < step ? '✓' : k}</div><div class="lab">${App.esc(label)}</div></div>`;
    }).join('');
    wrap.innerHTML = `
      <div style="margin-bottom:8px;font-size:13px;color:#606266">
        批次 #${App.esc(current.id)} · ${App.esc(current.topic || '')} · 共 ${App.esc(current.messageCount)} 条 · 排队 ${App.esc(data.queueLen)} 个
        ${current.note ? ' · 备注：' + App.esc(current.note) : ''}
      </div>
      <div class="steps">${stepsHtml}</div>`;
  }
};
