import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerOrigin = "http://127.0.0.1:8788";
const mockOrigin = "http://127.0.0.1:8790";
let worker;
let mock;
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function parseVars(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

async function waitFor(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startMock() {
  return new Promise((resolve) => {
    mock = http.createServer((request, response) => {
      if (request.url === "/hello") {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("hello-through-worker");
        return;
      }
      if (request.url === "/cookie") {
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Set-Cookie": "sid=mock-session; Path=/; HttpOnly"
        });
        response.end("cookie-set");
        return;
      }
      if (request.url === "/img") {
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return;
      }
      if (request.url === "/echo") {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => {
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(Buffer.concat(chunks));
        });
        return;
      }
      response.writeHead(404);
      response.end("not found");
    });
    mock.listen(8790, "127.0.0.1", () => resolve());
  });
}

async function main() {
  const vars = parseVars(await readFile(path.join(root, ".dev.vars"), "utf8"));
  await startMock();

  worker = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
      "dev",
      "--port",
      "8788",
      "--local",
      "--log-level",
      "error"
    ],
    {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  let workerLog = "";
  worker.stdout.on("data", (chunk) => { workerLog += chunk.toString(); });
  worker.stderr.on("data", (chunk) => { workerLog += chunk.toString(); });

  await waitFor(`${workerOrigin}/__health`);

  let response = await fetch(`${workerOrigin}/__health`);
  let body = await response.json();
  check("health starts unconfigured", response.status === 200 && body.configured === false);

  response = await fetch(`${workerOrigin}/`);
  const gateBody = await response.text();
  check(
    "gate blocks unauthenticated navigation",
    response.status === 401 && response.headers.get("x-tingye-gate") === "1" && gateBody.includes("访问密码")
  );

  response = await fetch(`${workerOrigin}/__gate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "wrong", next: "/hello" }),
    redirect: "manual"
  });
  check("wrong password rejected", response.status === 401);

  response = await fetch(`${workerOrigin}/__gate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: vars.GATE_PASSWORD, next: "/hello" }),
    redirect: "manual"
  });
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check(
    "correct password sets gate cookie",
    response.status === 303 &&
      response.headers.get("location") === "/hello" &&
      cookie.startsWith("tingye_gate=v1.")
  );

  response = await fetch(`${workerOrigin}/hello`, { headers: { Cookie: cookie } });
  check("proxy reports 503 without tunnel", response.status === 503);

  response = await fetch(`${workerOrigin}/__admin/tunnel`, {
    method: "PUT",
    headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
    body: JSON.stringify({ url: mockOrigin })
  });
  check("admin rejects wrong token", response.status === 401);

  response = await fetch(`${workerOrigin}/__admin/tunnel`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" })
  });
  check("admin rejects non-tunnel url", response.status === 400);

  response = await fetch(`${workerOrigin}/__admin/tunnel`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: mockOrigin })
  });
  check("admin accepts local test origin", response.status === 200);

  response = await fetch(`${workerOrigin}/__health`);
  body = await response.json();
  check("health reports configured", body.configured === true);

  response = await fetch(`${workerOrigin}/hello`, { headers: { Cookie: cookie } });
  check(
    "proxy forwards GET",
    response.status === 200 && (await response.text()) === "hello-through-worker"
  );

  response = await fetch(`${workerOrigin}/cookie`, { headers: { Cookie: cookie } });
  check(
    "proxy preserves Set-Cookie",
    response.status === 200 && (response.headers.get("set-cookie") || "").includes("sid=mock-session")
  );

  response = await fetch(`${workerOrigin}/echo`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "text/plain" },
    body: "payload-through-worker"
  });
  check(
    "proxy forwards POST body",
    response.status === 200 && (await response.text()) === "payload-through-worker"
  );

  response = await fetch(`${workerOrigin}/img`, { headers: { Cookie: cookie } });
  const image = await response.arrayBuffer();
  check(
    "proxy preserves image response",
    response.status === 200 &&
      response.headers.get("content-type") === "image/png" &&
      new Uint8Array(image)[0] === 0x89
  );

  response = await fetch(`${workerOrigin}/__admin/tunnel`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: null })
  });
  check("admin clears tunnel", response.status === 200);

  response = await fetch(`${workerOrigin}/hello`, { headers: { Cookie: cookie } });
  check("proxy returns 503 after clear", response.status === 503);
}

main()
  .catch((error) => {
    failed += 1;
    console.error(`FAIL unhandled — ${error.message}`);
    if (worker?.stdout) {
      // Worker output is only shown on failure and can contain local-only diagnostics.
      worker.stdout.destroy();
    }
  })
  .finally(async () => {
    worker?.kill();
    mock?.close();
    console.log(`\nRESULT ${passed} passed / ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  });
