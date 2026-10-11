// 图片压缩工具：纯前端，FileReader + Image + canvas，二分法调 quality，超限逐级缩小画布
window.Pages = window.Pages || {};
window.Pages['/tool/compress'] = {
  title: '图片压缩工具',
  render: function (container) {
    container.innerHTML = `
      <div class="page-title">图片压缩工具</div>
      <div class="el-card">
        <div class="card-body">
          <div style="margin-bottom:14px">
            将图片压缩至
            <input class="el-input" id="cp-target" type="number" min="1" value="100" style="width:90px;display:inline-block;margin:0 6px">
            KB 以下
          </div>
          <div class="dropzone" id="cp-drop">
            <div class="big">⇪</div>
            <div class="tip">点击选择图片，或将图片拖拽到此处（支持多选，bmp / gif / jpg / jpeg / png）</div>
            <input type="file" id="cp-file" multiple accept=".bmp,.gif,.jpg,.jpeg,.png" style="display:none">
          </div>
        </div>
      </div>
      <div class="el-card">
        <div class="card-head">压缩结果</div>
        <div class="card-body" id="cp-list" style="text-align:center;color:#909399">尚未选择图片</div>
      </div>`;
    const dz = container.querySelector('#cp-drop');
    const input = container.querySelector('#cp-file');
    dz.onclick = () => input.click();
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
      const files = Array.prototype.slice.call(e.dataTransfer.files || []).filter((f) => /\.(bmp|gif|jpe?g|png)$/i.test(f.name));
      if (files.length) this.handleFiles(container, files);
    });
    input.onchange = () => {
      const files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length) this.handleFiles(container, files);
    };
  },
  targetKB: function (container) {
    const v = Number(container.querySelector('#cp-target').value);
    return v > 0 ? v : 100;
  },
  handleFiles: async function (container, files) {
    const list = container.querySelector('#cp-list');
    list.innerHTML = '';
    const targetKB = this.targetKB(container);
    for (const file of files) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0';
      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.esc(file.name)}</div>
          <div class="cp-meta" style="font-size:13px;color:#909399;margin-top:4px">原始 ${(file.size / 1024).toFixed(1)} KB　·　处理中...</div>
        </div>
        <button class="el-btn cp-btn" disabled>压缩中...</button>`;
      list.appendChild(row);
      const meta = row.querySelector('.cp-meta');
      const btn = row.querySelector('.cp-btn');
      try {
        const result = await this.compressFile(file, targetKB);
        const origKB = file.size / 1024;
        const newKB = result.blob.size / 1024;
        const ratio = origKB > 0 ? ((1 - result.blob.size / file.size) * 100).toFixed(1) : '0.0';
        const url = URL.createObjectURL(result.blob);
        const base = file.name.replace(/\.[^.]+$/, '');
        meta.innerHTML = `原始 ${origKB.toFixed(1)} KB　→　压缩后 ${newKB.toFixed(1)} KB　·　压缩率 ${ratio}%`;
        btn.removeAttribute('disabled');
        btn.textContent = '下载';
        btn.classList.add('el-btn--primary');
        btn.onclick = () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = base + '_compressed.jpg';
          document.body.appendChild(a);
          a.click();
          a.remove();
        };
      } catch (e) {
        meta.textContent = `原始 ${(file.size / 1024).toFixed(1)} KB　·　压缩失败：${e.message}`;
        btn.removeAttribute('disabled');
        btn.textContent = '失败';
        btn.classList.add('el-btn--danger');
      }
    }
  },
  compressFile: function (file, targetKB) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const img = new Image();
          img.onload = async () => resolve(await this.compressImage(img, targetKB));
          img.onerror = () => reject(new Error('图片解析失败'));
          img.src = reader.result;
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  },
  compressImage: async function (img, targetKB) {
    const targetBytes = targetKB * 1024;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let lastBlob = null;
    for (let round = 0; round < 10; round++) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // 二分法在 0.1 ~ 0.9 之间找满足目标大小的最高 quality
      let lo = 0.1, hi = 0.9, best = null;
      for (let i = 0; i < 8; i++) {
        const q = Math.round(((lo + hi) / 2) * 100) / 100;
        const blob = await this.toBlob(canvas, q);
        if (!blob) throw new Error('浏览器暂不支持图片压缩');
        lastBlob = blob;
        if (blob.size <= targetBytes) { best = blob; lo = q; }
        else { hi = q; }
      }
      if (best) return best;
      // 最低 quality 仍超限：逐级缩小画布重试
      w = Math.max(1, Math.floor(w * 0.9));
      h = Math.max(1, Math.floor(h * 0.9));
    }
    if (lastBlob) return lastBlob;
    throw new Error('压缩失败');
  },
  toBlob: function (canvas, q) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
  }
};
