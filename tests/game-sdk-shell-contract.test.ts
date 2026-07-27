import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GAME_SDK_MODULE_CATALOG } from "@game-fields/game-sdk/modules";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const frame = source("app/components/GameSdkFrame.tsx");
const header = source("app/components/GameSdkShellHeader.tsx");
const previewPage = source("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
const approvedPage = source("app/sdk-games/[gameId]/page.tsx");
const previewClientRuntimeRoute = source(
  "app/api/sdk-preview/[creatorSlug]/games/[gameId]/client-runtime/route.ts",
);
const approvedClientRuntimeRoute = source(
  "app/api/game-sdk/[gameId]/client-runtime/route.ts",
);
const previewRoomRoute = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts");
const previewDefaultsRoute = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/defaults/route.ts");
const platformAdapter = source("lib/game-sdk-platform-adapter.ts");
const runtimeCatalog = source("lib/game-sdk-runtime-catalog.ts");
const sdkRuntime = source("packages/game-sdk/src/runtime.ts");
const sdkClientRuntime = source("packages/game-sdk/src/client-runtime.ts");
const platformRuntime = source("packages/game-runtime/src/index.ts");
const roomHttp = source("lib/game-sdk-online-room-http.ts");
const lifecycleActions = source("app/components/OnlineRoomLifecycleActions.tsx");
const resultActions = source("app/components/RoomResultActions.tsx");
const spectatorRegistry = source("lib/online-room-spectator-registry.ts");

test("reviewed SDK shell consumes every Room View permission it declares", () => {
  for (const permission of [
    "canStartGame",
    "canEditRoomSettings",
    "canAbort",
    "canDebug",
    "canDebugActAsDummy",
    "canDebugAutoProgress",
  ]) {
    assert.match(
      frame,
      new RegExp(`permissions\\.${escaped(permission)}`),
      `${permission} must control the reviewed SDK shell`,
    );
  }

  assert.match(
    frame,
    /debugRoom=\{moduleRequired\("debug"\) && common\?\.permissions\.canDebug \? \{/,
  );
  assert.match(header, /debugRoom\?: GameSdkDebugRoom \| null/);
  assert.match(header, /DEBUG · ON/);
  assert.match(header, /DebugParticipantControls/);
  for (const marker of [
    "閲覧視点",
    "操作対象",
    "playing中は、選択したダミーとしてゲーム内の合法手を送信できます。",
    "1手だけ自動進行",
    "次の主要状態まで進める",
    "結果まで自動進行",
    "現在手番の時間切れを再現",
    "不正入力の拒否を確認",
    "切断を再現",
  ]) {
    assert.match(header, new RegExp(marker));
  }
  for (const command of [
    "room/debug-auto-progress",
    "room/debug-simulate-timeout",
    "room/debug-set-connected",
    "room/debug-simulate-input-error",
  ]) {
    assert.match(frame, new RegExp(command.replace("/", "\\/")));
    assert.match(sdkRuntime, new RegExp(command.replace("/", "\\/")));
  }
  assert.match(frame, /readRoomAsDebugViewer/);
  assert.match(frame, /room\/debug-act-as-dummy/);
  assert.match(platformAdapter, /platformDebugProxyCommand/);
  assert.match(platformAdapter, /target\?\.isDummy !== true/);
  assert.match(platformAdapter, /inner\.type\.startsWith\("room\/"\)/);
  assert.match(platformAdapter, /canDebug: input\.allowed/);
  assert.match(sdkClientRuntime, /readRoomAsDebugViewer/);
  assert.match(platformRuntime, /debugViewer/);
  assert.match(roomHttp, /debugViewer/);
});

test("SDK header receives Room View state and never fetches it independently", () => {
  assert.match(frame, /code: room\.code,[\s\S]*revision: room\.revision,[\s\S]*phase: room\.phase/);
  assert.doesNotMatch(header, /fetch\(/);
  assert.doesNotMatch(header, /activeRoomEndpoint/);
  assert.doesNotMatch(header, /window\.location\.pathname/);
  assert.doesNotMatch(header, /setInterval/);
  assert.doesNotMatch(header, /\/rooms\?active=1/);
});

test("reviewed SDK shell consumes manifest capabilities passed by Preview", () => {
  for (const prop of ["supportsReplay", "supportsSpectators", "usesLlm"]) {
    assert.match(
      previewPage,
      new RegExp(`${escaped(prop)}=\\{game\\.manifest\\.${escaped(prop)}\\}`),
      `${prop} must be passed from the immutable package manifest`,
    );
  }

  assert.match(frame, /supportsReplay && moduleRequired\("replay"\)/);
  assert.match(
    frame,
    /usesLlm[\s\S]*?moduleRequired\("llm"\)[\s\S]*?moduleRequired\("ai-activity"\)/,
  );
  assert.match(frame, /withAiActivity\(/);
  assert.match(previewPage, /moduleProfile=\{normalizeGameSdkModuleProfile\(game\.modulePolicy\)\}/);
  assert.match(previewPage, /rules=\{\(game\.manifest\.rules \?\? \[\]\)\.map/);
});

test("formal Preview grants DEBUG only to the linked creator identity", () => {
  assert.match(previewRoomRoute, /getSdkPreviewAccountPlayerId\(creatorSlug\)/);
  assert.match(previewRoomRoute, /debugAccess: creatorPlayerId === session\.id/);
  assert.match(
    previewRoomRoute,
    /gameSdkModuleIsRequired\([\s\S]*?"debug"/,
  );
  assert.doesNotMatch(previewRoomRoute, /debugAccess:\s*true/);

  assert.match(platformAdapter, /module\.manifest\.supportsDebug/);
  assert.match(platformAdapter, /debugAccess: supportsDebug \? await playerHasDebugAccess/);
});

test("promoted SDK games reject stale player sessions before rendering a lounge", () => {
  assert.match(approvedPage, /getAuthenticatedPlayer/);
  assert.match(
    approvedPage,
    /if \(!\(await getAuthenticatedPlayer\(\)\)\) \{\s*return <PlayerAuthGate/,
  );
  assert.match(frame, /playerAuthRequired[\s\S]*?<PlayerAuthGate/);
  assert.match(frame, /clearPlayerSession\(\)/);
  assert.match(frame, /if \(creatorSlug\) \{\s*requirePreviewSession\(\)/);
  assert.doesNotMatch(frame, /return "Preview認証を更新してください。"/);
});

test("module profile and Room View remain the only shell feature gates", () => {
  assert.match(frame, /moduleProfile\[id\]\.mode === "required"/);
  assert.match(frame, /common\?\.permissions\.canStartGame/);
  assert.match(frame, /common\?\.permissions\.canEditRoomSettings/);
  assert.match(frame, /common\?\.permissions\.canAbort/);
  assert.match(frame, /common\?\.permissions\.canDebug/);

  assert.doesNotMatch(
    frame,
    /playerHasDebugAccess|requireAuthenticatedPlayer|getSdkPreviewAccountPlayerId/,
    "the client shell must not independently recalculate server permissions",
  );
});

test("formal Preview packages and promoted packages share GameSdkFrame", () => {
  assert.match(previewPage, /game\.runtimeKind === "package" && game\.revision && game\.manifest/);
  assert.match(
    previewPage,
    /game\.runtimeKind === "package"[\s\S]*?<GameSdkFrame[\s\S]*?creatorSlug=\{creatorSlug\}/,
  );
  assert.match(
    approvedPage,
    /registration\.clientKind === "iframe-package"[\s\S]*?<GameSdkFrame/,
  );
});

test("formal package client grants are minted when the iframe actually navigates", () => {
  assert.match(
    previewPage,
    /runtimeUrl=\{`\/api\/sdk-preview\/\$\{encodeURIComponent\([\s\S]*?client-runtime\?revision=/,
  );
  assert.match(
    approvedPage,
    /runtimeUrl=\{`\/api\/game-sdk\/\$\{encodeURIComponent\([\s\S]*?client-runtime\?revision=/,
  );
  assert.doesNotMatch(
    approvedPage,
    /runtimeUrl=\{registration\.clientRuntimeUrl\}/,
  );

  assert.match(
    previewClientRuntimeRoute,
    /requireSdkPreviewAuthenticatedPlayer\(creatorSlug\)/,
  );
  assert.match(
    previewClientRuntimeRoute,
    /loadSdkPreviewRuntimeDefinition\([\s\S]*?revision/,
  );
  assert.match(
    approvedClientRuntimeRoute,
    /requireAuthenticatedPlayer\(\)/,
  );
  assert.match(
    approvedClientRuntimeRoute,
    /loadApprovedGameSdkRuntimeRegistration\([\s\S]*?revision/,
  );
  for (const route of [
    previewClientRuntimeRoute,
    approvedClientRuntimeRoute,
  ]) {
    assert.match(route, /status: 307/);
    assert.match(
      route,
      /Location: (?:definition\.runtimeUrl|registration\.clientRuntimeUrl)/,
    );
    assert.match(route, /"Cache-Control": "private, no-store"/);
    assert.match(route, /"Referrer-Policy": "no-referrer"/);
  }
});

test("shared package frame exposes Platform-owned Room dissolution in lobby and result", () => {
  assert.match(frame, /<OnlineRoomLifecycleActions/);
  assert.match(
    frame,
    /surface=\{room\.phase === "result" \? "result" : room\.phase === "lobby" \? "lobby" : "playing"\}/,
  );
  assert.match(frame, /moduleRequired\("dissolution"\)/);
  assert.match(frame, /await runtime\.dissolveRoom\(current\.code\)/);
  assert.match(frame, /window\.confirm\("部屋を解散しますか？参加者はこの部屋に戻れなくなります。"\)/);
  assert.match(frame, /await refreshRooms\(\)/);
  assert.match(frame, /setIsRoomDissolved\(true\)/);
  assert.match(frame, /setMessage\("部屋を解散しました。新しい部屋を作成できます。"\)/);
});

test("every shared Shell module has executable evidence in the formal package path", () => {
  const shellModuleIds = GAME_SDK_MODULE_CATALOG
    .filter((definition) => definition.group === "shell")
    .map((definition) => definition.id);
  const evidence: Record<string, Array<[string, RegExp]>> = {
    "common-shell": [
      [frame, /<GameSdkShellHeader/],
      [header, /<GameTopBanner/],
    ],
    "online-room": [
      [frame, /type: "room\/join"/],
      [frame, /type: "room\/leave"/],
      [frame, /joinRoomByCode\(candidate\.code\)/],
      [frame, /confirmRoomLeave\(\)/],
      [frame, /useGameSdkActiveRoomRestore/],
      [lifecycleActions, /onLeave/],
    ],
    "room-sync": [
      [frame, /runtime\.watchRoom/],
      [frame, /roomUpdateIsOlder/],
      [frame, /preferLatestOnlineRoom/],
      [frame, /attachLatestRoom/],
    ],
    "room-settings": [
      [frame, /moduleRequired\("room-settings"\)/],
      [frame, /type: "room\/update-settings"/],
      [frame, /この設定を次回の既定値にする/],
      [previewDefaultsRoute, /saveGameSdkPlayerDefaults/],
    ],
    debug: [
      [frame, /moduleRequired\("debug"\)/],
      [frame, /room\/debug-add-dummy/],
      [frame, /room\/debug-remove-dummy/],
      [frame, /room\/debug-auto-progress/],
      [frame, /room\/debug-simulate-timeout/],
      [frame, /room\/debug-set-connected/],
      [frame, /room\/debug-simulate-input-error/],
      [frame, /room\/debug-act-as-dummy/],
      [header, /DebugParticipantControls/],
      [header, /閲覧視点/],
      [header, /操作対象/],
      [header, /次の主要状態まで進める/],
      [sdkClientRuntime, /readRoomAsDebugViewer/],
      [platformRuntime, /debugViewer/],
      [platformAdapter, /platformDebugProxyCommand/],
      [platformAdapter, /canDebugActAsDummy/],
      [sdkRuntime, /canDebug:[\s\S]*manifest\.supportsDebug[\s\S]*context\.viewer\.debugAccess[\s\S]*isHost/],
    ],
    timer: [
      [frame, /moduleRequired\("timer"\)/],
      [frame, /room\/expire-timer/],
      [frame, /room\/recover-timeout/],
      [frame, /role="timer"/],
    ],
    result: [
      [frame, /moduleRequired\("result"\)/],
      [frame, /standardResult\.rankings\.map/],
    ],
    rematch: [
      [frame, /moduleRequired\("rematch"\)/],
      [frame, /type: "room\/rematch"/],
      [resultActions, /onReturnToRoom\?/],
    ],
    dissolution: [
      [frame, /moduleRequired\("dissolution"\)/],
      [frame, /runtime\.dissolveRoom/],
      [lifecycleActions, /onDissolve/],
    ],
    stats: [
      [runtimeCatalog, /supportsStats: moduleRequired\("stats"\)/],
    ],
    rating: [
      [runtimeCatalog, /moduleRequired\("rating"\)/],
    ],
    replay: [
      [frame, /moduleRequired\("replay"\)/],
      [runtimeCatalog, /moduleRequired\("replay"\)/],
    ],
    "result-share": [
      [frame, /moduleRequired\("result-share"\)/],
      [frame, /<GameResultShareButton/],
    ],
    feedback: [
      [frame, /moduleRequired\("feedback"\)/],
      [frame, /<GameSdkFeedbackPanel/],
    ],
    spectators: [
      [frame, /moduleRequired\("spectators"\)/],
      [frame, /supportsSpectators/],
      [spectatorRegistry, /loadApprovedGameSdkRuntimeRegistration/],
    ],
    "ai-activity": [
      [frame, /moduleRequired\("ai-activity"\)/],
      [frame, /withAiActivity/],
    ],
    ads: [
      [frame, /moduleRequired\("ads"\)/],
      [frame, /<GameAdSlot/],
    ],
  };

  assert.deepEqual(Object.keys(evidence), shellModuleIds);
  for (const moduleId of shellModuleIds) {
    for (const [implementationSource, pattern] of evidence[moduleId] ?? []) {
      assert.match(
        implementationSource,
        pattern,
        `${moduleId} must stay connected in the formal package path`,
      );
    }
  }
});

test("candidate package settings defaults use authenticated creator scope", () => {
  assert.match(previewDefaultsRoute, /requireSdkPreviewAuthenticatedPlayer/);
  assert.match(previewDefaultsRoute, /sdkPreviewPackageRuntimeId/);
  assert.match(previewDefaultsRoute, /gameSdkModuleIsRequired\(definition\.modulePolicy, "room-settings"\)/);
  assert.match(previewDefaultsRoute, /loadGameSdkPlayerDefaults/);
  assert.match(previewDefaultsRoute, /saveGameSdkPlayerDefaults/);
});
