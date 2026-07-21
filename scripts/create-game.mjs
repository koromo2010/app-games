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
  [`use-${gameId}-controller.ts`]: `"use client";\n\nimport { useMemo, useState } from "react";\nimport { create${pascal}ViewPermissions } from "./${gameId}-view-permissions";\n\nexport function use${pascal}Controller() {\n  const [error, setError] = useState("");\n  const permissions = useMemo(() => create${pascal}ViewPermissions(), []);\n\n  return {\n    state: { error },\n    actions: { clearError: () => setError("") },\n    session: null,\n    viewModel: {},\n    permissions,\n  };\n}\n\nexport type ${pascal}Controller = ReturnType<typeof use${pascal}Controller>;\n`,
  [`${gameId}-view-permissions.ts`]: `export type ${pascal}ViewPermissions = {\n  canStartGame: boolean;\n  canEditRoomSettings: boolean;\n  canAbort: boolean;\n  canDebug: boolean;\n  canSeeSecret: boolean;\n};\n\nexport function create${pascal}ViewPermissions(): ${pascal}ViewPermissions {\n  return {\n    canStartGame: false,\n    canEditRoomSettings: false,\n    canAbort: false,\n    canDebug: false,\n    canSeeSecret: false,\n  };\n}\n`,
  [`${pascal}DesktopLayout.tsx`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\nexport function ${pascal}DesktopLayout({ controller }: { controller: ${pascal}Controller }) {\n  return (\n    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">\n      <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/[0.05] p-6">\n        <h1 className="text-3xl font-black">${title}</h1>\n        <p className="mt-3 text-slate-300">Desktop layout scaffold. Keep game state and commands in the controller.</p>\n        {controller.state.error && <p className="mt-4 text-rose-200">{controller.state.error}</p>}\n      </section>\n    </main>\n  );\n}\n`,
  [`${pascal}MobileLayout.tsx.example`]: `import type { ${pascal}Controller } from "./use-${gameId}-controller";\n\n// Rename to .tsx only when a dedicated mobile UI is actually implemented.\nexport function ${pascal}MobileLayout({ controller: _controller }: { controller: ${pascal}Controller }) {\n  return null;\n}\n`,
  "README.md": `# ${title}\n\nGenerated game package scaffold.\n\n## Boundaries\n\n- \`${pascal}Game.tsx\`: layout selection only\n- \`use-${gameId}-controller.ts\`: state, session, polling, actions, ViewModel\n- \`${gameId}-view-permissions.ts\`: UI-only permission projection\n- \`${pascal}DesktopLayout.tsx\`: current desktop presentation\n- \`${pascal}MobileLayout.tsx.example\`: future dedicated mobile presentation\n\nServer Commands remain the final authority. Do not place secrets, DB clients, Redis access, or API keys in this package.\n\n## Required follow-up\n\n1. Register the game in \`config/game-registry.json\`.\n2. Add server domain/store/API boundaries as required.\n3. Add i18n dictionaries for Japanese and English.\n4. Add tests and update \`docs/NEW_GAME_CHECKLIST.md\`.\n5. Run \`npm run lint\`, \`npm test\`, and \`npm run build\`.\n`,
};

await mkdir(gameDir, { recursive: false });
for (const [relativePath, content] of Object.entries(files)) {
  await writeFile(path.join(gameDir, relativePath), content, { encoding: "utf8", flag: "wx" });
}

console.log(`\nCreated ${Object.keys(files).length} files in app/${gameId}`);
console.log("Next: register the game, implement Commands/domain, add i18n and tests.\n");
