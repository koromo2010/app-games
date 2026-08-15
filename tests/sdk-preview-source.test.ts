import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizePreviewAssetPath, previewContentType } from "../apps/sdk-preview/lib/preview-source.ts";
import {
  createPreviewAssetToken,
  packageAssetPath,
  previewAssetCacheHeaders,
  previewAssetPath,
  previewContentSecurityPolicy,
  resolvePreviewChildAssetToken,
  verifyPreviewAssetToken,
} from "../apps/sdk-preview/lib/preview-security.ts";
import { gameFieldsPresetRuntimeSource, injectGameFieldsPreset } from "../apps/sdk-preview/lib/preset-runtime.ts";
import {
  PreviewAssetReferenceError,
  rewritePreviewCssAssetUrls,
  rewritePreviewHtmlAssetUrls,
  rewritePreviewJavaScriptAssetUrls,
} from "../apps/sdk-preview/lib/preview-asset-rewriter.ts";
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
import {
  gameSdkPlatformResourcePolicy,
} from "../lib/game-sdk-platform-resource-policy.ts";
import { buildGameSdkResultShareText } from "../app/components/game-sdk/game-sdk-frame-presentation.ts";

function createLegacyPreviewAssetTokenForTest(
  scope: {
    instanceId: string;
    gameId: string;
    revision: string;
  },
  expiresAt: number,
  secret: string,
) {
  const payload = Buffer.from(JSON.stringify({
    audience: "game-fields-preview-assets",
    version: 1,
    ...scope,
    expiresAt,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`game-fields-preview-assets:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

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

test("SDK package runtime accepts only its configured isolated origin and exact revision paths", async () => {
  const revision = "a".repeat(40);
  const manifest = {
    sdkVersion: 1 as const,
    id: "sample-game",
    title: { ja: "サンプル", en: "Sample" },
    playMode: "online-room" as const,
    minimumPlayers: 1,
    maximumPlayers: 4,
    supportsDebug: false,
    supportsSpectators: false,
    supportsReplay: false,
    supportsRating: false,
    usesLlm: false,
    settings: [{
      key: "timeLimitSeconds",
      label: { ja: "制限時間", en: "Time limit" },
      type: "select" as const,
      defaultValue: 60,
      platformRole: "time-limit" as const,
      options: [0, 60],
    }],
  };
  const env = {
    ...process.env,
    SDK_PREVIEW_BASE_URL: "https://preview.example",
  };
  const validPayload = {
    title: "サンプル",
    runtimeKind: "package",
    runtimeUrl: `https://preview.example/package-open/creator-lab/sample-game/${revision}#token=client`,
    revision,
    manifest,
    serverRuntimeUrl: `https://preview.example/server/creator-lab/sample-game/${revision}`,
    serverRuntimeToken: "server-token",
    serverRuntimeExpiresAt: Date.now() + 60_000,
    serverBundleSha256: "b".repeat(64),
    appSetSourceSha256: "c".repeat(64),
    packageRootSha256: "d".repeat(64),
  };
  const accepted = await loadSdkPreviewRuntimeDefinition(
    "creator-lab",
    "sample-game",
    (async () => Response.json(validPayload)) as typeof fetch,
    env,
  );
  assert.equal(accepted?.runtimeKind, "package");
  await assert.rejects(() => loadSdkPreviewRuntimeDefinition(
    "creator-lab",
    "sample-game",
    (async () => Response.json({
      ...validPayload,
      serverRuntimeUrl: `https://attacker.example/server/creator-lab/sample-game/${revision}`,
    })) as typeof fetch,
    env,
  ), /SDK_PREVIEW_PACKAGE_RUNTIME_INVALID/);
  for (const runtimeUrl of [
    `https://preview.example/package-open/creator-lab/sample-game/${revision}?token=client`,
    `https://preview.example/package-open/creator-lab/sample-game/${revision}#token=client&extra=value`,
  ]) {
    await assert.rejects(() => loadSdkPreviewRuntimeDefinition(
      "creator-lab",
      "sample-game",
      (async () => Response.json({
        ...validPayload,
        runtimeUrl,
      })) as typeof fetch,
      env,
    ), /SDK_PREVIEW_PACKAGE_RUNTIME_INVALID/);
  }
});

test("SDK package runtime injects only resources enabled by the reviewed module profile", () => {
  const manifest = { usesLlm: true };
  const initial = createInitialGameSdkModuleProfile();
  const modulePolicy = updateGameSdkModuleProfile(initial, {
    "content-source": {
      mode: "disabled",
      reason: "This package has no word source.",
    },
    llm: {
      mode: "disabled",
      reason: "This package does not call the LLM gateway.",
    },
    feedback: {
      mode: "disabled",
      reason: "There are no generated artifacts.",
    },
  });
  assert.deepEqual(
    gameSdkPlatformResourcePolicy(manifest, modulePolicy),
    {
      moduleProfile: modulePolicy,
      contentSource: false,
      llm: false,
      feedback: false,
    },
  );
  assert.deepEqual(
    gameSdkPlatformResourcePolicy(manifest, initial),
    {
      moduleProfile: initial,
      contentSource: true,
      llm: true,
      feedback: true,
    },
  );
});

test("SDK preview injects one platform preset runtime into mock HTML", () => {
  const runtimeUrl = "/p/creator/sample/revision/a/token/game-fields/preset.js";
  const html = injectGameFieldsPreset(
    "<!doctype html><html><head><title>Game</title></head><body></body></html>",
    runtimeUrl,
  );
  assert.match(
    html,
    /<script data-game-fields-preset src="\/p\/creator\/sample\/revision\/a\/token\/game-fields\/preset\.js"><\/script><\/head>/,
  );
  assert.doesNotMatch(html, /<base\b|window\.GameFieldsPreset = Object\.freeze/);
  assert.equal(injectGameFieldsPreset(html, runtimeUrl), html);
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
  assert.doesNotMatch(shell, /max-w-\[1600px\]/);
  assert.match(shell, /mx-auto grid w-full gap-5 px-4 py-6/);
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

test("shared GameFrame owns the top banner and phase-specific common modules", () => {
  // GameSdkFrame.tsx is now a thin composition root — see
  // app/components/game-sdk/GameSdkFrame.tsx and its sibling modules.
  // Assertions that used to grep GameSdkFrame.tsx's ~600-line source now grep
  // whichever split module the relevant logic actually lives in; nothing
  // here checks *new* behavior, only relocated evidence of the same
  // behavior (plus the one deliberate fragility fix called out below).
  const controller = readFileSync(
    "app/components/game-sdk/use-game-sdk-frame-controller.ts",
    "utf8",
  );
  const view = readFileSync(
    "app/components/game-sdk/GameSdkFrameView.tsx",
    "utf8",
  );
  const roomLifecycle = readFileSync(
    "app/components/game-sdk/use-game-sdk-room-lifecycle.ts",
    "utf8",
  );
  const commandRunner = readFileSync(
    "app/components/game-sdk/use-game-sdk-command-runner.ts",
    "utf8",
  );
  const lobbyPanel = readFileSync(
    "app/components/game-sdk/GameSdkLobbyPanel.tsx",
    "utf8",
  );
  const resultPanel = readFileSync(
    "app/components/game-sdk/GameSdkResultPanel.tsx",
    "utf8",
  );
  const header = readFileSync(
    "app/components/GameSdkShellHeader.tsx",
    "utf8",
  );
  const approvedShell = readFileSync(
    "app/sdk-games/[gameId]/ApprovedSdkGameShell.tsx",
    "utf8",
  );
  const activeRoomRestore = readFileSync(
    "app/hooks/use-game-sdk-active-room-restore.ts",
    "utf8",
  );
  const runtimeCatalog = readFileSync(
    "apps/sdk-portal/app/api/runtime-catalog/[gameId]/route.ts",
    "utf8",
  );

  assert.match(header, /GameTopBanner/);
  assert.match(header, /GameRulesDialog/);
  assert.match(header, /GamePlayerMenu/);
  assert.match(
    header,
    /navigation\.showDirectBack[\s\S]*?data-sdk-lounge-back/,
  );
  assert.match(
    header,
    /navigation\.showMenuBack[\s\S]*?<GameTopMenu>/,
  );
  assert.match(view, /GameSdkShellHeader/);
  assert.match(
    approvedShell,
    /if \(!room\)[\s\S]*?<GameSdkShellHeader[\s\S]*?backHref="\/games"[\s\S]*?backLabel="広場へ戻る"[\s\S]*?surface="lounge"/,
  );
  assert.doesNotMatch(approvedShell, /<GameTopBanner/);
  assert.doesNotMatch(approvedShell, /ゲーム一覧へ/);
  assert.match(view, /room\.phase !== "playing" && \(\s*<aside/);
  assert.match(view, /room\.phase === "playing"\s*\? "mx-auto w-full"/);
  assert.match(
    view,
    /visible=\{room\.phase === "lobby" && moduleRequired\("room-settings"\)\}/,
  );
  assert.match(
    lobbyPanel,
    /<div className=\{panel\}>\s*<h2 className="text-lg font-black">部屋設定/,
  );
  assert.match(resultPanel, /moduleRequired\("replay"\)/);
  assert.match(resultPanel, /moduleRequired\("result-share"\)/);
  assert.match(resultPanel, /moduleRequired\("feedback"\)/);
  assert.match(resultPanel, /GameSdkFeedbackPanel/);
  assert.match(
    view,
    /room\.phase === "result" \? "order-2 lg:order-1" : "order-1"/,
  );
  assert.match(
    view,
    /room\.phase === "result" \? "order-1 lg:order-2" : "order-2"/,
  );
  assert.match(controller, /gameSdkResultReasonText\(standardResult, locale\)/);
  assert.match(controller, /gameSdkResultPlayLog\(standardResult, locale\)/);
  const gameSdkFrameSource = controller + roomLifecycle + view + commandRunner;
  for (const formalShell of [gameSdkFrameSource, approvedShell]) {
    assert.match(formalShell, /useGameSdkActiveRoomRestore/);
    assert.match(formalShell, /isRestoringRoom/);
    assert.match(formalShell, /error\.code === "PLAYER_ACTIVE_ROOM"/);
    assert.match(formalShell, /進行中の部屋へ戻りました/);
  }
  assert.match(activeRoomRestore, /useState\(true\)/);
  assert.match(activeRoomRestore, /await onEmpty\(\)/);
  assert.match(activeRoomRestore, /setIsRestoringRoom\(false\)/);

  // The old fragile check here sliced GameSdkFrame.tsx's raw source between
  // two string markers and asserted the slice didn't contain
  // `ranking.displayName` — a check that depended entirely on GameSdkFrame.tsx
  // staying a single file with that exact shape, and would have broken on
  // this split (or any future split) regardless of whether the actual
  // behavior it was guarding — result-sharing never leaking a real player
  // name — still held. It's replaced with a real value assertion against the
  // extracted `buildGameSdkResultShareText` pure function.
  const shareText = buildGameSdkResultShareText({
    title: "スカル",
    locale: "ja",
    playerCount: 3,
    result: {
      winnerSeats: [0],
      rankings: [{
        seat: 0,
        displayName: "SECRET_REAL_NAME",
        rank: 1,
        score: 3,
        isSelf: true,
      }],
      reason: "finished",
    },
  });
  assert.match(shareText, /PLAYER1/);
  assert.doesNotMatch(shareText, /SECRET_REAL_NAME/);

  assert.match(runtimeCatalog, /r\.module_policy AS "modulePolicy"/);
  assert.match(runtimeCatalog, /moduleProfile: normalizeGameSdkModuleProfile\(modulePolicy\)/);
});

test("SDK feedback artifacts stay behind result-room membership", () => {
  const approvedRoute = readFileSync(
    "app/api/game-sdk/[gameId]/feedback/route.ts",
    "utf8",
  );
  const previewRoute = readFileSync(
    "app/api/sdk-preview/[creatorSlug]/games/[gameId]/feedback/route.ts",
    "utf8",
  );
  const store = readFileSync(
    "lib/game-sdk-feedback-store.ts",
    "utf8",
  );
  for (const route of [approvedRoute, previewRoute]) {
    assert.match(route, /room\.phase !== "result"/);
    assert.match(route, /common\?\.isMember !== true/);
    assert.match(route, /"Cache-Control": "private, no-store"/);
    assert.match(route, /rateLimitPolicies\.sdkRuntimeRead/);
  }
  assert.match(store, /input\.effect\.resource !== "llm"/);
  assert.match(store, /input\.effect\.operation !== "generate"/);
  assert.match(store, /maximumRoomArtifacts = 8/);
  assert.doesNotMatch(store, /prompt:/);
});

test("SDK preview injects its platform runtime as an external signed asset", () => {
  const gameHtml = "<!doctype html><html><head></head><body></body></html>";
  const runtimeUrl = "https://preview.example/signed/preset.js";
  const injected = injectGameFieldsPreset(gameHtml, runtimeUrl);
  assert.match(
    injected,
    /<script data-game-fields-preset src="https:\/\/preview\.example\/signed\/preset\.js"><\/script>/,
  );
  assert.doesNotMatch(injected, /data-game-fields-preset>\(\(\) =>/);
  assert.equal(injected.match(/data-game-fields-preset/g)?.length, 1);
});

test("SDK preview source returns strict content types", () => {
  assert.equal(previewContentType("mock.js"), "text/javascript; charset=utf-8");
  assert.equal(previewContentType("image.svg"), "image/svg+xml");
  assert.equal(previewContentType("unknown.bin"), "application/octet-stream");
});

test("SDK preview content stays sandboxed while explicit-origin assets remain loadable", () => {
  const policy = previewContentSecurityPolicy("https://preview.example");
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action https:\/\/preview\.example/);
  assert.match(policy, /sandbox allow-scripts allow-forms/);
  assert.doesNotMatch(policy, /allow-same-origin/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /script-src https:\/\/preview\.example/);
  assert.match(policy, /style-src https:\/\/preview\.example/);
  assert.doesNotMatch(policy, /unsafe-inline/);
  assert.match(policy, /frame-ancestors https:\/\/sdk-dev\.game-fields\.com https:\/\/dev\.game-fields\.com/);
});

test("SDK preview grants each opaque-origin subresource one path-scoped deterministic capability", () => {
  const scope = {
    instanceId: "creator-lab",
    gameId: "sample-game",
    revision: "a".repeat(40),
  };
  const secret = "test-preview-signing-secret";
  const now = Date.now();
  const mockGrant = {
    version: 4 as const,
    audience: "mock-client" as const,
    environment: "development" as const,
    channel: "candidate-preview" as const,
    role: "client" as const,
    ...scope,
    expiresAt: now + 60_000,
  };
  const capability = createPreviewAssetToken(
    mockGrant,
    "mock",
    "styles.css",
    now,
    secret,
  );

  assert.deepEqual(
    verifyPreviewAssetToken(
      capability.token,
      { ...scope, sourceKind: "mock", assetPath: "styles.css" },
      now,
      secret,
    ),
    { expiresAt: capability.expiresAt, version: "v2" },
  );
  assert.match(capability.token, /^v2\./);
  assert.equal(
    verifyPreviewAssetToken(
      capability.token,
      { ...scope, sourceKind: "package", assetPath: "styles.css" },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      capability.token,
      {
        ...scope,
        gameId: "other-game",
        sourceKind: "mock",
        assetPath: "styles.css",
      },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      capability.token,
      {
        ...scope,
        revision: "b".repeat(40),
        sourceKind: "mock",
        assetPath: "styles.css",
      },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      capability.token,
      { ...scope, sourceKind: "mock", assetPath: "mock.js" },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      capability.token,
      { ...scope, sourceKind: "mock", assetPath: "styles.css" },
      capability.expiresAt,
      secret,
    ),
    null,
  );
  assert.equal(
    previewAssetPath(scope, "styles.css", capability.token),
    `/p/${scope.instanceId}/${scope.gameId}/${scope.revision}/a/${capability.token}/styles.css`,
  );
  assert.equal(
    createPreviewAssetToken(
      mockGrant,
      "mock",
      "styles.css",
      now + 1,
      secret,
    ).token,
    capability.token,
  );
  assert.notEqual(
    createPreviewAssetToken(
      mockGrant,
      "mock",
      "mock.js",
      now,
      secret,
    ).token,
    capability.token,
  );

  const packageCapability = createPreviewAssetToken(
    { ...mockGrant, audience: "package-client" },
    "package",
    "styles.css",
    now,
    secret,
  );
  assert.deepEqual(
    verifyPreviewAssetToken(
      packageCapability.token,
      { ...scope, sourceKind: "package", assetPath: "styles.css" },
      now + 60_001,
      secret,
    ),
    { expiresAt: packageCapability.expiresAt, version: "v2" },
  );
  assert.equal(
    packageAssetPath(scope, "styles.css", packageCapability.token),
    `/package/${scope.instanceId}/${scope.gameId}/${scope.revision}/a/${packageCapability.token}/styles.css`,
  );
  const cacheHeaders = previewAssetCacheHeaders(capability.expiresAt, now);
  assert.match(cacheHeaders["Cache-Control"], /^public, max-age=\d+, must-revalidate, immutable$/);
  assert.match(cacheHeaders["Vercel-CDN-Cache-Control"], /^public, max-age=\d+, must-revalidate$/);
  assert.doesNotMatch(JSON.stringify(cacheHeaders), /stale-while-revalidate|Vary/i);
});

test("SDK preview temporarily accepts legacy revision-wide v1 asset capabilities", () => {
  const scope = {
    instanceId: "creator-lab",
    gameId: "sample-game",
    revision: "a".repeat(40),
  };
  const secret = "test-preview-signing-secret";
  const now = Date.now();
  const expiresAt = now + 8 * 60 * 60 * 1000;
  const token = createLegacyPreviewAssetTokenForTest(
    scope,
    expiresAt,
    secret,
  );

  assert.deepEqual(
    verifyPreviewAssetToken(
      token,
      { ...scope, sourceKind: "package", assetPath: "styles/main.css" },
      now,
      secret,
    ),
    { expiresAt, version: "v1" },
  );
  assert.equal(
    resolvePreviewChildAssetToken(
      token,
      { expiresAt, version: "v1" },
      {
        ...scope,
        sourceKind: "package",
        assetPath: "images/card.png",
      },
      now,
      secret,
    ),
    token,
  );
  assert.deepEqual(
    verifyPreviewAssetToken(
      token,
      { ...scope, sourceKind: "package", assetPath: "images/card.png" },
      now,
      secret,
    ),
    { expiresAt, version: "v1" },
  );
  assert.equal(
    verifyPreviewAssetToken(
      token,
      {
        ...scope,
        gameId: "other-game",
        sourceKind: "package",
        assetPath: "styles/main.css",
      },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      token,
      {
        ...scope,
        revision: "b".repeat(40),
        sourceKind: "package",
        assetPath: "styles/main.css",
      },
      now,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      token,
      { ...scope, sourceKind: "package", assetPath: "styles/main.css" },
      expiresAt,
      secret,
    ),
    null,
  );
  assert.equal(
    verifyPreviewAssetToken(
      `${token}x`,
      { ...scope, sourceKind: "package", assetPath: "styles/main.css" },
      now,
      secret,
    ),
    null,
  );
});

test("SDK preview rewrites HTML, CSS, and module references to exact signed asset paths", () => {
  const signed = (assetPath: string) => `https://preview.example/signed/${assetPath}`;
  const html = rewritePreviewHtmlAssetUrls(
    `<!doctype html><html><head>
      <link rel="stylesheet" href="./styles/main.css">
    </head><body>
      <img src="./images/card.png" alt="">
      <script type="module" src="./client/main.js"></script>
    </body></html>`,
    "index.html",
    signed,
  );
  assert.match(html, /signed\/styles\/main\.css/);
  assert.match(html, /signed\/images\/card\.png/);
  assert.match(html, /signed\/client\/main\.js/);

  const css = rewritePreviewCssAssetUrls(
    `@import "./theme.css"; .card{background:url("../images/card.png#front")}`,
    "styles/main.css",
    signed,
  );
  assert.match(css, /signed\/styles\/theme\.css/);
  assert.match(css, /signed\/images\/card\.png#front/);

  const script = rewritePreviewJavaScriptAssetUrls(
    `import { render } from "./render.js"; export { setup } from "../setup.js"; import("./lazy.js");`,
    "client/main.js",
    signed,
  );
  assert.match(script, /signed\/client\/render\.js/);
  assert.match(script, /signed\/setup\.js/);
  assert.match(script, /signed\/client\/lazy\.js/);

  assert.throws(
    () => rewritePreviewHtmlAssetUrls(
      "<script>window.bad = true</script>",
      "index.html",
      signed,
    ),
    PreviewAssetReferenceError,
  );
  const queriedHtml = rewritePreviewHtmlAssetUrls(
    '<script src="./client.js?v=1#entry"></script>',
    "index.html",
    signed,
  );
  assert.match(queriedHtml, /signed\/client\.js#entry/);
  assert.doesNotMatch(queriedHtml, /signed\/[^"']*\?/);
});
