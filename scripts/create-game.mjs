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
  [`use-${gameId}-controller.ts`]: `"use client";\n\nimport { useMemo, useState } from "react";\nimport type { GameSdkController } from "@/lib/game-sdk";\nimport { create${pascal}ViewPermissions, type ${pascal}ViewPermissions } from "./${gameId}-view-permissions";\n\ntype ${pascal}State = { error: string };\ntype ${pascal}Actions = { clearError: () => void };\ntype ${pascal}Session = null;\ntype ${pascal}ViewModel = Record<string, never>;\n\nexport function use${pascal}Controller(): GameSdkController<${pascal}State, ${pascal}Actions, ${pascal}Session, ${pascal}ViewModel, ${pascal}ViewPermissions> {\n  const [error, setError] = useState("");\n  const permissions = useMemo(() => create${pascal}ViewPermissions(), []);\n\n  return {\n    state: { error },\n    actions: { clearError: () => setError("") },\n    session: null,\n    viewModel: {},\n    permissions,\n  };\n}\n\nexport type ${pascal}Controller = ReturnType<typeof use${pascal}Controller>;\n`,
  [`${gameId}-view-permissions.ts`]: `import type { GameSdkViewPermissions } from "@/lib/game-sdk";\n\nexport type ${pascal}ViewPermissions = GameSdkViewPermissions;\n\nexport function create${pascal}ViewPermissions(): ${pascal}ViewPermissions {\n  return {\n    canStartGame: false,\n    canEditRoomSettings: false,\n    canAbort: false,\n    canDebug: false,\n    canSeeSecret: false,\n  };\n}\n`,
  [`${gameId}-manifest.ts`]: `import { defineGameManifest } from "@/lib/game-sdk";\n\nexport const ${gameId.replaceAll("-", "_")}Manifest = defineGameManifest({\n  id: "${gameId}",\n  title: { ja: "${title}", en: "${title}" },\n  playMode: "online-room",\n  minimumPlayers: 2,\n  maximumPlayers: 8,\n  supportsDebug: true,\n  supportsSpectators: false,\n  supportsReplay: false,\n  supportsRating: false,\n  usesLlm: false,\n});\n`,
  [`${pascal}DesktopLayout.tsx`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\nexport function ${pascal}DesktopLayout({ controller }: { controller: ${pascal}Controller }) {\n  return (\n    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">\n      <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/[0.05] p-6">\n        <h1 className="text-3xl font-black">${title}</h1>\n        <p className="mt-3 text-slate-300">Desktop layout scaffold. Keep game state and commands in the controller.</p>\n        {controller.state.error && <p className="mt-4 text-rose-200">{controller.state.error}</p>}\n      </section>\n    </main>\n  );\n}\n`,
  [`${pascal}MobileLayout.tsx.example`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\n// Rename to .tsx only when a dedicated mobile UI is actually implemented.\nexport function ${pascal}MobileLayout({ controller: _controller }: { controller: ${pascal}Controller }) {\n  return null;\n}\n`,
  "GAME_SPEC.md": `# ${title} 仕様書\n\n## ゲームの目的\n\n未記入\n\n## 対象人数\n\n- 最小: 2人\n- 最大: 8人\n\n## 勝利・終了条件\n\n未記入\n\n## 1ゲームの流れ\n\n1. 未記入\n\n## プレイヤーが行う操作\n\n- 未記入\n\n## 得点・レーティング\n\n未記入\n\n## 秘密情報\n\n- 誰が何を見られるかを明記する\n\n## 時間切れ\n\n未記入\n\n## デバッグ\n\n- ダミー追加方法\n- ダミーまたはCPUの手番を止めずに進める方法\n- ホストが代理画面を開く必要があるか\n\n## 日本語・英語\n\n未記入\n\n## 未決事項\n\n- 未記入\n`,
  "AGENTS.md": `# ${title} 開発指示\n\nこのフォルダはGame Fieldsのゲーム固有パッケージです。\n\n## 正本\n\n- GAME_SPEC.md\n- ../../docs/CHATGPT_GAME_SDK.md\n- ../../docs/NEW_GAME_CHECKLIST.md\n- ../../docs/UI_ARCHITECTURE.md\n\n## 編集方針\n\n- 原則、このフォルダとこのゲーム固有のlib/testsだけを変更する。\n- 共通基盤を変更する必要があれば、先に理由と対象ファイルを説明する。\n- DB、Redis、認証Cookie、APIキー、管理権限へ直接アクセスしない。\n- UI表示権限はpermissions、最終認可はサーバーCommandに置く。\n- DesktopLayoutへ通信、polling、ゲーム判定を置かない。\n- 秘密情報は閲覧者別にsanitizeする。\n- ダミー、CPU、AIの手番でデバッグを停止させない。\n- 完了時に npm run lint、npm test、npm run build を実行する。\n`,
  "README.md": `# ${title}\n\nGenerated Game Fields SDK scaffold.\n\n## Boundaries\n\n- \`${pascal}Game.tsx\`: layout selection only\n- \`use-${gameId}-controller.ts\`: state, session, polling, actions, ViewModel\n- \`${gameId}-view-permissions.ts\`: UI-only permission projection\n- \`${gameId}-manifest.ts\`: machine-readable feature declaration\n- \`${pascal}DesktopLayout.tsx\`: current desktop presentation\n- \`${pascal}MobileLayout.tsx.example\`: future dedicated mobile presentation\n- \`GAME_SPEC.md\`: game rules and acceptance criteria\n- \`AGENTS.md\`: instructions for ChatGPT or another coding agent\n\nServer Commands remain the final authority. Do not place secrets, DB clients, Redis access, or API keys in this package.\n\n## Required follow-up\n\n1. Complete GAME_SPEC.md before implementation.\n2. Register the game in \`config/game-registry.json\`.\n3. Add server domain/store/API boundaries through platform Runtime interfaces.\n4. Add i18n dictionaries for Japanese and English.\n5. Add tests and update \`docs/NEW_GAME_CHECKLIST.md\`.\n6. Run \`npm run lint\`, \`npm test\`, and \`npm run build\`.\n`,
};

await mkdir(gameDir, { recursive: false });
for (const [relativePath, content] of Object.entries(files)) {
  await writeFile(path.join(gameDir, relativePath), content, { encoding: "utf8", flag: "wx" });
}

console.log(`\nCreated ${Object.keys(files).length} files in app/${gameId}`);
console.log("Next: complete GAME_SPEC.md, then give AGENTS.md and docs/CHATGPT_GAME_SDK.md to ChatGPT.\n");
