# PTP SMS 1.0 短信营销群发管理后台（演示版）

基于 **Node.js + Express + Node 22 内置&#x20;**`node:sqlite` 的短信营销管理后台演示系统；前端为原生 HTML / CSS / JavaScript，**无构建步骤**，开箱即用。

## 环境要求



* Node.js **≥ 22.13**（使用内置 `node:sqlite`，Windows 下可直接运行，无需额外安装任何数据库服务）

* 操作系统：Windows（macOS / Linux 亦可运行）

## 启动方法



```
npm install
npm start
```

或直接双击项目根目录的 `start.bat`。

启动后访问：[http://localhost:3000/login](http://localhost:3000/login)

## 默认账号



| 账号    | 密码       | 说明                               |
| ----- | -------- | -------------------------------- |
| admin | admin123 | 管理员（is\_admin=1），可登录「余额记录」页给用户充值 |
| demo  | demo123  | 演示用户（普通账号）                       |
| agent | agent123 | 上级代理账号                           |

## 目录结构



| 路径               | 说明                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `server.js`      | Express 入口，路由挂载与静态服务                                                                                        |
| `lib/`           | 后端模块：`db.js`（sqlite）、`auth.js`（登录鉴权）、`queue.js`（发送队列，双模式）、`sensitive.js`（敏感词校验）、`filter.js`（号码检测规则）、`time.js`、`settings.js`（通道配置）、`twilio.js`（Twilio REST 封装）、`e164.js`（号码标准化） |
| `public/`        | 前端静态资源：`app.html`（SPA 外壳）、`css/style.css`、`js/app.js`（共享组件）、`js/api.js`（请求封装）、`js/pages/*.js`（页面）        |
| `data/lvqing.db` | sqlite 数据库文件（首次启动自动建表并写入演示数据）                                                                               |
| `SPEC.md`        | 前端页面开发规范（数据契约与组件 API）                                                                                       |

## 功能清单（9 个页面）



1. **首页&#x20;**`/index` — 今日 / 历史发送量、回复率等统计卡片与系统公告。

2. **聊天&#x20;**`/chat` — 会话列表（全部 / 有回复 / 未读），可查看对话并手动回复（每条 0.05 元计费）。

3. **批量发送&#x20;**`/batchchat` — 粘贴话术与号码，客户端校验后提交，队列异步推进发送进度。

4. **消息管理&#x20;**`/messagelist` — 全部收发消息按方向 / 类型 / 状态筛选检索，查看完整内容。

5. **号码检测&#x20;**`/phoneFilter` — 创建号码检测任务，统计有效 / 固话 / T / 虚拟 / 无效号码。

6. **批次统计&#x20;**`/messagegroup` — 各批次成功 / 失败 / 回复 / 过滤数量与回复率汇总。

7. **消费明细&#x20;**`/paydetail` — 扣费、退款、充值流水及余额统计。

8. **余额记录&#x20;**`/rechargelog` — 充值流水查询；管理员可弹窗给任意用户充值。

9. **图片压缩&#x20;**`/tool/compress` — 纯浏览器端图片压缩工具（canvas，不经过后端）。

10. **通道设置**`/settings`（仅管理员可见）— 配置 Twilio 真实通道凭证、测试连接、查看 webhook 回调地址。

## 关键机制说明



* **批量发送队列（双模式）**：提交批次 → 按 0.05 元 / 条预扣费 → 后端队列分 6 个阶段异步推进。**未配置 Twilio 凭证时为模拟模式**：按概率随机成功 / 失败并随机生成回复；**配置了 Twilio 凭证后自动切换为真实发送模式**：逐条调用 Twilio Messages API 下发，成功后把 MessageSid 存入消息记录，最终投递状态由 Twilio 回调异步更新。

* **退订处理**：用户回复 STOP / UNSUBSCRIBE（或"退订"）会被写入 `phone_opt_out` 表，后续对该号码的自动发送将被跳过并标记；回复 HELP 返回固定帮助文案。

* **号码 E.164 标准化**：提交时自动去除空格 / 横线；不带 `+` 的 10 位号码自动补 `+1`（美国号码）；已带 `+` 的号码保留 `+` 后仅留数字。真实模式下不符合 E.164（`+` 开头、10~15 位数字）的号码将被标记失败，不产生实际扣费动作之外的外发。

* **号码检测规则**：11 位且 `1[3-9]` 开头、且不属于虚拟号段（170/171/162/165/167/192）判定为有效手机号；`0` 开头 10–12 位判定为固话；T 开头与虚拟号段按无效处理。

* **内容审核开关**：提交批次时可开启违规词拦截，命中敏感词的内容将在服务端被拒绝。

## 对接 Twilio 真实通道（可选）

系统默认运行在**模拟模式**（不产生任何真实外发）。管理员在「通道设置」页填入三项凭证并保存后，自动切换为真实发送模式；清空凭证即回退模拟模式。

1. **获取凭证**：登录 [Twilio Console](https://console.twilio.com/) → 复制 **Account SID**（`AC` 开头）与 **Auth Token**。
2. **发件号码**：在 Phone Numbers 购买一个号码（生产环境建议申请 [10DLC](https://www.twilio.com/docs/messaging/10dlc) 注册），E.164 格式如 `+14155550100`，填入「Twilio 发件号码」。
3. **测试连接**：「通道设置」页点「测试连接」，系统以 Basic Auth（SID:Token）请求 `GET /2010-04-01/Accounts/{SID}.json`，返回成功即凭证有效。
4. **配置 webhook**（Twilio 控制台 → 号码 → Messaging）：
   - Status Callback 填：`<本服务公网地址>/api/twilio/status`
   - A Message Comes In 填：`<本服务公网地址>/api/twilio/inbound`
   - 本机调试可用 ngrok 把 `http://localhost:3000` 暴露为公网地址后再填入。
5. **行为说明**：真实模式逐条调用 `POST /2010-04-01/Accounts/{SID}/Messages.json`（form: To / From / Body），返回 sid 写入消息记录；回调把 queued / sent / delivered 记为成功，undelivered / failed 记为失败，失败原因在消息详情可查；命中退订表的号码自动跳过。**未引入 twilio npm 包**，REST 调用均用 Node 内置 `https`（`lib/twilio.js`），零原生依赖。

## 合规说明

* 本系统**默认仅为产品交互演示**，内置敏感词校验（涉政 / 涉黄 / 冒充公检法 / 欺诈类），违规内容一律拦截。

* **默认未接入任何真实短信服务商通道**，发送、回调与回复均为本地模拟逻辑；仅在「通道设置」页填入真实 Twilio 凭证后才会切换为真实发送。

* 接入真实通道后，请自行确保已完成 10DLC / 当地法规的注册义务；退订（STOP）与帮助（HELP）处理已内置。

## 常见问题



* **端口被占用**：默认监听 3000 端口，启动前设置环境变量 `PORT` 后再启动即可，例如 Windows PowerShell：



```
$env:PORT=8080; npm start
```

随后访问 [http://localhost:8080/login](http://localhost:8080/login)。