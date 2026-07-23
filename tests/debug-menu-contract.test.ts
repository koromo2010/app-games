import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ゲーム固有デバッグ操作は共通DEBUGメニューの拡張枠へ表示する", () => {
  const source = read("app/components/DebugModeButton.tsx");

  assert.match(source, /gameTools\?: ReactNode/);
  assert.match(source, /wordGenerationTools\?: ReactNode/);
  assert.match(source, /enabled && gameTools/);
  assert.match(source, /enabled && wordGenerationTools/);
});

test("共通DEBUGメニューはゲーム操作を妨げない画面内ウィンドウとして表示する", () => {
  const buttonSource = read("app/components/DebugModeButton.tsx");
  const windowSource = read("app/components/DebugToolWindow.tsx");

  assert.match(buttonSource, /<DebugToolWindow/);
  assert.match(windowSource, /role="dialog"/);
  assert.doesNotMatch(windowSource, /aria-modal="true"/);
  assert.doesNotMatch(windowSource, /fixed inset-0/);
  assert.match(windowSource, /className="fixed z-\[9999\] flex flex-col /);
  assert.match(windowSource, /className="min-h-0 w-full min-w-0 flex-1 /);
  assert.match(windowSource, /kind: "move" \| "resize"/);
  assert.match(windowSource, /setIsMinimized/);
  assert.match(windowSource, /handleOutsidePointerDown/);
  assert.match(windowSource, /windowRef\.current\?\.contains\(event\.target\)/);
  assert.match(windowSource, /document\.addEventListener\("pointerdown", handleOutsidePointerDown, true\)/);
  assert.match(windowSource, /setPointerCapture/);
});

test("DBワード生成テストは明示的に対応したDEBUGメニューだけへ接続する", () => {
  const supportedSources = [
    read("app/wordwolf/WordWolfHeader.tsx"),
    read("app/code-intercept/CodeInterceptDesktopLayout.tsx"),
    read("app/tahoiya/TahoiyaDesktopLayout.tsx"),
  ];

  for (const source of supportedSources) assert.match(source, /wordGenerationTools=/);

  for (const path of [
    "app/wordwolf/WordWolfLobbySettings.tsx",
    "app/wordwolf/WordWolfRoomSidebar.tsx",
    "app/hodoai-talk/HodoaiPlayPanels.tsx",
    "app/tahoiya/TahoiyaRoomPanel.tsx",
    "app/tahoiya/TahoiyaRoundOverview.tsx",
    "app/tahoiya/TahoiyaWritingPanel.tsx",
    "app/tahoiya/TahoiyaVotingPanel.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /DebugWordGenerationTest/);
    assert.doesNotMatch(source, /type:\s*"debug-/);
  }
});

test("たほい屋のダミー管理は共通DEBUGメニューへ接続する", () => {
  const layoutSource = read("app/tahoiya/TahoiyaDesktopLayout.tsx");
  const gameToolsSource = read("app/tahoiya/TahoiyaDebugTools.tsx");
  const actionSource = read("app/tahoiya/use-tahoiya-lobby-actions.ts");
  const storeSource = read("lib/tahoiya-room-store.ts");

  assert.match(layoutSource, /debugParticipants=\{room\.players\.filter\(isOnlineRoomDebugPlayer\)\}/);
  assert.match(layoutSource, /onAddDebugParticipant=\{actions\.addTestPlayer\}/);
  assert.match(layoutSource, /onRemoveDebugParticipant=\{actions\.removeTestPlayer\}/);
  assert.doesNotMatch(gameToolsSource, /onAddTestPlayer/);
  assert.match(actionSource, /type:\s*"debug-remove-player"/);
  assert.match(storeSource, /applyOnlineRoomDebugParticipantCommand/);
  assert.match(storeSource, /withTahoiyaDebugParticipants/);
});

test("公開オンラインゲームのダミー管理は共通DEBUGメニューへ接続する", () => {
  const targets = [
    ["app/hodoai-talk/HodoaiDesktopLayout.tsx", "lib/hodoai-room-store.ts"],
    ["app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx", "lib/kotoba-senpuku-room-store.ts"],
    ["app/nigoichi/NigoichiDesktopLayout.tsx", "lib/nigoichi-room-store.ts"],
    ["app/daifugo/DaifugoDesktopLayout.tsx", "lib/daifugo-room-store.ts"],
  ] as const;

  for (const [layoutPath, storePath] of targets) {
    const layoutSource = read(layoutPath);
    const storeSource = read(storePath);

    assert.match(layoutSource, /debugParticipants=\{room\.players\.filter\(isOnlineRoomDebugPlayer\)\}/);
    assert.match(layoutSource, /onAddDebugParticipant=/);
    assert.match(layoutSource, /onRemoveDebugParticipant=/);
    assert.doesNotMatch(layoutSource, /<DebugToolButton[^>]+debug-add-player/);
    assert.match(storeSource, /applyOnlineRoomDebugParticipantCommand/);
  }
});

test("privateオンラインゲームも共通ダミー参加者Commandへ接続する", () => {
  const targets = [
    [
      "app/northern-branch/NorthernBranchDesktopLayout.tsx",
      "lib/northern-branch-room-store.ts",
    ],
    [
      "app/code-intercept/CodeInterceptDesktopLayout.tsx",
      "lib/code-intercept-room-store.ts",
    ],
  ] as const;

  for (const [layoutPath, storePath] of targets) {
    const layoutSource = read(layoutPath);
    const storeSource = read(storePath);

    assert.match(layoutSource, /debugParticipants=\{room\.players\.filter\(isOnlineRoomDebugPlayer\)\}/);
    assert.match(layoutSource, /onAddDebugParticipant=/);
    assert.match(layoutSource, /onRemoveDebugParticipant=/);
    assert.doesNotMatch(layoutSource, /<DebugToolButton[^>]+debug-add-player/);
    assert.match(storeSource, /applyOnlineRoomDebugParticipantCommand/);
    assert.match(storeSource, /releaseOnlineRoomDebugParticipantActiveRooms/);
  }
});

test("ダミー参加者の認可・削除・active-room整理は共通application層が担う", () => {
  const source = read("lib/online-room-debug-participants.ts");

  assert.match(source, /canRemoveOnlineRoomDebugPlayer/);
  assert.match(source, /removeOnlineRoomDebugParticipants/);
  assert.match(source, /releaseOnlineRoomDebugParticipantActiveRooms/);
  assert.match(source, /onlineRoomNonDebugPlayerActiveRoomKeys/);
});
