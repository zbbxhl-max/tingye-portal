const COOKIE_NAME = "tingye_gate";
const COOKIE_VERSION = "v1";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const KV_KEY = "origin";
const GATE_PATH = "/__gate";
const HEALTH_PATH = "/__health";
const ADMIN_PATH = "/__admin/tunnel";
const PORTAL_PAGE = "https://tingye-portal.pages.dev/ai-image.html";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === ADMIN_PATH) return handleAdmin(request, env);
    if (url.pathname === HEALTH_PATH) return handleHealth(env);
    if (url.pathname === GATE_PATH) return handleGate(request, env, url);
    if (url.pathname === "/__logout") return handleLogout(request);

    if (!(await hasValidGateCookie(request, env))) {
      if (url.pathname.startsWith("/api/")) {
        return json({ error: "gate_required" }, 401);
      }
      return gatePage(request, url, 401);
    }

    return proxyRequest(request, env, url);
  }
};

async function handleAdmin(request, env) {
  if (request.method === "GET") {
    const authorization = request.headers.get("Authorization") || "";
    const expected = `Bearer ${env.ADMIN_TOKEN || ""}`;
    if (!env.ADMIN_TOKEN || !timingSafeEqual(authorization, expected)) {
      return json({ error: "unauthorized" }, 401);
    }
    const record = await readTunnelRecord(env);
    return json({
      ok: true,
      configured: Boolean(record?.url),
      url: record?.url || null,
      updatedAt: record?.updatedAt || null
    });
  }

  if (request.method !== "PUT" && request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { Allow: "GET, PUT" });
  }

  const authorization = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.ADMIN_TOKEN || ""}`;
  if (!env.ADMIN_TOKEN || !timingSafeEqual(authorization, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body?.url === null || body?.url === "") {
    await env.TUNNEL_STATE.delete(KV_KEY);
    return json({ ok: true, configured: false });
  }

  if (typeof body?.url !== "string" || !isQuickTunnelUrl(body.url, env)) {
    return json({ error: "invalid_tunnel_url" }, 400);
  }

  const record = {
    url: body.url.replace(/\/+$/, ""),
    updatedAt: new Date().toISOString()
  };
  await env.TUNNEL_STATE.put(KV_KEY, JSON.stringify(record));
  return json({ ok: true, configured: true, updatedAt: record.updatedAt });
}

async function handleHealth(env) {
  const record = await readTunnelRecord(env);
  return json(
    {
      ok: true,
      configured: Boolean(record?.url),
      updatedAt: record?.updatedAt || null
    },
    200,
    { "Cache-Control": "no-store" }
  );
}

async function handleGate(request, env, url) {
  if (request.method === "GET") {
    return gatePage(request, url, 200);
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return gatePage(request, url, 400, "请求格式无效。");
  }

  const submitted = String(form.get("password") || "");
  if (!env.GATE_PASSWORD || !timingSafeEqual(submitted, env.GATE_PASSWORD)) {
    return gatePage(request, url, 401, "访问密码不正确。");
  }

  const next = safeNextPath(String(form.get("next") || "/"));
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const signature = await signExpiry(expires, env.GATE_SECRET);
  const cookie = [
    `${COOKIE_NAME}=${COOKIE_VERSION}.${expires}.${signature}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");

  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex"
    }
  });
}

function handleLogout(request) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(GATE_PATH, url.origin).toString(),
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store"
    }
  });
}

async function proxyRequest(request, env, url) {
  const record = await readTunnelRecord(env);
  if (!record?.url) {
    return errorPage(
      503,
      "工作台未启动",
      "本机出图服务或隧道当前没有上线。启动“启动公网工作台”后，这个固定地址会自动恢复。",
      { "Retry-After": "60" }
    );
  }

  let target;
  try {
    target = new URL(record.url);
    target.pathname = url.pathname;
    target.search = url.search;
  } catch {
    return errorPage(503, "入口配置失效", "当前隧道地址格式无效，请重新启动公网工作台。");
  }

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower.startsWith("cf-") || lower.startsWith("x-forwarded-") || HOP_BY_HOP.has(lower)) {
      continue;
    }
    headers.set(name, value);
  }

  let upstream;
  try {
    upstream = await fetch(
      new Request(target.toString(), {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
        signal: AbortSignal.timeout(120000)
      })
    );
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return errorPage(504, "出图服务响应超时", "本机工作台仍在运行，但这次请求超过 120 秒。请稍后重试。");
    }
    return errorPage(502, "无法连接本机工作台", "隧道可能已经断开，或本机服务没有启动。");
  }

  const responseHeaders = new Headers();
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (lower === "set-cookie" || lower === "content-encoding" || lower === "content-length" || HOP_BY_HOP.has(lower)) {
      continue;
    }
    responseHeaders.set(name, value);
  }

  const setCookies = typeof upstream.headers.getSetCookie === "function"
    ? upstream.headers.getSetCookie()
    : [];
  for (const cookie of setCookies) {
    responseHeaders.append("Set-Cookie", cookie);
  }

  const location = responseHeaders.get("Location");
  if (location && location.startsWith(record.url)) {
    responseHeaders.set("Location", location.slice(record.url.length) || "/");
  }

  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  responseHeaders.set("X-Frame-Options", "DENY");
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");
  if (url.pathname.startsWith("/api/")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

async function readTunnelRecord(env) {
  const raw = await env.TUNNEL_STATE.get(KV_KEY, { cacheTtl: 60 });
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return record && typeof record.url === "string" ? record : null;
  } catch {
    return null;
  }
}

