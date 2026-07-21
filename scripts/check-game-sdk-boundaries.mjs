import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sdkFiles = [
  "lib/game-sdk.ts",
  "lib/game-sdk-runtime.ts",
  "lib/game-sdk-mock-runtime.ts",
];
const allowedRelativeImports = new Set([
  "./game-sdk",
  "./game-sdk.ts",
  "./game-sdk-runtime",
  "./game-sdk-runtime.ts",
]);
const failures = [];

for (const file of sdkFiles) {
  const source = readFileSync(join(root, file), "utf8");
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

if (failures.length > 0) {
  console.error("\n[game-sdk-boundaries] SDK境界の検査に失敗しました:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[game-sdk-boundaries] ${sdkFiles.length}件の公開SDKファイルに内部依存がないことを確認しました。`);
