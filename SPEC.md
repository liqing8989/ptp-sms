# PTP SMS 1.0 —— 前端页面开发规范（SPEC）

> 本文件是并行子代理编写页面的唯一模式基准。所有页面必须严格遵循本规范，
> 已实现页面可参考 `public/js/pages/index.js` 与 `public/js/pages/chat.js`。

## 1. 项目结构（只读信息）

- 项目根目录：`C:\Users\admin\Doubao\chats\2026-10-11\new-chat-1\lvqing-sms`
- 后端：`server.js` + `lib/*.js`（Express + node:sqlite，**已完成，请勿修改**）
- 前端静态目录：`public/`
  - `public/app.html`：SPA 外壳（**已含全部 9 个页面的 script 标签，请勿修改**）
  - `public/css/style.css`：全局样式（**已覆盖所有用到的类，请勿修改**）
  - `public/js/api.js`：`API.call(path, opts)` 请求封装（**请勿修改**）
  - `public/js/app.js`：外壳与共享组件（**请勿修改**）
  - `public/js/pages/<page>.js`：**你的工作区，只写这里**
- 服务已运行在 `http://localhost:3000`，测试登录：`admin / admin123`。

## 2. 页面注册模式（必须遵守）

每个页面文件是一个自执行模块，挂到全局 `window.Pages`：

```js
window.Pages = window.Pages || {};
window.Pages['/messagelist'] = {
  title: '消息管理',
  state: { page: 1, size: 10, filters: {} },   // 页面内部状态（可选）
  render: function (container) { /* 首次渲染：骨架 + 发起数据加载 */ }
};
```

- `render(container)` 由外壳调用，`container` 是 `.content` 内的挂载点 div。
- **不要在 render 内用 async 直接拼接等待**：先渲染"加载中"骨架，再 `await API.call(...)` 填充（参考 index.js / chat.js）。
- 不要改 `location.pathname`、不要 pushState；侧边栏导航由外壳处理。
- 页面之间互不依赖；每个页面自行管理自己的 state。

## 3. 共享组件 API（来自 window.App，已实现）

| 组件 | 签名 | 说明 |
|---|---|---|
| `App.esc(s)` | 字符串转义 | 所有动态文本必须经过 esc 再入 HTML |
| `App.icon(name)` | 返回 SVG 字符串 | 可用名：home/chat/send/inbox/shield/chart/card/wallet/compress/logo |
| `App.toast(msg, type)` | type: success/error/warning/info | 顶部轻提示 |
| `App.modal({title, body, okText, onOk, showCancel, large})` | 弹窗 | onOk 返回 false 则不关闭 |
| `App.confirm(msg)` | Promise&lt;boolean&gt; | 二次确认 |
| `App.renderTable(container, columns, rows, emptyText)` | 表格 | columns: `[{key,label,width,render(row)}]`，render 返回 HTML |
| `App.pagination(container, {total,page,size,onChange})` | 分页 | onChange(p) 回传新页码 |
| `App.filterBar(container, items, {onSearch,onReset})` | 筛选栏 | items: `[{type:'select'|'input', key, label, options, placeholder, width}]`；onSearch(values) 收到 key→值 |
| `App.tag(text)` | 彩色标签 | 已内置映射：success/fail/pending/completed/submitted/sending/发送/接收/成功/失败/待发送/批量发送/单条发送/系统退款/充值/手动上传 等 |
| `App.batchStatus(code)` | {text, html} | 批次状态中文名 + 标签 HTML |
| `App.STATUS_TEXT` | dict | submitted:已提交 / accepted:已接受 / sending:发送中 / sent_to_provider:已给运营商 / waiting_callback:等待回调 / completed:已完成 |
| `App.DIR_TEXT` | dict | send:发送 / receive:接收 |
| `App.MSG_STATUS_TEXT` | dict | pending:待发送 / success:成功 / fail:失败 |
| `App.TYPE_TEXT` | dict | batch:批量 / single:单条 |
| `App.fmt.money(n)` / `App.fmt.time(s)` / `App.fmt.dt(s)` | 格式化 | money 固定 2 位小数 |
| `App.refreshUser()` | async | 刷新顶栏账号余额（**任何引起余额变化的操作后必须调用**） |
| `App.esc` 同 `App.esc` | | |

请求统一走 `API.call(path, {method:'POST', body: JSON.stringify({...})})`，
GET 带查询参数直接拼 URL。所有接口返回 `{code:0, data}`；失败抛 `Error(message)`，
用 `try/catch` 接住后 `App.toast(e.message,'error')`。

## 4. 数据契约（后端已完成，字段以此为准）

