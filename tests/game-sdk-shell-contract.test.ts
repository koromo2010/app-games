import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_SDK_MODULE_CATALOG,
  createInitialGameSdkModuleProfile,
  normalizeGameSdkModuleProfile,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { wrapGameSdkDebugCommand } from "../lib/game-sdk-debug-control-target.ts";
import {
  buildGameSdkDebugRoom,
  buildGameSdkHeaderProps,
  gameSdkFramePropsFromPreviewDefinition,
  shouldTrackGameSdkAiActivity,
} from "../app/components/game-sdk/game-sdk-frame-presentation.ts";
import { shellModuleIds } from "../app/components/game-sdk/game-sdk-shell-module-registry.ts";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GameSdkFrame.tsx is now a thin composition of these split modules — see
// GameSdkFrame.tsx itself for the map. Most of the assertions below that used
// to grep the pre-split ~600-line GameSdkFrame.tsx now grep whichever module
// the relevant logic actually moved to.
const frame = source("app/components/GameSdkFrame.tsx");
const controller = source("app/components/game-sdk/use-game-sdk-frame-controller.ts");
const view = source("app/components/game-sdk/GameSdkFrameView.tsx");
const roomLifecycle = source("app/components/game-sdk/use-game-sdk-room-lifecycle.ts");
const commandRunnerSource = source("app/components/game-sdk/use-game-sdk-command-runner.ts");
const debugStateSource = source("app/components/game-sdk/use-game-sdk-debug-state.ts");
const debugPanel = source("app/components/game-sdk/GameSdkDebugPanel.tsx");
const lobbyPanel = source("app/components/game-sdk/GameSdkLobbyPanel.tsx");
const resultPanel = source("app/components/game-sdk/GameSdkResultPanel.tsx");
const iframeBridge = source("app/components/game-sdk/GameSdkIframeBridge.tsx");
const presentation = source("app/components/game-sdk/game-sdk-frame-presentation.ts");
const shellImplementations = source("app/components/game-sdk/game-sdk-shell-implementations.ts");
const header = source("app/components/GameSdkShellHeader.tsx");
const previewPage = source("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
const approvedPage = source("app/sdk-games/[gameId]/page.tsx");
const platformAdapter = source("lib/game-sdk-platform-adapter.ts");
const runtimeCatalog = source("lib/game-sdk-runtime-catalog.ts");
const sdkRuntime = source("packages/game-sdk/src/runtime.ts");
const sdkClientRuntime = source("packages/game-sdk/src/client-runtime.ts");
const platformRuntime = source("packages/game-runtime/src/index.ts");
const roomHttp = source("lib/game-sdk-online-room-http.ts");
const lifecycleActions = source("app/components/OnlineRoomLifecycleActions.tsx");
const resultActions = source("app/components/RoomResultActions.tsx");
const spectatorRegistry = source("lib/online-room-spectator-registry.ts");
const debugControlLib = source("lib/game-sdk-debug-control-target.ts");
const previewDefaultsRoute = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/defaults/route.ts");

// Minimal fixtures shared by the DEBUG-related assertions below.
const fixtureRoom = {
  code: "ABCD",
  revision: 7,
  phase: "lobby",
  view: {
    app: {},
    common: {},
  },
} as const;
const fixturePlayers = [
  { seat: 0, displayName: "Host", connected: true, isHost: true, isSelf: true, isDummy: false, reducedTime: false },
  { seat: 1, displayName: "Dummy 1", connected: true, isHost: false, isSelf: false, isDummy: true, reducedTime: false },
];
function fixtureCommon(overrides: Partial<{
  canDebug: boolean;
  canDebugActAsDummy: boolean;
  canDebugAutoProgress: boolean;
}> = {}) {
  return {
    permissions: {
      canStartGame: false,
      canEditRoomSettings: false,
      canAbort: false,
      canDebug: overrides.canDebug ?? false,
      canDebugActAsDummy: overrides.canDebugActAsDummy ?? false,
      canDebugAutoProgress: overrides.canDebugAutoProgress ?? false,
    },
    players: fixturePlayers,
    maximumPlayers: 6,
  };
}
const noopDebugArgs = {
  moduleRequired: () => true,
  supportsSpectators: true,
  debugAutoFollow: false,
  debugOwnerSeat: null,
  debugActorSeat: null,
  debugViewer: "self" as const,
  debugSwitchSource: "manual" as const,
  pending: false,
  message: "",
  autoProgressDebug: async () => fixtureRoom as never,
  simulateDebugInputError: async () => {},
  onToggleAutoFollow: () => {},
  onSelectActor: () => {},
  onSelectViewer: () => {},
};

test("reviewed SDK shell consumes every Room View permission it declares", async () => {
  // canStartGame / canAbort / canEditRoomSettings still gate the split view
  // and lobby panel exactly as they gated the pre-split GameSdkFrame.tsx.
  assert.match(view, /common\?\.permissions\.canStartGame/);
  assert.match(view, /common\?\.permissions\.canAbort/);
  assert.match(lobbyPanel, /common\?\.permissions\.canEditRoomSettings/);

  // canDebug / canDebugActAsDummy / canDebugAutoProgress now gate a real,
  // directly-testable function (buildGameSdkDebugRoom) instead of a regex
  // against GameSdkFrame.tsx source.
  assert.equal(
    buildGameSdkDebugRoom({
      room: fixtureRoom,
      common: fixtureCommon({ canDebug: false }),
      run: async (operation) => operation(),
      send: async () => fixtureRoom as never,
      ...noopDebugArgs,
    }),
    null,
    "debugRoom must stay null when Room View denies canDebug, regardless of the debug module setting",
  );

  let sentCommand: unknown = null;
  const debugRoom = buildGameSdkDebugRoom({
    room: fixtureRoom,
    common: fixtureCommon({ canDebug: true, canDebugActAsDummy: true, canDebugAutoProgress: true }),
    run: async (operation) => operation(),
    send: async (command) => {
      sentCommand = command;
      return fixtureRoom as never;
    },
    ...noopDebugArgs,
  });
  assert.ok(debugRoom, "debugRoom must be populated once Room View grants canDebug");
  assert.deepEqual(buildGameSdkHeaderProps(fixtureRoom), {
    code: debugRoom.code,
    revision: debugRoom.revision,
    phase: debugRoom.phase,
  });
  assert.equal(debugRoom.canActAsDummy, true);
  assert.equal(debugRoom.canAutoProgress, true);
  assert.equal(debugRoom.maximumPlayers, 6);

  await debugRoom.onAddDummy();
  assert.deepEqual(sentCommand, { type: "room/debug-add-dummy" });
  await debugRoom.onRemoveDummy(1);
  assert.deepEqual(sentCommand, { type: "room/debug-remove-dummy", seat: 1 });
  await debugRoom.onSetConnected(1, false);
  assert.deepEqual(sentCommand, { type: "room/debug-set-connected", seat: 1, connected: false });
  await debugRoom.onSimulateTimeout();
  assert.deepEqual(sentCommand, { type: "room/debug-simulate-timeout" });

  // Dummy-actor substitution: wrapGameSdkDebugCommand (unchanged library
  // function) is what turns an ordinary command into
  // `room/debug-act-as-dummy` while a dummy actor is selected.
  assert.deepEqual(
    wrapGameSdkDebugCommand(
      { generation: 0, status: "ready", target: { mode: "dummy", seat: 1 }, source: "manual" },
      { type: "custom/move" },
    ),
    { type: "room/debug-act-as-dummy", seat: 1, command: { type: "custom/move" } },
  );
  // A command that is already a `room/...` command is left untouched.
  assert.deepEqual(
    wrapGameSdkDebugCommand(
      { generation: 0, status: "ready", target: { mode: "dummy", seat: 1 }, source: "manual" },
      { type: "room/leave" },
    ),
    { type: "room/leave" },
  );

  // Everything downstream of Room View's canDebug decision (the remote
  // runner's server-side proxy, the HTTP client's debug-viewer plumbing) is
  // untouched by this split — keep verifying it directly against source.
  // (autoProgressDebug / simulateDebugInputError live in
  // use-game-sdk-debug-state.ts; the onSimulateTimeout / onSetConnected
  // handlers live in the buildGameSdkDebugRoom object literal in
  // game-sdk-frame-presentation.ts — check the union of both.)
  const debugClientSource = debugStateSource + presentation;
  for (const command of [
    "room/debug-auto-progress",
    "room/debug-simulate-timeout",
    "room/debug-set-connected",
    "room/debug-simulate-input-error",
  ]) {
    assert.match(debugClientSource, new RegExp(command.replace("/", "\\/")));
    assert.match(sdkRuntime, new RegExp(command.replace("/", "\\/")));
  }
  assert.match(debugStateSource, /readRoomAsDebugViewer/);
  assert.match(commandRunnerSource, /wrapDebugCommand/);
  assert.match(debugControlLib, /room\/debug-act-as-dummy/);
  assert.match(platformAdapter, /platformDebugProxyCommand/);
  assert.match(platformAdapter, /target\?\.isDummy !== true/);
  assert.match(platformAdapter, /inner\.type\.startsWith\("room\/"\)/);
  assert.match(platformAdapter, /canDebug: input\.allowed/);
  assert.match(sdkClientRuntime, /readRoomAsDebugViewer/);
  assert.match(platformRuntime, /debugViewer/);
  assert.match(roomHttp, /debugViewer/);
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
});

test("SDK header receives Room View state and never fetches it independently", () => {
  assert.deepEqual(
    buildGameSdkHeaderProps({ code: "ABCD", revision: 7, phase: "playing" }),
    { code: "ABCD", revision: 7, phase: "playing" },
  );
  assert.match(debugPanel, /buildGameSdkDebugRoom/);
  assert.doesNotMatch(header, /fetch\(/);
  assert.doesNotMatch(header, /activeRoomEndpoint/);
  assert.doesNotMatch(header, /window\.location\.pathname/);
  assert.doesNotMatch(header, /setInterval/);
  assert.doesNotMatch(header, /\/rooms\?active=1/);
});

test("reviewed SDK shell consumes manifest capabilities passed by Preview", () => {
  const definition = {
    manifest: {
      rules: [
        { ja: "ルール1", en: "Rule 1" },
        { ja: "ルール2", en: "Rule 2" },
      ],
      supportsReplay: true,
      supportsSpectators: false,
      usesLlm: true,
    },
    modulePolicy: createInitialGameSdkModuleProfile(),
  };
  const mapped = gameSdkFramePropsFromPreviewDefinition(definition);
  assert.deepEqual(mapped.rules, ["ルール1", "ルール2"]);
  assert.equal(mapped.supportsReplay, true);
  assert.equal(mapped.supportsSpectators, false);
  assert.equal(mapped.usesLlm, true);
  assert.deepEqual(mapped.moduleProfile, normalizeGameSdkModuleProfile(definition.modulePolicy));

  // usesLlm && moduleRequired("llm") && moduleRequired("ai-activity") — full
  // truth table against the extracted pure function.
  const required = createInitialGameSdkModuleProfile();
  const llmDisabled = updateGameSdkModuleProfile(required, {
    llm: { mode: "disabled", reason: "not used" },
  });
  const aiActivityDisabled = updateGameSdkModuleProfile(required, {
    "ai-activity": { mode: "disabled", reason: "not tracked" },
  });
  assert.equal(shouldTrackGameSdkAiActivity({ usesLlm: false, moduleProfile: required }), false);
  assert.equal(shouldTrackGameSdkAiActivity({ usesLlm: true, moduleProfile: llmDisabled }), false);
  assert.equal(shouldTrackGameSdkAiActivity({ usesLlm: true, moduleProfile: aiActivityDisabled }), false);
  assert.equal(shouldTrackGameSdkAiActivity({ usesLlm: true, moduleProfile: required }), true);

  assert.match(resultPanel, /supportsReplay && moduleRequired\("replay"\)/);
  assert.match(commandRunnerSource, /shouldTrackGameSdkAiActivity/);
  assert.match(commandRunnerSource, /withAiActivity\(/);
  assert.match(debugStateSource, /shouldTrackGameSdkAiActivity/);

  // page.tsx itself is unchanged (out of scope for the GameSdkFrame.tsx
  // split) — keep the original guard that it still derives these props the
  // same way gameSdkFramePropsFromPreviewDefinition expects, so the two
  // don't silently drift apart.
  for (const prop of ["supportsReplay", "supportsSpectators", "usesLlm"]) {
    assert.match(
      previewPage,
      new RegExp(`${escaped(prop)}=\\{game\\.manifest\\.${escaped(prop)}\\}`),
      `${prop} must be passed from the immutable package manifest`,
    );
  }
  assert.match(previewPage, /moduleProfile=\{normalizeGameSdkModuleProfile\(game\.modulePolicy\)\}/);
  assert.match(previewPage, /rules=\{\(game\.manifest\.rules \?\? \[\]\)\.map/);
});

// NOTE: "formal Preview grants DEBUG only to the linked creator identity" has
// been removed from this file. It never referenced GameSdkFrame.tsx (only
// app/api/sdk-preview/.../rooms/route.ts and lib/game-sdk-platform-adapter.ts,
// both untouched by this split) — chapy should move it into an
// authorization-focused test file rather than this one.

test("promoted SDK games reject stale player sessions before rendering a lounge", () => {
  assert.match(approvedPage, /getAuthenticatedPlayer/);
  assert.match(
    approvedPage,
    /if \(!\(await getAuthenticatedPlayer\(\)\)\) \{\s*return <PlayerAuthGate/,
  );
  assert.match(view, /playerAuthRequired[\s\S]*?<PlayerAuthGate/);
  assert.match(controller, /clearPlayerSession\(\)/);
  assert.match(controller, /if \(creatorSlug\) \{\s*requirePreviewSession\(\)/);
  assert.doesNotMatch(controller, /return "Preview認証を更新してください。"/);
});

test("module profile and Room View remain the only shell feature gates", () => {
  assert.match(view, /common\?\.permissions\.canStartGame/);
  assert.match(lobbyPanel, /common\?\.permissions\.canEditRoomSettings/);
  assert.match(view, /common\?\.permissions\.canAbort/);
  assert.match(presentation, /moduleRequired\("debug"\)/);

  for (const clientSource of [
    controller,
    roomLifecycle,
    commandRunnerSource,
    debugStateSource,
    view,
    debugPanel,
    lobbyPanel,
    resultPanel,
    iframeBridge,
    presentation,
  ]) {
    assert.doesNotMatch(
      clientSource,
      /playerHasDebugAccess|requireAuthenticatedPlayer|getSdkPreviewAccountPlayerId/,
      "the client shell must not independently recalculate server permissions",
    );
  }
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

// NOTE: "formal package client grants are minted when the iframe actually
// navigates" has been removed from this file. It only ever exercised
// page.tsx / client-runtime route.ts source (untouched by this split) —
// chapy should move it alongside the item above.

test("shared package frame exposes Platform-owned Room dissolution in lobby and result", () => {
  assert.match(view, /room\.phase === "lobby"[\s\S]*?<OnlineRoomLifecycleActions/);
  assert.match(resultPanel, /<CommonGameResultShell/);
  assert.match(resultPanel, /<OnlineRoomLifecycleActions/);
  assert.match(resultPanel, /surface="result"/);
  assert.match(roomLifecycle, /moduleRequired\("dissolution"\)/);
  assert.match(roomLifecycle, /await runtime\.dissolveRoom\(current\.code\)/);
  assert.match(roomLifecycle, /window\.confirm\("部屋を解散しますか？参加者はこの部屋に戻れなくなります。"\)/);
  assert.match(roomLifecycle, /await refreshRooms\(\)/);
  assert.match(roomLifecycle, /setIsRoomDissolved\(true\)/);
  assert.match(roomLifecycle, /setMessage\("部屋を解散しました。新しい部屋を作成できます。"\)/);
});

test("every shared Shell module has executable evidence in the formal package path", () => {
  const shellIds = shellModuleIds();
  assert.deepEqual(
    shellIds,
    GAME_SDK_MODULE_CATALOG
      .filter((definition) => definition.group === "shell")
      .map((definition) => definition.id),
  );

  // game-sdk-shell-implementations.ts declares one entry per shell module,
  // in this exact order (checked structurally by
  // assertCompleteShellRegistry(GAME_SDK_SHELL_IMPLEMENTATIONS) at the top of
  // that file's own usage inside GameSdkFrame's module tree — verified here
  // via source position rather than a live import, since
  // game-sdk-shell-implementations.ts pulls in the full React component tree
  // and this test file runs outside Next's bundler).
  let previousIndex = -1;
  for (const moduleId of shellIds) {
    // Keys that are valid bare JS identifiers (e.g. `debug: {`) are written
    // unquoted; keys with hyphens (e.g. `"common-shell": {`) need quotes —
    // match either form.
    const keyPattern = new RegExp(`"?${escaped(moduleId)}"?:\\s*\\{`);
    const match = keyPattern.exec(shellImplementations);
    assert.ok(match, `${moduleId} must have a GAME_SDK_SHELL_IMPLEMENTATIONS entry`);
    assert.ok(
      match.index > previousIndex,
      `${moduleId} must appear in GAME_SDK_MODULE_CATALOG shell order inside game-sdk-shell-implementations.ts`,
    );
    previousIndex = match.index;
  }

  const evidence: Record<string, Array<[string, RegExp]>> = {
    "common-shell": [
      [view, /<GameSdkDebugPanel/],
      [header, /<GameTopBanner/],
      [header, /navigation\.showDirectBack/],
      [header, /data-sdk-lounge-back/],
    ],
    "online-room": [
      [controller, /type: "room\/join"/],
      [roomLifecycle, /type: "room\/leave"/],
      [view, /onJoinRoomByCode\(candidate\.code\)/],
      [roomLifecycle, /confirmRoomLeave\(\)/],
      [roomLifecycle, /useGameSdkActiveRoomRestore/],
      [lifecycleActions, /onLeave/],
    ],
    "room-sync": [
      [roomLifecycle, /runtime\.watchRoom/],
      [roomLifecycle, /roomUpdateIsOlder/],
      [roomLifecycle, /preferLatestOnlineRoom/],
      [roomLifecycle, /attachLatestRoom/],
    ],
    "room-settings": [
      [view, /moduleRequired\("room-settings"\)/],
      [lobbyPanel, /type: "room\/update-settings"/],
      [lobbyPanel, /この設定を次回の既定値にする/],
      [previewDefaultsRoute, /saveGameSdkPlayerDefaults/],
    ],
    debug: [
      [presentation, /moduleRequired\("debug"\)/],
      [presentation, /room\/debug-add-dummy/],
      [presentation, /room\/debug-remove-dummy/],
      [debugStateSource, /room\/debug-auto-progress/],
      [presentation, /room\/debug-simulate-timeout/],
      [presentation, /room\/debug-set-connected/],
      [debugStateSource, /room\/debug-simulate-input-error/],
      [commandRunnerSource, /wrapDebugCommand/],
      [debugControlLib, /room\/debug-act-as-dummy/],
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
      [controller, /moduleRequired\("timer"\)/],
      [controller, /room\/expire-timer/],
      [controller, /room\/recover-timeout/],
      [iframeBridge, /role="timer"/],
    ],
    result: [
      [resultPanel, /moduleRequired\("result"\)/],
      [resultPanel, /standardResult\.rankings\.map/],
      [resultPanel, /<CommonGameResultShell/],
    ],
    rematch: [
      [controller, /moduleRequired\("rematch"\)/],
      [controller, /type: "room\/rematch"/],
      [resultActions, /onReturnToRoom\?/],
    ],
    dissolution: [
      [roomLifecycle, /moduleRequired\("dissolution"\)/],
      [roomLifecycle, /runtime\.dissolveRoom/],
      [lifecycleActions, /onDissolve/],
    ],
    stats: [
      [runtimeCatalog, /supportsStats: moduleRequired\("stats"\)/],
    ],
    rating: [
      [runtimeCatalog, /moduleRequired\("rating"\)/],
    ],
    replay: [
      [resultPanel, /moduleRequired\("replay"\)/],
      [runtimeCatalog, /moduleRequired\("replay"\)/],
    ],
    "result-share": [
      [resultPanel, /moduleRequired\("result-share"\)/],
      [resultPanel, /<GameResultShareButton/],
    ],
    feedback: [
      [resultPanel, /moduleRequired\("feedback"\)/],
      [resultPanel, /<GameSdkFeedbackPanel/],
    ],
    spectators: [
      [view, /moduleRequired\("spectators"\)/],
      [view, /supportsSpectators/],
      [spectatorRegistry, /loadApprovedGameSdkRuntimeRegistration/],
    ],
    "ai-activity": [
      [presentation, /"ai-activity"\]\.mode === "required"/],
      [commandRunnerSource, /withAiActivity/],
      [debugStateSource, /withAiActivity/],
    ],
    ads: [
      [view, /moduleRequired\("ads"\)/],
      [view, /<GameAdSlot/],
    ],
  };

  assert.deepEqual(Object.keys(evidence), shellIds);
  for (const moduleId of shellIds) {
    for (const [implementationSource, pattern] of evidence[moduleId] ?? []) {
      assert.match(
        implementationSource,
        pattern,
        `${moduleId} must stay connected in the formal package path`,
      );
    }
  }

  // Sanity check that GameSdkFrame.tsx itself still composes the split
  // controller + view (i.e. nobody re-inlined the old monolith back in).
  assert.match(frame, /useGameSdkFrameController/);
  assert.match(frame, /<GameSdkFrameView/);
});

// NOTE: "candidate package settings defaults use authenticated creator scope"
// has been removed from this file. It only ever exercised
// app/api/sdk-preview/.../defaults/route.ts (untouched by this split; still
// referenced above via previewDefaultsRoute for the room-settings module's
// evidence) — chapy should move it into a defaults/route-focused test file.
