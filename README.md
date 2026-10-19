# 庭野智作 · 个人 AI 工作平台门户 V1.1

一个面向 Windows + Codex + ComfyUI 工作环境的个人 AI 门户。门户本体仍是静态站点；AI 生图专项通过受保护的 Cloudflare Worker 入口连接本机工作台，门户不执行本地命令，也不读取真实服务状态。

网站使用纯 HTML、CSS 和 JavaScript 编写，无运行时依赖，可部署到 GitHub + Cloudflare Pages。

## 线上地址

- 正式站点：<https://tingye-portal.pages.dev/>
- GitHub 仓库：<https://github.com/zbbxhl-max/tingye-portal>

生产分支为 `main`。推送到 `main` 后，Cloudflare Pages 会自动执行 `npm run build` 并发布 `dist/`。

## 已实现内容

- 中文优先、响应式布局，适配桌面、平板和手机。
- 六个完整模块：首页、庭院设计、作品展示、AI 工具、工作流、系统状态。
- AI 生图专项专题页：项目定位、能力数据、五步工作流、界面与公共预设前后对比。
- AI 工具页、首页工具快照和工作流页均提供 AI 生图入口。
- 深色技术驾驶舱视觉，结合景观等高线、场地边界和建筑制图元素。
- 统一工具链接注册表，支持浏览器本地配置和恢复默认值。
- 未配置链接明确显示“尚未配置”，不会产生可点击的错误地址。
- 链接只接受 `http://` 和 `https://`，拒绝本机路径、UNC 路径和危险协议。
- 识别 localhost、局域网 IP 和 `.local` 地址，并提示仅对应设备或同一网络可访问。
- 六张本地 SVG 概念作品图和分类筛选交互。
- 系统状态页明确标注“静态展示，非实时监控”。
- Cloudflare `_headers` 安全响应头。
- Cloudflare Worker 固定入口：Worker 访问密码 + 出图应用口令，自动同步 quick tunnel 地址。

## 目录结构

```text
.
├─ src/                          # 需要发布的静态源码
│  ├─ index.html                 # 首页
│  ├─ garden.html                # 庭院设计
│  ├─ works.html                 # 作品展示
│  ├─ tools.html                 # AI 工具
│  ├─ workflows.html             # 工作流
│  ├─ ai-image.html              # AI 生图专项
│  ├─ status.html                # 系统状态
│  ├─ 404.html                   # 自定义 404
│  ├─ robots.txt
│  ├─ _headers                   # Cloudflare Pages 响应头
│  └─ assets/
│     ├─ css/main.css
│     ├─ js/config.js            # 站点与链接默认配置
│     ├─ js/app.js               # 导航、链接配置、筛选等交互
│     └─ images/                 # 本地图标、概念作品图与 AI 生图截图
├─ worker/ai-image-proxy/        # Cloudflare Worker 网关（不进入 Pages 构建）
│  ├─ src/index.js               # 密码门、KV、代理与错误页
│  ├─ test/smoke.mjs             # 本地网关测试
│  └─ wrangler.toml
├─ scripts/
│  ├─ serve.mjs                  # 无依赖本地静态服务器
│  ├─ verify.mjs                 # 静态检查
│  └─ build.mjs                  # 生成 dist/
├─ package.json
└─ README.md
```

`dist/` 是构建产物，已加入 `.gitignore`，不需要提交到 Git。

## 环境要求

- Node.js 18 或更高版本。
- 无需安装 npm 依赖。
- 本地预览只监听 `127.0.0.1`，不会自动暴露到局域网或公网。

## 本地预览

在项目根目录运行：

```powershell
npm run dev
```

然后访问：

```text
http://127.0.0.1:4173
```

如果端口被占用，可以直接指定其他端口：

```powershell
npm run dev -- --port 4180
```

浏览器设备模拟可以检查手机和平板布局。默认服务器不监听局域网地址。若确需在可信局域网内检查手机访问，必须显式设置监听地址，并在检查结束后关闭服务：

```powershell
$env:PORTAL_HOST = "0.0.0.0"
npm run dev
```

不要在不可信网络中使用上述方式，也不要将开发服务器端口映射到公网。

## 构建与检查

运行静态检查：

```powershell
npm run verify
```

检查内容包括：