统一分页参数 `page`（从 1 起）、`size`（每页 10，本系统所有表格固定每页 10 条）。
列表响应均为 `{ total, list }`。

### 4.1 批量发送 /batchchat
- `GET /api/meta` → `{price:0.05, min_content:50, min_numbers:150, max_numbers:1000}`
- `GET /api/batch/status` → `{queueLen, current, stages}`
  - `current`：`{id, topic, note, status, messageCount, step}` 或 `null`；`step` 为 1-6
  - 步骤含义（步骤条 6 步）：1 消息提交中 / 2 已提交 / 3 消息发送中 / 4 已发送给运营商 / 5 等待回调中 / 6 已收到回调
  - `queueLen===0 && current===null` → 页面显示「当前未在队列中」
- `POST /api/batch/clear` → `{ok, cleared, message}`（清空进度显示）
- `POST /api/batch/submit`，body：
  ```json
  { "contentLines": "短信1\n短信2\n...", "numbers": "138xxxx\n...", "topic": "话术主题", "note": "备注", "needReview": true, "needFilter": true }
  ```
  - 服务端校验：内容去重后 ≥ 50 条；有效号码 150~1000；内容审核（违规词命中返回错误信息）；余额不足返回错误。
  - 成功返回 `{batch_id, message_count, valid_count, filter_count, cost, balance, queue_len}`
- 提交后余额已扣减，页面应 **轮询 `GET /api/batch/status`（建议每 2 秒）** 显示步骤条推进；余额变化后调 `App.refreshUser()`。
- 客户端校验规则（与服务端一致，提交前先拦截并 toast 提示）：
  - 内容按行去重后 ≥ 50 条，实时显示「当前 N 条，要求 ≥ 50」
  - 号码按行统计有效数量（规则见 4.5），实时显示「有效 N 个，要求 150 ~ 1000」
- 表单控件：内容 `textarea.el-textarea`、号码 `textarea.el-textarea`、话术主题 `select.el-select`（选项自拟，如：产品推广/活动通知/会员关怀/温馨提示/其他）、备注 `input.el-input`、号码检测开关（`label.switch > input[type=checkbox] + span.track`，默认开）、按钮「重置内容」（清空两个 textarea）。

### 4.2 消息管理 /messagelist
- `GET /api/messages?direction=&type=&status=&search=&page=&size=`
  - direction: send/receive；type: batch/single；status: pending/success/fail；search 按内容模糊
- 表格列（顺序固定）：用户账号、发送号码、接收号码、消息内容、消息方向、发送类型、提交状态、发送时间、操作
  - 方向用 `App.tag(App.DIR_TEXT[行.direction])`；类型用 `App.tag(App.TYPE_TEXT[行.type])`；状态用 `App.tag(App.MSG_STATUS_TEXT[行.status])`
  - 发送时间显示完整 `created_at`；操作列放「查看」按钮 → 弹窗显示完整内容（App.modal）
- 筛选栏：消息方向（发送/接收）、发送类型（单条/批量）、提交状态（成功/失败/待发送）+ 搜索 + 重置

### 4.3 号码检测 /phoneFilter
- `POST /api/phone-filter/tasks`，body `{numbers:"多行号码", source:"手动上传|导入文件", note}`
  - 返回 `{task_id, total, valid, t_voip_count, invalid}`
- `GET /api/phone-filter/tasks?status=&source=&search=&page=&size=` → `{total, list:[{id,total,valid,t_voip_count,status,source,note,created_at}]}`
- `GET /api/phone-filter/tasks/:id` → `{task, result}`，`result={valid:[号码数组], filtered:[{num,kind}], invalidCount}`
- 检测规则（演示，前端提示文案可引用）：11 位且 `1[3-9]` 开头且非虚拟号段(170/171/162/165/167/192)为有效；0 开头 10-12 位为固话；其余无效。
- 表格列：号码总数、有效数量、T/固/虚拟数量、备注、状态、来源、创建时间、操作（操作=查看详情弹窗，展示 total/valid/t_voip_count/invalidCount 与有效号码示例列表）
- 顶部「创建号码检测任务」按钮 → 弹窗表单（多行号码 textarea、来源 select、备注 input）→ 提交后刷新列表

