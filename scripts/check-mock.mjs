import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "APP_REQUIREMENTS.md",
  "GAME_SPEC.md",
  "MOCK_GUIDE.md",
  "MOCK_REVIEW.md",
  "mock/index.html",
  "mock/styles.css",
  "mock/mock.js",
];

const missing = requiredFiles.filter((path) => !existsSync(resolve(root, path)));
if (missing.length > 0) {
  throw new Error(`モックの必須ファイルがありません: ${missing.join(", ")}`);
}

for (const path of ["GAME_SPEC.md", "MOCK_REVIEW.md"]) {
  const content = readFileSync(resolve(root, path), "utf8");
  if (content.includes("未記入")) {
    throw new Error(`${path}に未記入の項目が残っています。`);
  }
}

const html = readFileSync(resolve(root, "mock/index.html"), "utf8");
for (const marker of ["styles.css", "mock.js", "viewport"]) {
  if (!html.includes(marker)) throw new Error(`mock/index.htmlに${marker}がありません。`);
}

console.log("[mock] 仕様、確認記録、HTML、CSS、JavaScriptを確認しました。");
