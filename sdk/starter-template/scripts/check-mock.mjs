import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "APP_REQUIREMENTS.md",
  "SDK_MODULE_CATALOG.md",
  "GAME_SPEC.md",
  "MOCK_GUIDE.md",
  "MOCK_REVIEW.md",
  "mock/index.html",
  "mock/preview.json",
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
for (const marker of ["styles.css", "mock.js", "viewport", "game-slot"]) {
  if (!html.includes(marker)) throw new Error(`mock/index.htmlに${marker}がありません。`);
}

for (const marker of [
  "data-screen=\"lobby\"",
  "data-screen=\"entry\"",
  "data-screen=\"room\"",
  "data-gf-player-list",
  "data-gf-debug-panel",
  "GAME FIELDS SDK PREVIEW",
]) {
  if (html.includes(marker)) throw new Error(`mock/index.htmlへPlatform共通UI「${marker}」を複製しないでください。ゲーム固有slotだけを作成します。`);
}

const previewMetadata = JSON.parse(readFileSync(resolve(root, "mock/preview.json"), "utf8"));
if (!/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(previewMetadata.gameId ?? "")) {
  throw new Error("mock/preview.jsonのgameIdが不正です。");
}
if (typeof previewMetadata.title !== "string" || !previewMetadata.title.trim() || previewMetadata.title.length > 120) {
  throw new Error("mock/preview.jsonのtitleが不正です。");
}

const spec = readFileSync(resolve(root, "GAME_SPEC.md"), "utf8");
for (const marker of ["## デバッグ", "ダミー", "視点切替", "主要フェーズ", "進行中断"]) {
  if (!spec.includes(marker)) throw new Error(`GAME_SPEC.mdに必須デバッグ項目「${marker}」がありません。`);
}

const review = readFileSync(resolve(root, "MOCK_REVIEW.md"), "utf8");
for (const marker of ["デバッグ権限あり／なし", "ダミー参加者・自動進行", "視点・フェーズ・異常状態切替", "進行中断とロビー復帰"]) {
  if (!review.includes(marker)) throw new Error(`MOCK_REVIEW.mdに必須デバッグ確認「${marker}」がありません。`);
}

const mockJs = readFileSync(resolve(root, "mock/mock.js"), "utf8");
for (const marker of ["GameFieldsPreset", "registerGame", "start", "abort", "rematch", "autoProgress", "onStateChange"]) {
  if (!mockJs.includes(marker)) throw new Error(`mock/mock.jsにプリセット接続「${marker}」がありません。`);
}

console.log("[mock] 仕様、ゲーム固有slot、共通UI非重複、プリセット接続を確認しました。");