async function hasValidGateCookie(request, env) {
  if (!env.GATE_SECRET) return false;
  const raw = parseCookies(request.headers.get("Cookie") || "")[COOKIE_NAME];
  if (!raw) return false;

  const [version, expiryText, signature] = raw.split(".");
  if (version !== COOKIE_VERSION || !signature) return false;

  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false;

  const expected = await signExpiry(expiryText, env.GATE_SECRET);
  return timingSafeEqual(signature, expected);
}

async function signExpiry(value, secret) {
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseCookies(header) {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function safeNextPath(value) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function isQuickTunnelUrl(value, env = null) {
  try {
    const parsed = new URL(value);
    if (
      env?.ALLOW_TEST_ORIGIN === "1" &&
      parsed.protocol === "http:" &&
      parsed.hostname === "127.0.0.1"
    ) {
      return true;
    }
    return (
      parsed.protocol === "https:" &&
      /^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...extraHeaders
    }
  });
}

function gatePage(request, url, status, error = "") {
  const next = safeNextPath(url.pathname + url.search);
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>AI 生图专项 · 访问验证</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#07100e;color:#dbe7dc;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
main{width:min(100%,430px);padding:34px;background:linear-gradient(150deg,rgba(255,255,255,.04),transparent 60%),#101d19;border:1px solid rgba(183,212,169,.24);border-radius:14px}
.eyebrow{color:#8fa78d;font-family:Consolas,monospace;font-size:11px;letter-spacing:.14em}
h1{margin:18px 0 10px;font-size:30px;font-weight:500;line-height:1.2}
p{margin:0 0 22px;color:#9aa99c;font-size:14px;line-height:1.75}
label{display:block;margin-bottom:8px;color:#b9c9ba;font-size:12px}
input{width:100%;min-height:48px;padding:0 14px;background:#07100e;color:#eef4ee;border:1px solid rgba(255,255,255,.16);border-radius:8px;font-size:16px}
button{width:100%;min-height:48px;margin-top:14px;background:#b7d4a9;color:#07100e;border:0;border-radius:999px;font-size:15px;font-weight:600;cursor:pointer}
.error{margin:0 0 16px;padding:10px 12px;color:#f0c9b5;background:rgba(190,102,70,.12);border:1px solid rgba(190,102,70,.28);border-radius:8px;font-size:13px}
.foot{margin-top:20px;color:#6f8072;font-size:12px;line-height:1.7}
a{color:#b7d4a9}
</style>
</head>
<body>
<main>
  <span class="eyebrow">TINGYE IMAGE LAB / ACCESS</span>
  <h1>AI 生图专项</h1>
  <p>这是受保护的出图工作台入口。输入访问密码后，再进入应用口令页面。</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="${GATE_PATH}">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="password">访问密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">进入工作台</button>
  </form>
  <p class="foot">忘记密码时，在本机查看 <code>tools\worker-gate.txt</code>。<br><a href="${PORTAL_PAGE}">返回项目专题</a></p>
</main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Tingye-Gate": "1",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function errorPage(status, title, message, extraHeaders = {}) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} · AI 生图专项</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#07100e;color:#dbe7dc;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
main{width:min(100%,520px);padding:38px;background:#101d19;border:1px solid rgba(183,212,169,.2);border-radius:14px;text-align:center}
.code{color:#b7d4a9;font-family:Consolas,monospace;font-size:12px;letter-spacing:.14em}
h1{margin:18px 0 12px;font-size:32px;font-weight:500}
p{margin:0 auto;max-width:420px;color:#9aa99c;font-size:14px;line-height:1.8}
.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:26px}
a{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;border:1px solid rgba(183,212,169,.3);border-radius:999px;color:#dbe7dc;text-decoration:none;font-size:13px}
a.primary{background:#b7d4a9;color:#07100e;border-color:#b7d4a9;font-weight:600}
</style>
</head>
<body>
<main>
  <span class="code">IMAGE LAB / ${status}</span>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <div class="actions">
    <a class="primary" href="">重试</a>
    <a href="${PORTAL_PAGE}">返回项目专题</a>
  </div>
</main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
