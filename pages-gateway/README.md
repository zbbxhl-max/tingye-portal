# AI 生图 Pages Functions 入口

这个目录部署为独立的 Cloudflare Pages 项目，用 `pages.dev` 上的固定地址代理本机出图工作台，绕开部分网络对 `workers.dev` 的拦截。

架构：

```text
浏览器
  → https://tingye-ai-image.pages.dev
  → Pages Function（密码门）
  → Worker 管理接口读取当前 quick tunnel
  → 本机 http://127.0.0.1:8787
```

## 部署

在 Cloudflare 账户中创建 Pages 项目 `tingye-ai-image`，然后：

```powershell
cd pages-gateway
npx wrangler pages deploy public --project-name tingye-ai-image --branch main
```

`wrangler` 会自动打包 `functions/` 目录。

## 项目 Secrets

在 Pages 项目的 Settings → Environment variables / Secrets 中设置：

- `GATE_PASSWORD`：与 Worker 相同的访问密码。
- `GATE_SECRET`：与 Worker 相同的签名密钥。
- `ADMIN_TOKEN`：Worker 管理令牌，用于读取当前隧道地址。

不要把这些值提交到 Git。

## 工作方式

- 隧道地址仍由 `D:\AI生图专项\网页\tools\remote.ps1` 发布到 Worker 的 KV。
- Pages Function 每次请求通过 Worker 的受保护管理接口读取地址，缓存 30 秒。
- 入口密码、Cookie、代理和错误页与 Worker 版本保持一致。
- Worker 地址保留为备用入口和管理状态源。