### 4.4 批次统计 /messagegroup
- `GET /api/batches?status=&search=&page=&size=` → `{total, list:[{id, username, topic, status, message_count, valid_count, success_count, fail_count, reply_count, reply_rate, filter_count, need_filter, note, created_at}]}`
- `POST /api/batches/stat-reply` → `{updated, message}`（统计回复数量）
- `POST /api/batches/stat-filter` → `{updated, message}`（统计过滤数量）
- `GET /api/batches/:id/detail?page=&size=` → `{batch, total, list:[消息...]}`
- 顶部两个统计入口按钮「统计回复数量」「统计过滤数量」+ 状态筛选（已完成/发送中/等待回调/已提交 等，对应 STATUS_TEXT）+ 搜索 + 重置
- 表格列：用户账号、消息总数、成功数、失败数、回复数、首条回复率(%)、T/固/虚拟过滤数量、完成状态、备注、创建时间、操作（详情=弹窗展示批次信息 + 消息分页列表）
- 完成状态用 `App.batchStatus(行.status).html`

### 4.5 消费明细 /paydetail
- `GET /api/paydetails?type=&search=&page=&size=` → `{total, list:[{id, username, type, amount, balance_before, balance_after, note, created_at}]}`
  - type 值：批量发送 / 单条发送 / 系统退款 / 充值（筛选下拉用这四个）
  - amount 正负按类型（退款/充值为正，发送为负）；用 `App.fmt.money`，负数标红 class="text-red"
- `GET /api/paydetails/sum` → `{balance, consumed, recharged}`
- 顶部「统计余额」按钮 → 弹窗展示：当前余额 / 累计消费 / 累计充值
- 表格列：用户账号、消费类型、余额、消费前余额、消费后余额、备注、创建时间

### 4.6 余额记录 /rechargelog
- `GET /api/recharges?type=&search=&page=&size=` → `{total, list:[{id, upper_name, target_name, type, amount, package_name, note, created_at}]}`
- `POST /api/recharges/admin`（仅管理员 admin 可用；普通用户调用返回 403）body：
  ```json
  { "username": "demo", "amount": 100, "package_name": "基础套餐", "note": "测试充值" }
  ```
  → `{username, amount, balance}`
- 表格列：上级用户、收款方、类型、余额、套餐名称、备注、充值时间
- 管理员（当前用户 `is_admin===1`）额外显示「给用户充值」按钮 → 弹窗表单（账号、金额、套餐 select、备注）→ 提交后刷新列表 + `App.refreshUser()`；非管理员不显示该按钮。

### 4.7 图片压缩 /tool/compress（纯前端，无接口）
- 标题「图片压缩工具」+ 输入「将图片压缩至 ___ KB以下」（数字输入，默认 100）
- 拖拽/点击上传区域（`div.dropzone`，支持 input[type=file] multiple + dragover/drop），accept: bmp/gif/jpg/jpeg/png
- 实现：canvas 绘制 → 循环 `canvas.toBlob('image/jpeg', quality)` 二分法压缩到目标 KB 以下（若 jpeg 仍超限则逐级缩小画布尺寸重试），生成下载链接（a[download]，文件名加 `_compressed` 后缀）
- 每张图显示：原文件名、原始大小、压缩后大小、压缩率、下载按钮；支持多选批量处理
- 图片压缩不涉及后端，纯浏览器端执行，无合规风险。

## 5. 视觉与结构约定

- 页面顶层结构：先渲染骨架（el-card 内「加载中」），数据到位后填充。
- 筛选/按钮区：包在 `div.el-card > div.card-body` 中，用 `div.filter-bar`（组件已生成）；顶部操作按钮放页面标题右侧（`div.row-between` + `div.page-title`）。
- 表格：`App.renderTable` 生成（勿手写 table）。
- 所有颜色/圆角/间距只用 style.css 中已定义的类（el-*、stat-card、badge、chat-*、dropzone、steps 等），**不要新增内联大段样式**（个别内联 width/margin 允许）。
- 品牌名一律「PTP」，标题栏文本用「PTP SMS 1.0」；任何地方不得出现「南夏」「star」等字样。
- 文案合规：不得出现诈骗/赌博/色情/冒充类示例文案；批量发送页提示语使用规范营销示例（如产品推广、活动通知、会员关怀）。

## 6. 交付要求（每个页面完成后必须自查）

1. 文件写入 `public/js/pages/<对应文件名>.js`，页面路径与菜单一致（见各节标题）。
2. 用 PowerShell 运行 `node --check public/js/pages/<文件名>.js` 确认无语法错误（node 已安装）。
3. 自查清单：
   - [ ] 真实调用接口（不是写死假数据），失败有 toast
   - [ ] 表格每页 10 条、分页可用、筛选与重置可用、搜索可用
   - [ ] 所有动态文本经过 `App.esc`
   - [ ] 引起余额变化的操作后调用 `App.refreshUser()`
   - [ ] 未修改 app.html / app.js / api.js / style.css / server.js / lib/*
4. 完成后在最终回复里报告：文件绝对路径、node --check 结果、每项自查清单的打勾结果、页面使用的接口清单。
