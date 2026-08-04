import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const nativeResultSources = [
  "app/wordwolf/WordWolfResultPanel.tsx",
  "app/tahoiya/TahoiyaResultPanel.tsx",
  "app/daifugo/DaifugoDesktopLayout.tsx",
  "app/hodoai-talk/HodoaiDesktopLayout.tsx",
  "app/nigoichi/NigoichiDesktopLayout.tsx",
  "app/code-intercept/CodeInterceptDesktopLayout.tsx",
  "app/northern-branch/NorthernBranchDesktopLayout.tsx",
  "app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx",
];

const resultShell = source("app/components/CommonGameResultShell.tsx");
const sdkResultPanel = source("app/components/game-sdk/GameSdkResultPanel.tsx");
const sdkFrameView = source("app/components/game-sdk/GameSdkFrameView.tsx");
const sdkPreviewPage = source("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");

test("the common result shell stays a thin layout and action boundary", () => {
  assert.match(resultShell, /data-common-game-result-shell/);
  assert.match(resultShell, /data-result-content/);
  assert.match(resultShell, /data-result-utilities/);
  assert.match(resultShell, /data-result-actions/);
  assert.doesNotMatch(resultShell, /rankings|scores|votes|winnerSeats|finishOrder/);
});

test("every native online result screen uses the common shell", () => {
  for (const path of nativeResultSources) {
    assert.match(source(path), /CommonGameResultShell/, path);
  }
});

test("Word Wolf and Tahoiya render result actions only inside their result panels", () => {
  assert.doesNotMatch(source("app/wordwolf/WordWolfRoomSidebar.tsx"), /room\.phase === "result" \? "result"/);
  assert.doesNotMatch(source("app/tahoiya/TahoiyaRoomPanel.tsx"), /room\.phase === "result" \? "result"/);
  assert.match(source("app/wordwolf/WordWolfResultPanel.tsx"), /actions=\{<OnlineRoomLifecycleActions surface="result"/);
  assert.match(source("app/tahoiya/TahoiyaResultPanel.tsx"), /actions=\{<OnlineRoomLifecycleActions surface="result"/);
});

test("formal package Rooms use one SDK result shell and one result action set", () => {
  assert.match(sdkPreviewPage, /game\.runtimeKind === "package"[\s\S]*?<GameSdkFrame/);
  assert.match(sdkResultPanel, /<CommonGameResultShell/);
  assert.equal((sdkResultPanel.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.doesNotMatch(sdkFrameView, /room\.phase === "result" && standardResult/);
  assert.match(sdkFrameView, /room\.phase === "lobby" && \([\s\S]*?<OnlineRoomLifecycleActions/);
});

test("server-projected result fields are passed through without shell recalculation", () => {
  assert.match(sdkResultPanel, /standardResult\.rankings\.map/);
  assert.match(sdkResultPanel, /ranking\.rank/);
  assert.match(sdkResultPanel, /ranking\.score/);
  assert.doesNotMatch(sdkResultPanel, /sort\(|reduce\(|tally|calculate|recalculate/);
});

test("result surfaces keep their saved details and logs inside the shared result boundary", () => {
  const northern = source("app/northern-branch/NorthernBranchDesktopLayout.tsx");
  const codeIntercept = source("app/code-intercept/CodeInterceptDesktopLayout.tsx");
  const hodoai = source("app/hodoai-talk/HodoaiDesktopLayout.tsx");

  assert.match(northern, /room\.phase === "finished" && winner && <CommonGameResultShell/);
  assert.match(northern, /game\.log\.slice/);
  assert.match(northern, /最終順位/);
  assert.match(codeIntercept, /room\.phase === "game-result" && <CommonGameResultShell/);
  assert.match(codeIntercept, /latestRound\.teams\.map/);
  assert.match(codeIntercept, /TeamRoundHistoryTable/);
  assert.match(codeIntercept, /参加者/);
  assert.match(hodoai, /latestResult\.clueRounds\.map/);
  assert.match(hodoai, /hodoai-result-log/);
});
