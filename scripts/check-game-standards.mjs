import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const registryPath = join(root, "config/game-registry.json");
const failures = [];
const read = (file) => readFileSync(join(root, file), "utf8");
const fail = (message) => failures.push(message);
if (!existsSync(registryPath)) { console.error("[game-standards] config/game-registry.json がありません。"); process.exit(1); }
const games = JSON.parse(readFileSync(registryPath, "utf8"));
const ids = new Set(); const hrefs = new Set();

for (const game of games) {
  if (!game.id || ids.has(game.id)) fail(`ゲームIDが空または重複しています: ${game.id || "(empty)"}`);
  if (!game.href || hrefs.has(game.href)) fail(`${game.id}: hrefが空または重複しています。`);
  ids.add(game.id); hrefs.add(game.href);
  for (const field of ["entryFile", "pageFile"]) if (!game[field] || !existsSync(join(root, game[field]))) fail(`${game.id}: ${field} が存在しません。`);
  for (const file of game.moduleBoundaryFiles || []) if (!existsSync(join(root, file))) fail(`${game.id}: モジュール境界ファイル ${file} が存在しません。`);
  if (!game.entryFile || !existsSync(join(root, game.entryFile))) continue;
  const entry = read(game.entryFile);
  for (const token of game.requiredTokens || []) if (!entry.includes(token)) fail(`${game.id}: 共通要件「${token}」が ${game.entryFile} にありません。`);
  if (game.private && !read(game.pageFile).includes("privateGameCookieMatches")) fail(`${game.id}: 非公開ゲームのサーバー側Cookie検証がありません。`);
  if (game.playMode === "online-room") {
    if (!game.roomStoreFile || !existsSync(join(root, game.roomStoreFile))) fail(`${game.id}: roomStoreFile がありません。`);
    else { const store = read(game.roomStoreFile); const modules = [entry, store, ...(game.moduleBoundaryFiles || []).map(read)].join("\n"); if (!store.includes("multiplayerRoomTtlSeconds") && !store.includes("multiplayerRoomExpiryArgs")) fail(`${game.id}: 共通の部屋TTLを使用していません。`); if (!store.includes("revision") && !store.includes("saveStoredWordWolfRoom")) fail(`${game.id}: サーバー側の部屋保存処理が見つかりません。`); if (!modules.includes("abort-game") && !modules.includes("abortGame")) fail(`${game.id}: ゲーム開始前へ戻すデバッグ中断処理がありません。`); }
    if (!entry.includes("DebugModeButton") || !entry.includes("onAbort=")) fail(`${game.id}: トップバナーの共通デバッグ操作がありません。`);
    const routeFile = `app/api/${game.id}/rooms/route.ts`;
    if (!existsSync(join(root, routeFile)) || !read(routeFile).includes("requirePlayerDebugAccess")) fail(`${game.id}: デバッグ操作のサーバー側アカウント認証がありません。`);
  }
  if (game.usesLlm) { if (!game.llmRouteFile || !existsSync(join(root, game.llmRouteFile))) fail(`${game.id}: llmRouteFile がありません。`); else if (!read(game.llmRouteFile).includes("generateGameLlmText")) fail(`${game.id}: 共通LLMゲートウェイを使用していません。`); }
  if (game.stats === "account") { if (!game.statsRecorder || !read("lib/player-stats-store.ts").includes(game.statsRecorder)) fail(`${game.id}: アカウント戦績の記録処理がありません。`); if (!game.replayRecorder || !read("lib/game-replay-store.ts").includes(game.replayRecorder) || !read(game.roomStoreFile).includes(game.replayRecorder)) fail(`${game.id}: 全ゲーム共通のプレイバック記録処理がありません。`); if (!read("app/games/GameLobby.tsx").includes('game.stats === "account"')) fail(`${game.id}: 登録簿連動の戦績フィルターがありません。`); }
}

const registeredEntries = new Set(games.map((game) => game.entryFile));
for (const directory of readdirSync(join(root, "app"), { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const directoryPath = join(root, "app", directory.name);
  for (const file of readdirSync(directoryPath, { withFileTypes: true })) if (file.isFile() && /Game\.tsx$/.test(file.name)) { const entry = relative(root, join(directoryPath, file.name)).replaceAll("\\", "/"); if (!registeredEntries.has(entry)) fail(`${entry}: game-registry.json に登録されていません。`); }
}
for (const game of games) if (game.entryFile && existsSync(join(root, game.entryFile)) && /\b(?:placeholder|title|aria-label)=["']\\u[0-9a-fA-F]{4}/.test(read(game.entryFile))) fail(`${game.id}: JSX属性に表示されるUnicodeエスケープがあります。`);
if (failures.length > 0) { console.error("\n[game-standards] 共通要件の検査に失敗しました:\n"); for (const message of failures) console.error(`- ${message}`); console.error("\n新規ゲームは config/game-registry.json と docs/DEVELOPMENT_HANDOFF.md も更新してください。\n"); process.exit(1); }
console.log(`[game-standards] ${games.length}ゲームの共通要件を確認しました。`);