- 必需页面、样式、脚本、图片和 `_headers` 是否存在。
- 内部链接和资源引用是否有效。
- 页面标题、viewport、统一页头页脚和配置入口是否完整。
- 是否出现重复 `id`、缺少 `alt`、内联脚本、内联样式或内联事件。
- 默认链接是否为安全的 HTTP(S) 地址。
- 是否出现疑似密钥、密码、`file://`、Windows 绝对路径或 UNC 路径。

生成 Cloudflare Pages 发布目录：

```powershell
npm run build
```

构建时会先执行同一套检查，再清空并重新生成 `dist/`。随后可预览发布产物：

```powershell
npm run preview
```

访问：

```text
http://127.0.0.1:4174
```

## 修改默认链接

编辑 [`src/assets/js/config.js`](src/assets/js/config.js) 中的 `SITE_CONFIG.links`。

每个入口包含：

- `id`：页面卡片使用的固定标识，修改时需同步 HTML 中的 `data-link-card`。
- `group`：配置窗口中的分组，目前为 `ai-tools` 或 `project-resources`。
- `title`：工具名称。
- `kicker`：英文小标签。
- `description`：入口说明。
- `actionLabel`：已配置时的按钮文字。
- `defaultUrl`：默认公开地址；留空表示“尚未配置”。

专题页按钮使用 `data-link-entry="ai-image"`，会自动读取同一份链接配置。

当前默认值：

- AI 生图专项：`https://tingye-ai-image.826t6km2n4.workers.dev/`
- Codex：`https://chatgpt.com/codex`
- ComfyUI、个人知识库、项目档案、项目资料、场地研究、案例参考：留空

不要把 API Key、密码、访问令牌或私人文件路径写入配置文件。

## 在浏览器中配置链接

点击任意页面顶部或底部的“配置链接”按钮：

1. 输入完整的 `http://` 或 `https://` 地址。
2. 点击“保存到本机”。
3. 设置保存在当前浏览器的 `localStorage` 中，键名是 `tingye-portal.link-overrides.v1`。

注意事项：

- 同一站点在电脑和手机上拥有各自独立的链接配置。
- 设置不会写入 Git，也不会自动同步到其他设备。
- 点击“恢复默认”会清除当前浏览器的覆盖值。
- 清除该站点的浏览器站点数据，也会恢复默认配置。
- localhost、`127.0.0.1`、局域网私有 IP 和 `.local` 地址会显示本机/局域网提示。
- 从 HTTPS 门户打开 HTTP 地址时，浏览器可能显示安全提示。
- 本功能只保存 URL，不保存登录状态、Cookie 或任何密钥。

## 替换作品内容

作品卡片位于 `src/works.html`。每张卡片使用一个 `data-category` 值参与筛选：

- `garden`
- `landscape`
- `architecture`
- `research`

替换图片时，建议保留 4:3 画幅和 `width="1200" height="900"`：

1. 将新图片放入 `src/assets/images/works/`。
2. 更新卡片的 `src`。
3. 同步修改 `alt`，描述图片实际展示内容。
4. 更新作品名、年份、说明和标签。
5. 删除“概念占位”标识或将其替换为正式项目状态。

当前所有作品名称和图片均为内容结构示例，不应作为已完成项目宣传。

## GitHub 上传

项目已关联 GitHub 仓库 `zbbxhl-max/tingye-portal`，本地 `main` 跟踪 `origin/main`。

如需在新设备重新克隆：

```powershell
git clone https://github.com/zbbxhl-max/tingye-portal.git
cd tingye-portal
```

推送前建议再次确认：

```powershell
git status
npm run verify
```

不要提交 `dist/`、浏览器导出文件、账号截图、知识库副本或任何访问凭据。

## Cloudflare Pages 部署

### 当前配置

Cloudflare Pages 项目 `tingye-portal` 已连接 GitHub 仓库，首次部署已完成。构建配置如下：

```text
项目名称：tingye-portal
生产分支：main
Framework preset：None
Build command：npm run build
Build output directory：dist
Root directory：/
```

构建环境使用 Node.js 22.16.0 和 npm 10.9.2，无需额外环境变量。如日后更换构建镜像，可增加 `NODE_VERSION=20` 固定版本。

`src/_headers` 会随构建进入 `dist/_headers`，由 Cloudflare Pages 自动应用 CSP 和安全响应头。

如需从零重建项目：登录 Cloudflare Dashboard，进入 **Workers & Pages**，选择 **Create application**，使用旧版 **Pages** 流程连接 Git 仓库，并填写上面的构建配置。

### 后续更新

