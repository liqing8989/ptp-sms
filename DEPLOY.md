# PTP SMS 1.0 公网部署指南（Railway）

## 方案概述
用 Railway（PaaS 平台）部署，不用自己买服务器。
- 免费额度 $5/月（够测试用）
- 自动 HTTPS + 公网域名（xxx.up.railway.app）
- 支持持久化磁盘（SQLite 数据不丢）

## 第一步：注册 Railway
1. 打开 https://railway.app/
2. 点 "Start a New Project"
3. 用 GitHub 账号登录（需要先有 GitHub 账号）

## 第二步：把代码上传到 GitHub
1. 在 GitHub 新建一个私有仓库，名叫 `ptp-sms`
2. 把本项目文件夹里的所有文件（除了 node_modules 和 data 目录）上传到这个仓库
3. 确保 `package.json`、`server.js`、`lib/`、`public/`、`railway.json` 都在仓库根目录

## 第三步：在 Railway 创建项目
1. Railway 首页点 "New Project"
2. 选 "Deploy from GitHub repo"
3. 选择你刚建的 `ptp-sms` 仓库
4. Railway 会自动识别 Node.js 项目，自动 `npm install` 和启动

## 第四步：配置持久化磁盘（重要！）
SQLite 数据库文件在 `data/lvqing.db`，如果不挂持久化磁盘，每次重新部署数据会丢。
1. 在 Railway 项目页面，点你的服务
2. 点 "Variables" 旁边的 "Settings"
3. 找到 "Volumes" → 点 "New Volume"
4. 挂载路径填：`/app/data`
5. 保存，重启服务

## 第五步：拿到公网网址
1. 在服务页面点 "Settings" → "Networking"
2. 点 "Generate Domain"
3. Railway 会给你一个网址，类似 `ptp-sms-production.up.railway.app`
4. 打开这个网址，就能看到登录页了

## 第六步：配置环境变量（可选）
如果需要配置 Twilio 凭证，在 "Variables" 里加：
- `TWILIO_ACCOUNT_SID` = 你的 SID
- `TWILIO_AUTH_TOKEN` = 你的 Token
- `TWILIO_FROM_NUMBER` = 你的发件号码

或者直接在系统的「通道设置」页面里填（推荐）。

## 成本说明
- Railway 免费额度：$5/月（约 500 小时运行时间，够一个 24/7 跑的小应用）
- 超出后：$5/月起，按用量计费
- 域名：Railway 给的 `.up.railway.app` 是免费的
- 想要自己的域名（比如 `ptpsms.com`）：去 Namecheap/Cloudflare 买，约 $10/年，然后在 Railway 里绑定自定义域名

## 常见问题
- **数据会丢吗？** 只要配了持久化磁盘（第四步），就不会丢
- **HTTPS 吗？** 自动配好了，不用管
- **怎么更新代码？** 你 push 到 GitHub，Railway 自动重新部署
- **数据库在哪？** 在挂载的持久化磁盘里，路径 `/app/data/lvqing.db`

## 替代方案（如果 Railway 用不了）
1. **Render**（render.com）：类似 Railway，免费额度更慷慨，但冷启动会休眠
2. **Fly.io**（fly.io）：更接近 VPS 的体验
3. **买 VPS**（DigitalOcean/Vultr，$5/月）：完全可控，但需要自己配置 Nginx、PM2、HTTPS
