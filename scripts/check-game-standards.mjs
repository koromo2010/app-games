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
const allowedGameTags = new Set(["対戦", "協力", "チーム戦", "正体隠匿", "会話", "ブラフ", "作文", "戦略", "連想", "推理", "お絵描き"]);
const sharedDissolutionModule = read("lib/online-room-dissolution.ts");
const sharedPersistenceModule = read("lib/online-room-persistence.ts");
const lobbyActiveRoomsRoute = existsSync(join(root, "app/api/player-active-rooms/route.ts")) ? read("app/api/player-active-rooms/route.ts") : "";

for (const game of games) {
  if (!game.id || ids.has(game.id)) fail(`ゲームIDが空または重複しています: ${game.id || "(empty)"}`);
  if (!game.href || hrefs.has(game.href)) fail(`${game.id}: hrefが空または重複しています。`);
  ids.add(game.id); hrefs.add(game.href);
  if (!Array.isArray(game.tags) || game.tags.length === 0) fail(`${game.id}: tags を1件以上設定してください。`);
  else for (const tag of game.tags) if (!allowedGameTags.has(tag)) fail(`${game.id}: 未対応のタグ「${tag}」があります。`);
  if (game.tags.length > 3) fail(`${game.id}: ロビーカードのタグは3件以内にしてください。`);
  if (new Set(game.tags).size !== game.tags.length) fail(`${game.id}: tags に重複があります。`);
  for (const field of ["entryFile", "pageFile"]) if (!game[field] || !existsSync(join(root, game[field]))) fail(`${game.id}: ${field} が存在しません。`);
  if (!existsSync(join(root, `public/game-icons/${game.id}.svg`))) fail(`${game.id}: ゲームカード用アイコン public/game-icons/${game.id}.svg がありません。`);
  for (const file of game.moduleBoundaryFiles || []) if (!existsSync(join(root, file))) fail(`${game.id}: モジュール境界ファイル ${file} が存在しません。`);
  if (!game.entryFile || !existsSync(join(root, game.entryFile))) continue;
  const entry = read(game.entryFile);
  const registeredModuleSources = [game.entryFile, ...(game.moduleBoundaryFiles || [])]
    .filter((file, index, files) => file && files.indexOf(file) === index && existsSync(join(root, file)))
    .map(read)
    .join("\n");
  const timeLimitSources = [registeredModuleSources, game.roomStoreFile && existsSync(join(root, game.roomStoreFile)) ? read(game.roomStoreFile) : ""].join("\n");
  for (const token of game.requiredTokens || []) if (!registeredModuleSources.includes(token)) fail(`${game.id}: 共通要件「${token}」が登録済みモジュール境界にありません。`);
  if (!game.timeLimit || !["configurable", "not-applicable"].includes(game.timeLimit.mode)) {
    fail(`${game.id}: timeLimit.mode を configurable または not-applicable で宣言してください。`);
  } else if (game.timeLimit.mode === "configurable") {
    if (!registeredModuleSources.includes("RoomTimeLimitControl")) fail(`${game.id}: 共通の時間制限設定 RoomTimeLimitControl がありません。`);
    if (!Array.isArray(game.timeLimit.fields) || game.timeLimit.fields.length === 0) fail(`${game.id}: timeLimit.fields に保存する時間設定を列挙してください。`);
    else for (const field of game.timeLimit.fields) if (typeof field !== "string" || !timeLimitSources.includes(field)) fail(`${game.id}: 時間設定フィールド「${field}」の実装が登録済みモジュールにありません。`);
    if (typeof game.timeLimit.expiryToken !== "string" || !timeLimitSources.includes(game.timeLimit.expiryToken)) fail(`${game.id}: サーバー正本の時間切れ処理が登録済みモジュールにありません。`);
    const textInputTimeout = game.timeLimit.textInputTimeout;
    if (!textInputTimeout || !["adopt-entered-text", "not-applicable"].includes(textInputTimeout.mode)) {
      fail(`${game.id}: timeLimit.textInputTimeout.mode を adopt-entered-text または not-applicable で宣言してください。`);
    } else if (textInputTimeout.mode === "adopt-entered-text") {
      if (!Array.isArray(textInputTimeout.implementationTokens) || textInputTimeout.implementationTokens.length === 0) {
        fail(`${game.id}: 時間切れ時に入力済み文字を採用する実装を implementationTokens に登録してください。`);
      } else {
        for (const token of textInputTimeout.implementationTokens) {
          if (typeof token !== "string" || token.trim().length === 0 || !timeLimitSources.includes(token)) fail(`${game.id}: 入力済み文字の時間切れ採用処理「${token || "(empty)"}」が登録済みモジュールにありません。`);
        }
      }
    } else if (typeof textInputTimeout.reason !== "string" || textInputTimeout.reason.trim().length < 10) {
      fail(`${game.id}: 時間制限付き文字入力が対象外である理由を timeLimit.textInputTimeout.reason に具体的に記載してください。`);
    }
  } else if (typeof game.timeLimit.reason !== "string" || game.timeLimit.reason.trim().length < 10) {
    fail(`${game.id}: 時間制限の対象外理由を timeLimit.reason に具体的に記載してください。`);
  }
  if (game.private && !read(game.pageFile).includes("gamePageAccessAllowed")) fail(`${game.id}: 非公開ゲームの共通サーバーアクセス検証がありません。`);
  if (game.playMode === "online-room") {
    if (!read("lib/online-room-policy.ts").includes(`"${game.id}"`)) fail(`${game.id}: 共通人数上限マップにゲームIDがありません。`);
    if (!read("lib/room-dissolve-policy.ts").includes(`"${game.id}"`)) fail(`${game.id}: 共通解散ポリシーにゲームIDがありません。`);
    if (!lobbyActiveRoomsRoute.includes(`${game.id}:`) && !lobbyActiveRoomsRoute.includes(`"${game.id}":`)) fail(`${game.id}: 共通のアクティブ部屋取得APIにloaderがありません。`);
    if (!entry.includes("GameAdSlot")) fail(`${game.id}: 非プレイ面の共通広告スロットがありません。`);
    if (!game.roomStoreFile || !existsSync(join(root, game.roomStoreFile))) fail(`${game.id}: roomStoreFile がありません。`);
    else { const store = read(game.roomStoreFile); const modules = [entry, store, ...(game.moduleBoundaryFiles || []).map(read)].join("\n"); const usesRoomTtl = store.includes("multiplayerRoomTtlSeconds") || store.includes("multiplayerRoomExpiryArgs") || (store.includes("online-room-persistence") && sharedPersistenceModule.includes("multiplayerRoomExpiryArgs")); if (!usesRoomTtl) fail(`${game.id}: 共通の部屋TTLを使用していません。`); if (!store.includes("revision") && !store.includes("saveStoredWordWolfRoom")) fail(`${game.id}: サーバー側の部屋保存処理が見つかりません。`); if (!modules.includes("abort-game") && !modules.includes("abortGame")) fail(`${game.id}: ゲーム開始前へ戻すデバッグ中断処理がありません。`); if (!modules.includes("confirm-lobby-return") || !modules.includes("remove-waiting-player") || !modules.includes("allRoomPlayersReturned")) fail(`${game.id}: 共通のロビー復帰確認・待機者管理を使用していません。`); const usesDissolutionPolicy = store.includes("canDissolveOnlineRoom") || (store.includes("online-room-dissolution") && sharedDissolutionModule.includes("canDissolveOnlineRoom")); if (!usesDissolutionPolicy) fail(`${game.id}: 進行中の部屋解散を防ぐ共通ポリシーがありません。`); }
    if (!registeredModuleSources.includes("DebugModeButton") || !registeredModuleSources.includes("onAbort=") || !registeredModuleSources.includes("onReplayChange=")) fail(`${game.id}: トップバナーの共通デバッグメニュー（中断・プレイバック）がありません。`);
    if (!registeredModuleSources.includes("GamePlayerMenu")) fail(`${game.id}: ログアウトを内包する共通プレイヤーメニューがありません。`);
    if (entry.includes("DebugReplayButton")) fail(`${game.id}: プレイバック操作は独立表示せずDebugModeButtonへ入れてください。`);
    if (!registeredModuleSources.includes("RoomResultActions")) fail(`${game.id}: 結果画面の「同じ部屋でもう一度／部屋を解散」共通操作がありません。`);
    const routeFile = `app/api/${game.id}/rooms/route.ts`;
    const roomClientFile = (game.moduleBoundaryFiles || []).find((file) => file.endsWith("room-api-client.ts"));
    if (!roomClientFile) fail(`${game.id}: 型付きroom API clientがmoduleBoundaryFilesにありません。`);
    else {
      const roomClient = read(roomClientFile);
      if (!roomClient.includes("createOnlineRoomApiClient")) fail(`${game.id}: 共通room API clientを使用していません。`);
      if (!roomClient.includes("create") || !roomClient.includes("apply")) fail(`${game.id}: 部屋作成とCommand送信の型付きadapterがありません。`);
    }
    if (entry.includes(`/api/${game.id}/rooms`)) fail(`${game.id}: UIから部屋APIを直接呼ばず、型付きadapterを使用してください。`);
    if (entry.includes("setAndSaveRoom")) fail(`${game.id}: クライアントから部屋全体を保存する互換処理が残っています。`);
    if (!existsSync(join(root, routeFile))) fail(`${game.id}: room routeがありません。`);
    else {
      const route = read(routeFile);
      if (!route.includes("requirePlayerDebugAccess")) fail(`${game.id}: デバッグ操作のサーバー側アカウント認証がありません。`);
      if (!route.includes('operation: "room-create"') || !route.includes("export async function PATCH")) fail(`${game.id}: POST作成／PATCH Commandの共通契約になっていません。`);
    }
  }
  if (game.usesLlm) { if (!game.llmRouteFile || !existsSync(join(root, game.llmRouteFile))) fail(`${game.id}: llmRouteFile がありません。`); else if (!read(game.llmRouteFile).includes("generateGameLlmText")) fail(`${game.id}: 共通LLMゲートウェイを使用していません。`); }
  if (game.debugActionLog) { if (!entry.includes("debugLogEntries")) fail(`${game.id}: デバッグプルダウンの行動ログ表示がありません。`); if (!read(game.roomStoreFile).includes("appendGameDebugLog")) fail(`${game.id}: サーバー正本のデバッグ行動ログ記録がありません。`); }
  if (game.resultShare && !entry.includes("GameResultShareButton")) fail(`${game.id}: 最終結果の共通プレイログ共有がありません。`);
  if (game.stats === "account") { if (!game.statsRecorder || !read("lib/player-stats-store.ts").includes(game.statsRecorder)) fail(`${game.id}: アカウント戦績の記録処理がありません。`); if (!game.replayRecorder || !read("lib/game-replay-store.ts").includes(game.replayRecorder) || !read(game.roomStoreFile).includes(game.replayRecorder)) fail(`${game.id}: 全ゲーム共通のプレイバック記録処理がありません。`); if (!read("app/games/GameLobby.tsx").includes('game.stats === "account"')) fail(`${game.id}: 登録簿連動の戦績フィルターがありません。`); }
}
if (!read("app/games/GameLobby.tsx").includes("GameAdSlot")) fail("ゲームロビーに共通広告スロットがありません。");

const registeredEntries = new Set(games.map((game) => game.entryFile));
for (const directory of readdirSync(join(root, "app"), { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const directoryPath = join(root, "app", directory.name);
  for (const file of readdirSync(directoryPath, { withFileTypes: true })) if (file.isFile() && /Game\.tsx$/.test(file.name)) { const entry = relative(root, join(directoryPath, file.name)).replaceAll("\\", "/"); if (!registeredEntries.has(entry)) fail(`${entry}: game-registry.json に登録されていません。`); }
}
for (const game of games) if (game.entryFile && existsSync(join(root, game.entryFile)) && /\b(?:placeholder|title|aria-label)=["']\\u[0-9a-fA-F]{4}/.test(read(game.entryFile))) fail(`${game.id}: JSX属性に表示されるUnicodeエスケープがあります。`);
if (failures.length > 0) { console.error("\n[game-standards] 共通要件の検査に失敗しました:\n"); for (const message of failures) console.error(`- ${message}`); console.error("\n新規ゲームは config/game-registry.json と docs/DEVELOPMENT_HANDOFF.md も更新してください。\n"); process.exit(1); }
console.log(`[game-standards] ${games.length}ゲームの共通要件を確認しました。`);