修改并提交到 `main` 分支后，Cloudflare Pages 会自动重新构建和部署。

### 自定义域名

在 Pages 项目的 **Custom domains** 中添加域名，并按 Cloudflare 提示完成 DNS 配置。V1 不依赖特定域名，因此代码中未写死正式站点地址。

### 命令行部署（可选）

Cloudflare 控制台连接 Git 已能满足自动部署。如临时需要命令行上传，可在构建后执行：

```powershell
npx wrangler pages deploy dist --project-name tingye-portal
```

首次使用需要登录 Cloudflare，并拥有相应 Pages 项目权限。

## AI 生图专项与固定入口

专题页：<https://tingye-portal.pages.dev/ai-image.html>

工作台固定入口：<https://tingye-ai-image.826t6km2n4.workers.dev/>

完整链路：

```text
浏览器
  → tingye-ai-image.826t6km2n4.workers.dev
  → Cloudflare Worker（访问密码 + 签名 Cookie）
  → quick tunnel（每次启动自动更新）
  → 本机 http://127.0.0.1:8787
  → 本机 ComfyUI http://127.0.0.1:8000
```

Worker 源码在 `worker/ai-image-proxy/`，不进入 `src/` 或 `dist/`。它使用 KV `TUNNEL_STATE` 保存当前 quick tunnel 地址，并通过以下接口工作：

- `GET/POST /__gate`：Worker 访问密码与 30 天签名 Cookie。
- `GET /__health`：返回是否已配置隧道，不暴露隧道地址。
- `PUT /__admin/tunnel`：凭管理令牌更新或清空隧道地址。
- 其余请求：校验 Cookie 后代理到本机工作台，包括登录、上传、任务轮询、图片和 PWA 资源。

本机脚本：

- `D:\AI生图专项\网页\启动公网工作台.vbs`：启动网页、等待 8787、启动隧道、发布地址并打开固定入口。
- `D:\AI生图专项\网页\停止公网工作台.vbs`：关闭隧道并通知 Worker 清空地址。
- `D:\AI生图专项\网页\tools\remote.ps1`：检测 quick tunnel，调用 Worker 管理接口并轮询 `/__health`。
- `D:\AI生图专项\网页\tools\worker-public.json`：Worker 地址与管理令牌文件名。
- `D:\AI生图专项\网页\tools\worker-gate.txt` 和 `worker-admin.token`：只保存在本机的访问密码与管理令牌，不提交到 Git。

Worker 部署：

```powershell
cd worker\ai-image-proxy
npm install
npx wrangler deploy
```

Worker Secrets 为 `GATE_PASSWORD`、`GATE_SECRET`、`ADMIN_TOKEN`。修改密码后需同时轮换 `GATE_SECRET`，让旧 Cookie 立即失效。本地测试运行：

```powershell
node test/smoke.mjs
```

`workers.dev` 不提供 Cloudflare Access 邮箱验证，因此当前采用 Worker 密码 + 出图应用口令两层保护。若以后接入自己的域名，可在 Worker 前增加 Cloudflare Access。

## 安全边界

V1.1 明确不提供：

- Windows 远程桌面或公网远程控制。
- ComfyUI 公网监听、端口修改或启动控制。
- 私人知识库整库复制到公开仓库。
- 前端长期 API Key、密码或访问令牌。
- 未经身份验证的远程 AI 执行接口；AI 生图入口必须通过 Worker 密码和应用口令。
- ComfyUI、Windows 或任何服务的实时健康监控。

发布前请检查：

- 工具 URL 和资料 URL 是否具有合适的访问控制。
- 知识库、云盘和项目档案是否允许公开访问。
- 作品图片与案例文字是否拥有发布权限。
- 是否误将局域网地址当作所有设备都能访问的地址。
- GitHub 历史中是否曾提交过秘密信息。

## 已知边界与后续建议

门户本体不包含数据库、任务队列和服务监控；AI 生图专项的执行、队列和登录由独立的本机服务负责。后续接入建议按以下顺序推进：

1. 先建立受身份验证保护的局域网或 VPN 访问层。
2. 为 ComfyUI 设计独立网关，不在前端直接保存访问凭据。
3. 将知识库和项目档案接入权限可控的云空间。
4. 为工作流增加任务状态、日志、超时和失败重试机制。
5. 任何远程控制能力都应经过授权、审计和最小权限设计。

在完成这些工作前，系统状态页将继续保持静态，不显示虚构的在线或运行状态。
