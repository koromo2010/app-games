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
import {
  loadSdkPreviewRuntimeDefinition,
} from "../lib/sdk-preview-runtime-source.ts";

test("SDK preview source keeps every asset inside its mock directory", () => {
  assert.equal(normalizePreviewAssetPath([]), "index.html");
  assert.equal(normalizePreviewAssetPath(["images", "table.webp"]), "images/table.webp");
  assert.equal(normalizePreviewAssetPath(["..", "secret.txt"]), null);
  assert.equal(normalizePreviewAssetPath(["folder\\secret.js"]), null);
});

test("SDK preview loads app-declared settings and gives legacy mocks only a timer", async () => {
  const declared = await loadSdkPreviewRuntimeDefinition(
    "creator-lab",
    "sample-game",
    (async () => Response.json({
      title: "設定テスト",
      runtimeUrl: "https://example.com/runtime",
      settings: [{
        key: "timeLimitSeconds",
        label: { ja: "回答時間", en: "Answer time" },
        type: "select",
        defaultValue: 45,
        platformRole: "time-limit",
        options: [0, 15, 45],
      }, {
        key: "difficulty",
        label: { ja: "難易度", en: "Difficulty" },
        type: "select",
        defaultValue: "normal",
        options: ["easy", "normal", "hard"],
      }],
    })) as typeof fetch,
  );
  assert.equal(declared?.settings.length, 2);
  assert.equal(declared?.settings[0]?.defaultValue, 45);

  const legacy = await loadSdkPreviewRuntimeDefinition(
    "creator-lab",
    "legacy-game",
    (async () => Response.json({
      title: "旧モック",
      runtimeUrl: "https://example.com/legacy",
    })) as typeof fetch,
  );
  assert.deepEqual(
    legacy?.settings.map((setting) => setting.platformRole),
    ["time-limit"],
  );
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
  assert.match(source, /settings:sync/);
  assert.match(source, /state\.settings/);
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
  assert.match(source, /contentSource: Object\.freeze/);
  assert.match(source, /drawWords\(request\)/);
  assert.match(source, /drawWordPairs\(request\)/);
  assert.match(source, /findDefinitions\(request\)/);
  assert.match(source, /resource === "content-source"/);
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
  assert.match(shell, /const SDK_PREVIEW_MINIMUM_PLAYERS = 1/);
  assert.match(shell, /minimumPlayers: SDK_PREVIEW_MINIMUM_PLAYERS/);
  assert.doesNotMatch(shell, /開始には2人以上必要です/);
});

test("SDK preview content bridge authenticates and validates the saved game profile", () => {
  const route = readFileSync(
    "app/api/sdk-preview/content-source/route.ts",
    "utf8",
  );
  for (const marker of [
    "requireSdkPreviewAuthenticatedPlayer",
    "rateLimitPolicies.sdkContentRead",
    "loadSdkPreviewRuntimeDefinition",
    "gameSdkModuleIsRequired(moduleProfile, \"content-source\")",
    "createGameFieldsSdkContentSource",
    "\"drawWords\"",
    "\"drawWordPairs\"",
    "\"findDefinitions\"",
    "\"Cache-Control\": \"private, no-store\"",
  ]) {
    assert.match(route, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(route, /process\.env\.[A-Z_]+.*Response/);
});

test("SDK Portal exchanges its account session for a scoped Preview API session", () => {
  const gate = readFileSync(
    "app/sdk-preview/SdkPreviewSessionGate.tsx",
    "utf8",
  );
  const sessionRoute = readFileSync(
    "app/api/sdk-preview/session/route.ts",
    "utf8",
  );
  const previewSession = readFileSync(
    "lib/sdk-preview-account-session.ts",
    "utf8",
  );
  const portalPage = readFileSync(
    "apps/sdk-portal/app/[instanceId]/page.tsx",
    "utf8",
  );
  for (const marker of [
    "sdkPreviewLink",
    "/api/sdk-preview/session",
    "window.history.replaceState",
  ]) {
    assert.match(gate, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sessionRoute, /parseSdkPreviewAccountLinkCode/);
  assert.match(sessionRoute, /setSdkPreviewAccountSession/);
  assert.match(previewSession, /path: "\/api\/sdk-preview"/);
  assert.match(previewSession, /purpose: "sdk-preview-session"/);
  assert.match(previewSession, /requireSdkPreviewAuthenticatedPlayer/);
  assert.doesNotMatch(previewSession, /setPlayerAuthCookie/);
  assert.match(portalPage, /createSdkPreviewAccountLinkCode/);
  assert.match(portalPage, /sdkPreviewLink/);
  assert.match(gate, /credentials: "same-origin"/);
  assert.match(gate, /useSdkPreviewSessionRequired/);
});

test("SDK preview stops the game shell when a resource session expires", () => {
  const shell = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx",
    "utf8",
  );
  const llmRoute = readFileSync(
    "app/api/sdk-preview/llm/route.ts",
    "utf8",
  );
  assert.match(shell, /useSdkPreviewSessionRequired/);
  assert.match(shell, /response\.status === 401\s+\? "PLAYER_AUTH_REQUIRED"/);
  assert.equal(
    shell.match(/requirePreviewSession\(\)/g)?.length,
    4,
    "content bridge, LLM bridge, and both module-lab actions must stop on auth expiry",
  );
  assert.match(
    llmRoute,
    /code === "PLAYER_AUTH_REQUIRED"[\s\S]*json\(\{ error: code \}, 401\)/,
  );
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
  const settingsControl = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewSettingsControl.tsx",
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
    "DebugToolWindow",
    "DebugParticipantControls",
    "OnlineRoomLifecycleActions",
    "GameResultShareButton",
  ]) {
    assert.match(shell, new RegExp(sharedComponent));
  }
  assert.match(shell, /SdkPreviewSettingsControl/);
  assert.match(settingsControl, /RoomTimeLimitControl/);
  assert.match(shell, /settingDefinitions\.map/);
  assert.match(shell, /"settings:sync"/);
  assert.doesNotMatch(shell, /sdk-preview-max-players/);
  assert.doesNotMatch(shell, /sdk-preview-rounds/);
  assert.doesNotMatch(shell, /\[2, 3, 4, 5, 6, 8, 10, 12\]/);
  assert.doesNotMatch(shell, /\[1, 2, 3, 5, 7, 10\]/);
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
  assert.match(shell, /\/api\/sdk-preview\/content-source/);
  assert.match(shell, /\/api\/sdk-preview\/llm/);
  assert.match(shell, /game-fields:resource-request/);
  assert.match(shell, /data\.resource === "content-source"/);
  assert.match(shell, /GAME_SDK_CONTENT_MODULE_REQUIRED/);
  assert.match(shell, /<option value="easy">簡単<\/option>/);
  assert.match(shell, /<option value="normal">普通<\/option>/);
  assert.match(shell, /<option value="hard">難しい<\/option>/);
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
