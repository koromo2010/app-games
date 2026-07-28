import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`Patch did not change: ${label}`);
  return next;
}

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");
frame = replaceOnce(
  frame,
  'import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";',
  'import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";\nimport { GameSdkIframe } from "@/app/components/game-sdk/GameSdkIframe";',
  "frame iframe import",
);
frame = replaceOnce(
  frame,
  `          <iframe\n            ref={iframeRef}\n            src={runtimeUrl}\n            title={\`${title} game package\`}\n            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"\n            className="block w-full border-0"\n            style={{ height: frameHeight }}\n            onLoad={() => postRoom(roomRef.current)}\n          />`,
  `          <GameSdkIframe\n            ref={iframeRef}\n            src={runtimeUrl}\n            title={\`${title} game package\`}\n            className="block w-full border-0"\n            style={{ height: frameHeight }}\n            onLoad={() => postRoom(roomRef.current)}\n          />`,
  "frame iframe component",
);
fs.writeFileSync(framePath, frame);

const authPath = "tests/sdk-preview-auth.test.ts";
let auth = fs.readFileSync(authPath, "utf8");
auth = replaceOnce(
  auth,
  'import test from "node:test";',
  'import test from "node:test";\nimport { renderToStaticMarkup } from "react-dom/server";\nimport { GameSdkIframe, GAME_SDK_IFRAME_SANDBOX } from "../app/components/game-sdk/GameSdkIframe.tsx";',
  "auth iframe imports",
);
const authStart = '  for (const path of [\n    "app/components/GameSdkFrame.tsx",\n    "app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx",\n  ]) {';
const authEnd = '  }\n  for (const path of [\n    "apps/sdk-preview/app/open/[instanceId]/[gameId]/[revision]/route.ts",';
const startIndex = auth.indexOf(authStart);
const endIndex = auth.indexOf(authEnd, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error("Missing auth sandbox source loop");
const replacement = `  assert.equal(\n    GAME_SDK_IFRAME_SANDBOX,\n    "allow-scripts allow-forms allow-modals allow-pointer-lock",\n  );\n  assert.doesNotMatch(GAME_SDK_IFRAME_SANDBOX, /allow-same-origin/);\n  const iframeMarkup = renderToStaticMarkup(\n    <GameSdkIframe src="/test-runtime" title="test runtime" />,\n  );\n  assert.match(iframeMarkup, /sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"/);\n  assert.doesNotMatch(iframeMarkup, /allow-same-origin/);\n`;
auth = auth.slice(0, startIndex) + replacement + auth.slice(endIndex + 4);
fs.writeFileSync(authPath, auth);

const contractPath = "tests/game-sdk-shell-registry.test.ts";
fs.writeFileSync(contractPath, `import assert from "node:assert/strict";\nimport test from "node:test";\nimport { GAME_SDK_MODULE_CATALOG } from "@game-fields/game-sdk/modules";\nimport { assertCompleteShellRegistry, shellModuleIds } from "../app/components/game-sdk/game-sdk-shell-module-registry.ts";\n\ntest("shell module ids remain catalog-driven and ordered", () => {\n  assert.deepEqual(\n    shellModuleIds(),\n    GAME_SDK_MODULE_CATALOG.filter((definition) => definition.group === "shell").map((definition) => definition.id),\n  );\n});\n\ntest("shell registry rejects missing and non-executable implementations", () => {\n  assert.throws(() => assertCompleteShellRegistry({}), /GAME_SDK_SHELL_REGISTRY_INCOMPLETE/);\n});\n`);

// workflow trigger: 2026-07-29T00:00:00+09:00
