import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGameSdkSettingDefinitions } from "@game-fields/game-sdk";

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
parseGameSdkSettingDefinitions(previewMetadata.settings, {
  requireTimeLimit: true,
});
for (const forbiddenKey of ["modules", "moduleProfile", "disabledModules", "optionalModules"]) {
  if (Object.hasOwn(previewMetadata, forbiddenKey)) {
    throw new Error(`mock/preview.jsonからmodule採否「${forbiddenKey}」を指定できません。初期モックの三段階profileはPlatform側が所有します。`);
  }
}

const spec = readFileSync(resolve(root, "GAME_SPEC.md"), "utf8");
for (const marker of ["## デバッグ", "ダミー", "視点切替", "主要フェーズ", "進行中断"]) {
  if (!spec.includes(marker)) throw new Error(`GAME_SPEC.mdに必須デバッグ項目「${marker}」がありません。`);
}
if (!spec.includes("## Word DB・初期データ")) {
  throw new Error("GAME_SPEC.mdにWord DB・初期データの利用宣言がありません。");
}

const review = readFileSync(resolve(root, "MOCK_REVIEW.md"), "utf8");
for (const marker of ["デバッグ権限あり／なし", "ダミー参加者・自動進行", "視点・フェーズ・異常状態切替", "進行中断とロビー復帰"]) {
  if (!review.includes(marker)) throw new Error(`MOCK_REVIEW.mdに必須デバッグ確認「${marker}」がありません。`);
}

const mockJs = readFileSync(resolve(root, "mock/mock.js"), "utf8");
for (const marker of ["GameFieldsPreset", "registerGame", "start", "abort", "rematch", "autoProgress", "onStateChange"]) {
  if (!mockJs.includes(marker)) throw new Error(`mock/mock.jsにプリセット接続「${marker}」がありません。`);
}

const contentSourceSection = spec.match(
  /## Word DB・初期データ[\s\S]*?(?=\n## |\s*$)/,
)?.[0] ?? "";
const usesContentSource = /使用する／しない:\s*使用する/.test(contentSourceSection);
if (usesContentSource) {
  if (!/GameFieldsPreset(?:\?\.|\.)resources(?:\?\.|\.)contentSource/.test(mockJs)) {
    throw new Error("Word DBを使うモックは「GameFieldsPreset.resources.contentSource」で共通content-sourceへ接続してください。");
  }
  if (!mockJs.includes("difficulty")) {
    throw new Error("Word DBを使うモックは「difficulty」をクライアント設定から共通content-sourceへ渡してください。");
  }
  if (!/\.(?:drawWords|drawWordPairs|findDefinitions)\s*\(/.test(mockJs)) {
    throw new Error("Word DBを使うモックはdrawWords、drawWordPairs、findDefinitionsのいずれかを呼んでください。");
  }
  if (/\b(?:initialWords|seedWords|fallbackWords|mockWords|wordDatabase|wordDb)\b/i.test(mockJs)) {
    throw new Error("Word DBを使うモックへ初期・seed・fallback単語DBを作らず、共通content-sourceだけを使ってください。");
  }
}

console.log("[mock] 仕様、ゲーム固有slot、共通UI非重複、プリセット接続、全module必須profileのPlatform所有を確認しました。");
