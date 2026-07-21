import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const packageRoot = join(root, "packages/game-sdk");
const sourceRoot = join(packageRoot, "src");
const sdkFiles = readdirSync(sourceRoot)
  .filter((name) => extname(name) === ".ts")
  .map((name) => join(sourceRoot, name));
const allowedRelativeImports = new Set([
  "./index.js",
  "./runtime.js",
]);
const failures = [];

for (const absoluteFile of sdkFiles) {
  const file = relative(root, absoluteFile);
  const source = readFileSync(absoluteFile, "utf8");
  const imports = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    if (!allowedRelativeImports.has(specifier)) {
      failures.push(`${file}: 公開SDKから許可されていない依存 ${specifier} をimportしています。`);
    }
  }
  if (/\bprocess\.env\b/.test(source)) {
    failures.push(`${file}: 公開SDKから環境変数へ直接アクセスしています。`);
  }
}

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
if (packageJson.name !== "@game-fields/game-sdk") {
  failures.push("packages/game-sdk/package.json: package名が@game-fields/game-sdkではありません。");
}
if (packageJson.private !== true || packageJson.license !== "UNLICENSED") {
  failures.push("packages/game-sdk/package.json: 初回公開承認前はprivateかつUNLICENSEDである必要があります。");
}
for (const exportPath of [".", "./runtime", "./mock-runtime", "./package.json"]) {
  if (!packageJson.exports?.[exportPath]) {
    failures.push(`packages/game-sdk/package.json: exports ${exportPath} がありません。`);
  }
}
if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
  failures.push("packages/game-sdk/package.json: 公開SDKに外部runtime依存を追加しないでください。");
}

if (failures.length > 0) {
  console.error("\n[game-sdk-boundaries] SDK境界の検査に失敗しました:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[game-sdk-boundaries] ${sdkFiles.length}件の公開SDKソースとpackage境界を確認しました。`);
