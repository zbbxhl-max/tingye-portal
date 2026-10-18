import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runVerification } from "./verify.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const outputRoot = path.join(projectRoot, "dist");

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

if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== "dist") {
  throw new Error("构建输出目录校验失败。");
}

const verification = await runVerification({ root: sourceRoot });
if (verification.errors.length) {
  for (const error of verification.errors) {
    console.error(`错误：${error}`);
  }
  process.exit(1);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true });

const outputFiles = (await collectFiles(outputRoot)).map((file) =>
  path.relative(outputRoot, file)
);
const forbiddenEntries = outputFiles.filter((entry) =>
  /(?:^|[\\/])(?:scripts|node_modules)(?:[\\/]|$)/.test(entry)
);

if (forbiddenEntries.length) {
  throw new Error(`构建产物包含不应发布的文件：${forbiddenEntries.join(", ")}`);
}

console.log(`构建完成：${outputFiles.length} 个文件已写入 dist/。`);
