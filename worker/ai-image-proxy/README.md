# AI 生图入口 Worker（状态源与备用入口）

主入口是 `https://tingye-ai-image.pages.dev/`，由 `pages-gateway/` 的 Pages Function 提供。这个 Worker 负责保存当前隧道地址，并保留为 `workers.dev` 备用入口：

```text
https://tingye-ai-image.826t6km2n4.workers.dev
```

Worker 负责访问密码、Cookie、KV 中的隧道地址和反向代理；出图、队列、图片和 ComfyUI 仍在本机执行。

## 绑定

- KV：`TUNNEL_STATE`（保存 `{ url, updatedAt }`）
- Secrets：`GATE_PASSWORD`、`GATE_SECRET`、`ADMIN_TOKEN`
- 本地开发可选：`ALLOW_TEST_ORIGIN=1`，允许代理到 `http://127.0.0.1`，生产环境不要设置。

## 接口

| 接口 | 说明 |
| --- | --- |
| `GET /__gate` | 访问密码页面 |
| `POST /__gate` | 校验密码，写入 30 天签名的 `tingye_gate` Cookie |
| `GET /__health` | `{ ok, configured, updatedAt }`，不返回隧道地址 |
| `GET /__admin/tunnel` | 凭管理令牌读取当前隧道地址，供 Pages Function 使用 |
| `PUT /__admin/tunnel` | `Authorization: Bearer <ADMIN_TOKEN>`；写入或清空 quick tunnel |
| 其他路径 | 校验 Cookie 后代理到本机 `8787` |

管理接口示例：

```powershell
$token = (Get-Content .\worker-admin.token -Raw).Trim()
Invoke-RestMethod -Method Put `
  -Uri https://tingye-ai-image.826t6km2n4.workers.dev/__admin/tunnel `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType application/json `
  -Body '{"url":"https://example.trycloudflare.com"}'
```

只接受 `https://*.trycloudflare.com`，除非本地开发时设置了 `ALLOW_TEST_ORIGIN=1`。

## 本地测试

```powershell
npm install
node test/smoke.mjs
```

测试会启动本地 Wrangler、模拟上游和 15 项断言，覆盖密码门、Cookie、管理令牌、KV、GET/POST、上传体、图片和 503。

## 部署

```powershell
npx wrangler deploy
```

首次部署后，把 KV namespace id 写入 `wrangler.toml`，并在终端用 `wrangler secret bulk` 或 `wrangler secret put` 写入三个 Secrets。

不要把 `.dev.vars`、`.secret-bulk.json`、`worker-admin.token` 或 `worker-gate.txt` 提交到 Git。
