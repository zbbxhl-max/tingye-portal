import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.join(projectRoot, "src");
const requiredPages = [
  "index.html",
  "garden.html",
  "works.html",
  "tools.html",
  "workflows.html",
  "status.html",
  "404.html"
];
const requiredAssets = [
  "assets/css/main.css",
  "assets/js/app.js",
  "assets/js/config.js",
  "assets/images/favicon.svg",
  "_headers"
];
const secretPatterns = [
  { label: "疑似 OpenAI 密钥", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "疑似 API Key 赋值", pattern: /\bapi[_-]?key\s*[:=]\s*["'][^"']+["']/i },
  { label: "疑似密码赋值", pattern: /\bpassword\s*[:=]\s*["'][^"']+["']/i },
  { label: "疑似 Bearer Token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i }
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function extractAttributes(markup, attribute) {
  const expression = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "gi");
  return [...markup.matchAll(expression)].map((match) => match[1]);
}

function isExternalReference(reference) {
  return (
    reference.startsWith("#") ||
    /^(?:https?:|mailto:|tel:|data:)/i.test(reference)
  );
}

function normalizeLocalReference(reference) {
  return reference.split("#")[0].split("?")[0];
}

function validateExternalUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export async function runVerification({ root = defaultSourceRoot } = {}) {
  const errors = [];
  const warnings = [];
  const sourceRoot = path.resolve(root);

  for (const relativePath of [...requiredPages, ...requiredAssets]) {
    if (!(await exists(path.join(sourceRoot, relativePath)))) {
      errors.push(`缺少必需文件：${relativePath}`);
    }
  }

  const htmlFiles = (await collectFiles(sourceRoot)).filter((file) => file.endsWith(".html"));

  for (const filePath of htmlFiles) {
    const relativePath = path.relative(sourceRoot, filePath).replaceAll("\\", "/");
    const markup = await readFile(filePath, "utf8");

    if (!markup.includes('lang="zh-CN"')) {
      errors.push(`${relativePath} 缺少 lang="zh-CN"`);
    }
    if (!markup.includes('name="viewport"')) {
      errors.push(`${relativePath} 缺少 viewport 元数据`);
    }
    if (!markup.includes("assets/css/main.css")) {
      errors.push(`${relativePath} 未引用全站样式`);
    }
    if (!markup.includes("assets/js/app.js")) {
      errors.push(`${relativePath} 未引用交互脚本`);
    }
    if (!markup.includes('class="site-header"')) {
      errors.push(`${relativePath} 缺少统一站点头部`);
    }
    if (!markup.includes('class="site-footer"')) {
      errors.push(`${relativePath} 缺少统一站点页脚`);
    }
    if (/<script(?:\s[^>]*)?>(?!\s*<\/script>)/i.test(markup)) {
      errors.push(`${relativePath} 包含内联脚本，与 CSP 策略不一致`);
    }
    if (/<style\b/i.test(markup)) {
      errors.push(`${relativePath} 包含内联样式，与 CSP 策略不一致`);
    }
    if (/\sstyle\s*=/i.test(markup)) {
      errors.push(`${relativePath} 包含内联 style 属性，与 CSP 策略不一致`);
    }
    if (/\son[a-z]+\s*=/i.test(markup)) {
      errors.push(`${relativePath} 包含内联事件处理属性`);
    }

    const idMatches = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicateIds = idMatches.filter((id, index) => idMatches.indexOf(id) !== index);
    if (duplicateIds.length) {
      errors.push(`${relativePath} 包含重复 id：${[...new Set(duplicateIds)].join(", ")}`);
    }

    const imageTags = [...markup.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    for (const imageTag of imageTags) {
      if (!/\salt="[^"]*"/i.test(imageTag)) {
        errors.push(`${relativePath} 存在缺少 alt 的图片`);
      }
    }

    const references = [
      ...extractAttributes(markup, "href"),
      ...extractAttributes(markup, "src")
    ];

    for (const reference of references) {
      if (isExternalReference(reference)) continue;
      const localReference = normalizeLocalReference(reference);
      if (!localReference) continue;

      const target = path.resolve(path.dirname(filePath), localReference);
      const rootPrefix = sourceRoot.endsWith(path.sep)
        ? sourceRoot
        : `${sourceRoot}${path.sep}`;

      if (target !== sourceRoot && !target.startsWith(rootPrefix)) {
        errors.push(`${relativePath} 引用了源码目录之外的资源：${reference}`);
      } else if (!(await exists(target))) {
        errors.push(`${relativePath} 引用了不存在的资源：${reference}`);
      }
    }

    if (relativePath !== "404.html" && !markup.includes('data-open-config')) {
      errors.push(`${relativePath} 缺少链接配置入口`);
    }
  }

  const sourceFiles = await collectFiles(sourceRoot);
  for (const filePath of sourceFiles) {
    const relativePath = path.relative(sourceRoot, filePath).replaceAll("\\", "/");
    if (!/\.(?:html|css|js|json|txt|svg|md)$/i.test(filePath)) continue;
    const content = await readFile(filePath, "utf8");

    for (const { label, pattern } of secretPatterns) {
      if (pattern.test(content)) {
        errors.push(`${relativePath} 中检测到${label}`);
      }
    }

    if (/\bfile:\/\//i.test(content)) {
      errors.push(`${relativePath} 包含 file:// 本地文件地址`);
    }
    if (/[A-Za-z]:\\[^\s"'<>]+/.test(content)) {
      errors.push(`${relativePath} 包含 Windows 绝对路径`);
    }
    if (/\\\\[A-Za-z0-9_.-]+\\/.test(content)) {
      errors.push(`${relativePath} 包含 UNC 网络路径`);
    }
  }

  const configPath = path.join(sourceRoot, "assets/js/config.js");
  if (await exists(configPath)) {
    const config = await import(`${pathToFileURL(configPath).href}?verify=${Date.now()}`);
    if (!config.SITE_CONFIG?.links?.length) {
      errors.push("链接配置中没有任何入口");
    }

    for (const link of config.SITE_CONFIG?.links || []) {
      if (!link.id || !link.title || !link.group) {
        errors.push("链接配置存在缺少 id、title 或 group 的条目");
      }
      if (link.defaultUrl && !validateExternalUrl(link.defaultUrl)) {
        errors.push(`链接 ${link.id} 的默认 URL 不是安全的 HTTP(S) 地址`);
      }
    }
  }

  const headersPath = path.join(sourceRoot, "_headers");
  if (await exists(headersPath)) {
    const headers = await readFile(headersPath, "utf8");
    for (const headerName of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy"
    ]) {
      if (!headers.includes(headerName)) {
        errors.push(`_headers 缺少 ${headerName}`);
      }
    }
  }

  if (!(await exists(path.join(sourceRoot, "robots.txt")))) {
    warnings.push("未找到 robots.txt；部署后可按需添加");
  }

  return { errors, warnings, htmlCount: htmlFiles.length };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const result = await runVerification();

  for (const warning of result.warnings) {
    console.warn(`警告：${warning}`);
  }

  if (result.errors.length) {
    for (const error of result.errors) {
      console.error(`错误：${error}`);
    }
    console.error(`检查失败，共 ${result.errors.length} 个问题。`);
    process.exit(1);
  }

  console.log(`检查通过：${result.htmlCount} 个页面及全部静态资源引用有效。`);
}
