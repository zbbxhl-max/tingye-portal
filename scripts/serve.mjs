import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const rootArgument = getArgument("--root", "src");
const portArgument = getArgument("--port", "4173");
const root = path.resolve(projectRoot, rootArgument);
const port = Number.parseInt(portArgument, 10);
const host = process.env.PORTAL_HOST || "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`无效端口：${portArgument}`);
  process.exit(1);
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function resolveRequestPath(url) {
  const requestUrl = new URL(url, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(root, relativePath || "index.html");
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (candidate !== root && !candidate.startsWith(rootPrefix)) {
    return null;
  }

  return candidate;
}

const server = http.createServer(async (request, response) => {
  try {
    const candidate = resolveRequestPath(request.url || "/");

    if (!candidate) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    let filePath = candidate;
    let fileStat;

    try {
      fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        fileStat = await stat(filePath);
      }
    } catch {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      createReadStream(path.join(root, "404.html")).pipe(response);
      return;
    }

    if (!fileStat.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    sendFile(response, filePath);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`庭野智作本地预览：http://${displayHost}:${port}`);
  console.log(`服务目录：${path.join(root, "")}`);
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log("提示：当前预览可能可从局域网访问，请勿在不可信网络中开启。");
  }
});
