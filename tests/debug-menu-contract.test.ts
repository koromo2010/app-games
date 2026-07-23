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
