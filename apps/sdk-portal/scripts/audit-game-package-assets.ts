import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { auditPreparedGamePackageAssets } from "../lib/game-package-asset-audit.ts";
import { prepareGamePackageUploadFiles } from "../lib/mock-git-store.ts";

async function packageFiles(directory: string) {
  const root = resolve(directory);
  if (!(await stat(root).catch(() => null))?.isDirectory()) {
    throw new Error("GAME_SDK_PACKAGE_ASSET_DIRECTORY_INVALID");
  }
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = resolve(entry.parentPath, entry.name);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      throw new Error("GAME_SDK_PACKAGE_ASSET_OUTSIDE_ROOT");
    }
    const path = relative(root, absolute).replaceAll(sep, "/");
    const content = await readFile(absolute);
    const text = [".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".json", ".md", ".svg"].some((extension) => path.toLowerCase().endsWith(extension));
    files.push({ path, content: text ? content.toString("utf8") : content.toString("base64"), encoding: text ? "utf-8" as const : "base64" as const });
  }
  return prepareGamePackageUploadFiles(files);
}

export async function auditGamePackageDirectory(directory: string) {
  const files = await packageFiles(directory);
  return auditPreparedGamePackageAssets(files);
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    console.error(JSON.stringify({ valid: false, error: "GAME_SDK_PACKAGE_ASSET_DIRECTORY_REQUIRED" }));
    process.exitCode = 2;
    return;
  }
  try {
    const result = await auditGamePackageDirectory(directory);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ valid: false, error: error instanceof Error ? error.message : "GAME_SDK_PACKAGE_ASSET_AUDIT_FAILED" }));
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
