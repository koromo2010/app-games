import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizePreviewAssetPath, previewContentType } from "../apps/sdk-preview/lib/preview-source.ts";
import {
  createPreviewAssetToken,
  previewAssetBasePath,
  previewContentSecurityPolicy,
  previewCookiePath,
  verifyPreviewAssetToken,
} from "../apps/sdk-preview/lib/preview-security.ts";
import { gameFieldsPresetRuntimeSource, injectGameFieldsPreset } from "../apps/sdk-preview/lib/preset-runtime.ts";
import {
  GAME_SDK_MODULE_IDS,
  createInitialGameSdkModuleProfile,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  SDK_PREVIEW_MODULE_IMPLEMENTATIONS,
  resolveRequiredSdkPreviewModules,
} from "../app/sdk-preview/[creatorSlug]/games/[gameId]/sdk-preview-module-registry.ts";

test("SDK preview source keeps every asset inside its mock directory", () => {
  assert.equal(normalizePreviewAssetPath([]), "index.html");
  assert.equal(normalizePreviewAssetPath(["images", "table.webp"]), "images/table.webp");
  assert.equal(normalizePreviewAssetPath(["..", "secret.txt"]), null);
  assert.equal(normalizePreviewAssetPath(["folder\\secret.js"]), null);
});

test("SDK preview injects one platform preset runtime into mock HTML", () => {
  const html = injectGameFieldsPreset(
    "<!doctype html><html><head><title>Game</title></head><body></body></html>",
    "/p/creator/sample/revision/a/token/",
  );
  assert.match(html, /<head><base data-game-fields-asset-base href="\/p\/creator\/sample\/revision\/a\/token\/">/);
  assert.match(html, /<script data-game-fields-preset>\(\(\) => \{/);
  assert.match(html, /window\.GameFieldsPreset = Object\.freeze/);
  assert.match(html, /<\/script><\/head>/);
  assert.equal(injectGameFieldsPreset(html), html);
  const source = gameFieldsPresetRuntimeSource();
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /window\.GameFieldsPreset/);
  assert.match(source, /dummy:add/);
  assert.match(source, /game:abort/);
  assert.match(source, /viewer:set/);
  assert.match(source, /room:hydrate/);
  assert.match(source, /hydrateRoom/);
  assert.match(source, /\[data-gf-phase\]:not\(select\):not\(html\)/);
  assert.match(source, /event\.source !== window\.parent/);
  assert.match(source, /game-fields:command/);
  assert.match(source, /game-fields:state/);
  assert.match(source, /game-fields:resource-request/);
  assert.match(source, /game-fields:resource-response/);
  assert.match(source, /game-fields:frame-size/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /\[data-gf-timer\]/);
  assert.match(source, /timer:turn-complete/);
  assert.match(source, /onTimeExpired/);
  assert.match(source, /resources: Object\.freeze/);
  assert.match(source, /generate: generateLlm/);
  assert.match(source, /gameAdapterReady/);
  assert.match(source, /game:register/);
});

test("SDK platform shell owns start, abort, auto progress, and rematch controls", () => {
  const shell = readFileSync("app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx", "utf8");
  assert.match(shell, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(shell, /type: "game-fields:command"/);
  assert.match(shell, /name,\s+payload,/);
  for (const command of ["game:start", "game:abort", "game:auto-progress", "game:rematch"]) {
    assert.match(shell, new RegExp(command.replace(":", "\\:")));
  }
});

test("every required SDK module resolves to a concrete preview implementation", () => {
  assert.deepEqual(
    Object.keys(SDK_PREVIEW_MODULE_IMPLEMENTATIONS),
    [...GAME_SDK_MODULE_IDS],
  );
  const initial = createInitialGameSdkModuleProfile();
  const resolved = resolveRequiredSdkPreviewModules(initial);
  assert.deepEqual(resolved.map((module) => module.id), [...GAME_SDK_MODULE_IDS]);
  assert.equal(
    resolved.every((module) => (
      module.implementation.source.trim().length > 0
      && module.implementation.surfaces.length > 0
    )),
    true,
  );

  const withoutDrawing = updateGameSdkModuleProfile(initial, {
    drawing: { mode: "disabled", reason: "描画を利用しないため" },
  });
  assert.equal(
    resolveRequiredSdkPreviewModules(withoutDrawing).some(
      (module) => module.id === "drawing",
    ),
    false,
  );
});

test("SDK preview composes the common room lifecycle around the game slot", () => {
  const shell = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx",
    "utf8",
  );
  for (const surface of ["entry", "result"]) {
    assert.match(shell, new RegExp(`data-sdk-preview-surface="${surface}"`));
  }
  assert.match(shell, /surface === "lobby" \|\| surface === "playing"/);
  assert.match(shell, /data-sdk-preview-surface=\{surface\}/);
  for (const sharedComponent of [
    "GameAdSlot",
    "RoomConfigSummary",
    "RoomTimeLimitControl",
    "DebugToolWindow",
    "DebugParticipantControls",
    "OnlineRoomLifecycleActions",
    "GameResultShareButton",
  ]) {
    assert.match(shell, new RegExp(sharedComponent));
  }
  assert.match(shell, /Game-specific slot/);
  assert.match(shell, /resolveRequiredSdkPreviewModules/);
  assert.equal(
    shell.match(/<iframe/g)?.length,
    1,
    "lobby and playing must retain the same game-specific iframe",
  );
  assert.match(shell, /max-w-\[1600px\]/);
  assert.match(shell, /lg:grid-cols-\[minmax\(0,1fr\)_280px\]/);
  assert.doesNotMatch(shell, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(shell, /data\?\.type === "game-fields:frame-size"/);
  assert.match(shell, /style=\{\{ height: `\$\{frameHeight\}px` \}\}/);
  assert.doesNotMatch(shell, /h-\[620px\]/);
  assert.doesNotMatch(shell, /min-h-\[680px\]/);
  assert.doesNotMatch(shell, /<GamePhaseTimer/);
  assert.match(shell, /\/api\/sdk-preview\/content-sample/);
  assert.match(shell, /\/api\/sdk-preview\/llm/);
  assert.match(shell, /game-fields:resource-request/);
  assert.match(shell, /normalizeGameSdkLlmRequest/);
  assert.match(shell, /PaidLlmAccessButton/);
  assert.match(shell, /AI APIを実際に呼ぶ/);
  assert.doesNotMatch(shell, /new Promise<void>\(\(resolve\) => window\.setTimeout/);
  assert.doesNotMatch(shell, /\["ひまわり", "飛行船", "珊瑚礁"\]/);
  assert.match(shell, /persistentContent=\{debugEnabled/);
  assert.match(shell, /data-sdk-preview-viewer-selector/);
  assert.match(shell, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(shell, /<select id="sdk-preview-viewer"/);
  assert.doesNotMatch(shell, /ADVERTISEMENT SLOT/);
  assert.doesNotMatch(shell, /\(\["lobby", "playing", "result"\] as const\)\.map/);
  assert.match(shell, /ゲーム固有Runtime未接続/);
});

test("SDK preview injects the runtime when game code references the preset API", () => {
  const gameHtml = `<!doctype html><html><head><script>
    window.addEventListener("DOMContentLoaded", () => {
      window.GameFieldsPreset?.registerGame({ start() {} });
    });
  </script></head><body></body></html>`;

  const injected = injectGameFieldsPreset(gameHtml);
  assert.match(injected, /<script data-game-fields-preset>\(\(\) => \{/);
  assert.equal(injected.match(/data-game-fields-preset/g)?.length, 1);
});

test("SDK preview source returns strict content types", () => {
  assert.equal(previewContentType("mock.js"), "text/javascript; charset=utf-8");
  assert.equal(previewContentType("image.svg"), "image/svg+xml");
  assert.equal(previewContentType("unknown.bin"), "application/octet-stream");
});

test("SDK preview content stays sandboxed and scopes its session cookie to one revision", () => {
  const policy = previewContentSecurityPolicy();
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /sandbox allow-scripts/);
  assert.doesNotMatch(policy, /allow-same-origin/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /frame-ancestors https:\/\/sdk-dev\.game-fields\.com https:\/\/dev\.game-fields\.com/);
  assert.equal(previewCookiePath({
    instanceId: "creator-lab",
    gameId: "sample-game",
    revision: "a".repeat(40),
  }), `/p/creator-lab/sample-game/${"a".repeat(40)}/`);
});

test("SDK preview grants opaque-origin subresources read-only access to one revision", () => {
  const scope = {
    instanceId: "creator-lab",
    gameId: "sample-game",
    revision: "a".repeat(40),
  };
  const secret = "test-preview-signing-secret";
  const now = Date.now();
  const token = createPreviewAssetToken(
    { ...scope, expiresAt: now + 60_000 },
    secret,
  );

  assert.equal(verifyPreviewAssetToken(token, scope, now, secret), true);
  assert.equal(
    verifyPreviewAssetToken(token, { ...scope, gameId: "other-game" }, now, secret),
    false,
  );
  assert.equal(verifyPreviewAssetToken(token, scope, now + 60_001, secret), false);
  assert.equal(verifyPreviewAssetToken(`${token}x`, scope, now, secret), false);
  assert.equal(
    previewAssetBasePath(scope, token),
    `/p/${scope.instanceId}/${scope.gameId}/${scope.revision}/a/${token}/`,
  );
});
