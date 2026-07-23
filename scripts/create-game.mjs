import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const [rawId, rawTitle] = process.argv.slice(2);

function fail(message) {
  console.error(`\n[create-game] ${message}\n`);
  process.exit(1);
}

if (!rawId) fail('Usage: npm run create-game -- <game-id> "Display Name"');

const gameId = rawId.trim().toLowerCase();
if (!/^[a-z][a-z0-9-]*$/.test(gameId)) {
  fail("game-id must use lowercase letters, digits, and hyphens, and start with a letter.");
}

const title = (rawTitle ?? gameId).trim();
if (!title) fail("Display name must not be empty.");

const pascal = gameId
  .split("-")
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");

const root = process.cwd();
const gameDir = path.join(root, "app", gameId);

try {
  await access(gameDir);
  fail(`app/${gameId} already exists. No files were changed.`);
} catch {
  // Expected when the target does not exist.
}

const files = {
  "page.tsx": `import { ${pascal}Game } from "./${pascal}Game";\n\nexport default function Page() {\n  return <${pascal}Game />;\n}\n`,
  [`${pascal}Game.tsx`]: `"use client";\n\nimport { ${pascal}DesktopLayout } from "./${pascal}DesktopLayout";\nimport { use${pascal}Controller } from "./use-${gameId}-controller";\n\nexport function ${pascal}Game() {\n  const controller = use${pascal}Controller();\n  return <${pascal}DesktopLayout controller={controller} />;\n}\n`,
  [`use-${gameId}-controller.ts`]: `"use client";\n\nimport { useMemo, useState } from "react";\nimport type { GameSdkController } from "@game-fields/game-sdk";\nimport { create${pascal}ViewPermissions, type ${pascal}ViewPermissions } from "./${gameId}-view-permissions";\n\ntype ${pascal}State = { error: string };\ntype ${pascal}Actions = { clearError: () => void };\ntype ${pascal}Session = null;\ntype ${pascal}ViewModel = Record<string, never>;\n\nexport function use${pascal}Controller(): GameSdkController<${pascal}State, ${pascal}Actions, ${pascal}Session, ${pascal}ViewModel, ${pascal}ViewPermissions> {\n  const [error, setError] = useState("");\n  const permissions = useMemo(() => create${pascal}ViewPermissions(), []);\n\n  return {\n    state: { error },\n    actions: { clearError: () => setError("") },\n    session: null,\n    viewModel: {},\n    permissions,\n  };\n}\n\nexport type ${pascal}Controller = ReturnType<typeof use${pascal}Controller>;\n`,
  [`${gameId}-view-permissions.ts`]: `import type { GameSdkViewPermissions } from "@game-fields/game-sdk";\n\nexport type ${pascal}ViewPermissions = GameSdkViewPermissions;\n\nexport function create${pascal}ViewPermissions(): ${pascal}ViewPermissions {\n  return {\n    canStartGame: false,\n    canEditRoomSettings: false,\n    canAbort: false,\n    canDebug: false,\n    canSeeSecret: false,\n  };\n}\n`,
  [`${gameId}-manifest.ts`]: `import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";\n\nexport const ${gameId.replaceAll("-", "_")}Manifest = defineGameManifest({\n  sdkVersion: GAME_SDK_VERSION,\n  id: "${gameId}",\n  title: { ja: "${title}", en: "${title}" },\n  playMode: "online-room",\n  minimumPlayers: 2,\n  maximumPlayers: 8,\n  supportsDebug: true,\n  supportsSpectators: false,\n  supportsReplay: false,\n  supportsRating: false,\n  usesLlm: false,\n});\n`,
  [`${gameId}-contracts.ts`]: `import type { GameSdkOnlineRoom, GameSdkOnlineRoomCommand, GameSdkOnlineRoomCreateInput, GameSdkOnlineRoomView } from "@game-fields/game-sdk/runtime";\n\nexport type ${pascal}Settings = Record<string, never>;\nexport type ${pascal}AppInput = Record<string, never>;\nexport type ${pascal}AppState = Record<string, never>;\n\n// Replace this starter union with the game-specific Command set from GAME_SPEC.md.\n// Actor/player IDs and display names must not be accepted here; the platform injects the trusted actor.\nexport type ${pascal}AppCommand =\n  | { type: "game/start" };\n\nexport type ${pascal}AppView = Record<string, never>;\nexport type ${pascal}Room = GameSdkOnlineRoom<${pascal}Settings, ${pascal}AppState>;\nexport type ${pascal}CreateInput = GameSdkOnlineRoomCreateInput<${pascal}Settings, ${pascal}AppInput>;\nexport type ${pascal}Command = GameSdkOnlineRoomCommand<${pascal}Settings, ${pascal}AppCommand>;\nexport type ${pascal}RoomView = GameSdkOnlineRoomView<${pascal}Settings, ${pascal}AppView>;\n`,
  [`${gameId}-app-set.ts`]: `import { defineGameSdkOnlineRoomAppSet } from "@game-fields/game-sdk/runtime";\nimport { ${gameId.replaceAll("-", "_")}Manifest } from "./${gameId}-manifest";\nimport type { ${pascal}AppCommand, ${pascal}AppInput, ${pascal}AppState, ${pascal}AppView, ${pascal}Settings } from "./${gameId}-contracts";\n\nexport const ${gameId.replaceAll("-", "_")}AppSet = defineGameSdkOnlineRoomAppSet<\n  ${pascal}Settings,\n  ${pascal}AppState,\n  ${pascal}AppInput,\n  ${pascal}AppCommand,\n  ${pascal}AppView\n>({\n  manifest: ${gameId.replaceAll("-", "_")}Manifest,\n  defaultSettings: {},\n  createAppState() { return {}; },\n  resetAppState() { return {}; },\n  applyAppCommand(room, command, context) {\n    if (command.type !== "game/start") throw new Error("UNKNOWN_COMMAND");\n    if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");\n    if (room.phase !== "lobby") throw new Error("INVALID_PHASE");\n    if (room.players.length < ${gameId.replaceAll("-", "_")}Manifest.minimumPlayers) throw new Error("NOT_ENOUGH_PLAYERS");\n    return { phase: "playing", app: room.app };\n  },\n  presentApp() { return { view: {} }; },\n});\n`,
  [`${gameId}-server-module.ts`]: `import { createGameSdkOnlineRoomModule } from "@game-fields/game-sdk/runtime";\nimport { ${gameId.replaceAll("-", "_")}AppSet } from "./${gameId}-app-set";\n\nexport const ${gameId.replaceAll("-", "_")}ServerModule = createGameSdkOnlineRoomModule(${gameId.replaceAll("-", "_")}AppSet);\n`,
  [`${pascal}DesktopLayout.tsx`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\nexport function ${pascal}DesktopLayout({ controller }: { controller: ${pascal}Controller }) {\n  return (\n    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">\n      <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/[0.05] p-6">\n        <h1 className="text-3xl font-black">${title}</h1>\n        <p className="mt-3 text-slate-300">Desktop layout scaffold. Keep game state and commands in the controller.</p>\n        {controller.state.error && <p className="mt-4 text-rose-200">{controller.state.error}</p>}\n      </section>\n    </main>\n  );\n}\n`,
  [`${pascal}MobileLayout.tsx.example`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\n// Rename to .tsx only when a dedicated mobile UI is actually implemented.\nexport function ${pascal}MobileLayout({ controller: _controller }: { controller: ${pascal}Controller }) {\n  return null;\n}\n`,
  "SDK_CONTRACT.test.ts.example": `import assert from "node:assert/strict";\nimport test from "node:test";\nimport { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";\nimport { ${gameId.replaceAll("-", "_")}ServerModule } from "./${gameId}-server-module.ts";\n\nconst host = { playerId: "host-1", displayName: "Host", role: "host", debugAccess: false } as const;\nconst player = { playerId: "player-1", displayName: "Player", role: "player", debugAccess: false } as const;\n\ntest("${title} SDK contract composes the basic set and AppSet", async () => {\n  const runtime = createGameSdkMockRuntime({ module: ${gameId.replaceAll("-", "_")}ServerModule });\n  let room = await runtime.createRoom({ roomCode: "TEST", create: { app: {} }, actor: host });\n  room = (await runtime.sendCommand({ code: "TEST", envelope: { expectedRevision: room.revision, command: { type: "room/join" } }, actor: player })).room;\n  const result = await runtime.sendCommand({ code: "TEST", envelope: { expectedRevision: room.revision, command: { type: "game/start" } }, actor: host });\n  assert.equal(result.room.phase, "playing");\n  assert.equal(result.revision, 3);\n  assert.equal("id" in result.room.view.common.players[0], false);\n});\n`,
  "GAME_SPEC.md": `# ${title} 仕様書\n\n## ゲームの目的\n\n未記入\n\n## 対象人数\n\n- 最小: 2人\n- 最大: 8人\n\n## 勝利・終了条件\n\n未記入\n\n## 1ゲームの流れ\n\n1. 未記入\n\n## プレイヤーが行う操作\n\n- 未記入\n\n## 得点・レーティング\n\n未記入\n\n## 秘密情報\n\n- 誰が何を見られるかを明記する\n\n## 時間切れ\n\n未記入\n\n## デバッグ\n\n- ダミー追加方法\n- ダミーまたはCPUの手番を止めずに進める方法\n- ホストが代理画面を開く必要があるか\n\n## 日本語・英語\n\n未記入\n\n## 未決事項\n\n- 未記入\n`,
  "AGENTS.md": `# ${title} 開発指示\n\nこのフォルダはGame Fieldsのゲーム固有パッケージです。\n\n## 正本\n\n- GAME_SPEC.md\n- ../../docs/CHATGPT_GAME_SDK.md\n- ../../docs/NEW_GAME_CHECKLIST.md\n- ../../docs/UI_ARCHITECTURE.md\n\n## 編集方針\n\n- 原則、このフォルダとこのゲーム固有のlib/testsだけを変更する。\n- 共通基盤を変更する必要があれば、先に理由と対象ファイルを説明する。\n- DB、Redis、認証Cookie、APIキー、管理権限へ直接アクセスしない。\n- CommandへactorIdやplayerIdを本人証明として入れない。署名済みセッションからRuntimeが注入するactorを使う。\n- SDK基本セットがRoom、参加者、設定、revision、共通Viewを所有する。ゲーム側へ複製しない。\n- ゲーム固有state、Command、勝敗、固有Viewはapp-setへ置き、最終認可もapplyAppCommandで検証する。\n- DesktopLayoutへ通信、polling、ゲーム判定を置かない。\n- ダミー、CPU、AIの手番でデバッグを停止させない。\n- 完了時に npm run lint、npm test、npm run build を実行する。\n`,
  "README.md": `# ${title}\n\nGenerated Game Fields SDK scaffold.\n\n## Boundaries\n\n- \`${pascal}Game.tsx\`: layout selection only\n- \`use-${gameId}-controller.ts\`: state, session, polling, actions, ViewModel\n- \`${gameId}-view-permissions.ts\`: UI-only permission projection\n- \`${gameId}-manifest.ts\`: machine-readable feature declaration\n- \`${gameId}-contracts.ts\`: AppSet state, input, Command, View and SDK composition types\n- \`${gameId}-app-set.ts\`: game-specific rules, authorization and presentation\n- \`${gameId}-server-module.ts\`: SDK basic set + AppSet composition only\n- \`${pascal}DesktopLayout.tsx\`: current desktop presentation\n- \`${pascal}MobileLayout.tsx.example\`: future dedicated mobile presentation\n- \`SDK_CONTRACT.test.ts.example\`: DB-free local Runtime contract test\n- \`GAME_SPEC.md\`: game rules and acceptance criteria\n- \`AGENTS.md\`: instructions for ChatGPT or another coding agent\n\nServer Commands remain the final authority. Do not place secrets, DB clients, Redis access, or API keys in this package.\n\n## Required follow-up\n\n1. Complete GAME_SPEC.md before implementation.\n2. Register the game in \`config/game-registry.json\`.\n3. Replace the starter AppSet domain without reimplementing SDK basic-set responsibilities.\n4. Add i18n dictionaries for Japanese and English.\n5. Rename and extend the SDK contract test, then update \`docs/NEW_GAME_CHECKLIST.md\`.\n6. Run \`npm run lint\`, \`npm test\`, and \`npm run build\`.\n`,
};

await mkdir(path.dirname(gameDir), { recursive: true });
await mkdir(gameDir, { recursive: false });
for (const [relativePath, content] of Object.entries(files)) {
  await writeFile(path.join(gameDir, relativePath), content, { encoding: "utf8", flag: "wx" });
}

console.log(`\nCreated ${Object.keys(files).length} files in app/${gameId}`);
console.log("Next: complete GAME_SPEC.md, then give AGENTS.md and docs/CHATGPT_GAME_SDK.md to ChatGPT.\n");
