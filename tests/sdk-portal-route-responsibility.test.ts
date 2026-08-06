import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  creatorEnvironmentPath,
  creatorGameFormalRoomPath,
  creatorGameModulesPath,
  creatorGamePreviewPath,
  creatorPreviewSurfaceIdentity,
} from "../apps/sdk-portal/lib/creator-game-route-contract.ts";
import { candidatePackagePreviewPath } from "../apps/sdk-portal/lib/game-package-store.ts";

const revision = "a".repeat(40);
const identity = { creatorSlug: "test10-1", gameId: "link-lines", revision };
const read = (path: string) => readFileSync(path, "utf8");

test("creator, modules, Preview, and formal Room have deterministic distinct URLs", () => {
  assert.equal(creatorEnvironmentPath(identity.creatorSlug), "/test10-1");
  assert.equal(
    creatorGameModulesPath(identity),
    "/test10-1/games/link-lines?view=modules",
  );
  assert.equal(
    creatorGamePreviewPath(identity),
    `/test10-1/games/link-lines?view=preview&revision=${revision}`,
  );
  assert.equal(
    creatorGameFormalRoomPath(identity),
    `/test10-1/games/link-lines?revision=${revision}`,
  );
  assert.equal(candidatePackagePreviewPath(identity), creatorGamePreviewPath(identity));
});

test("creator environment remains stable and dashboard actions do not share hrefs", () => {
  const creatorPage = read("apps/sdk-portal/app/[instanceId]/page.tsx");
  const dashboard = read("apps/sdk-portal/app/dashboard/page.tsx");
  assert.doesNotMatch(creatorPage, /creatorGames\.length === 1/);
  assert.doesNotMatch(creatorPage, /packageReadyGames/);
  assert.match(dashboard, /creatorEnvironmentPath\(game\.creatorSlug\)/);
  assert.match(dashboard, /creatorGameModulesPath/);
  assert.match(dashboard, /creatorGamePreviewPath/);
  assert.match(dashboard, /creatorGameFormalRoomPath/);
});

test("game detail keeps modules, client Preview, and formal Room as separate states", () => {
  const portalPage = read("apps/sdk-portal/app/[instanceId]/games/[gameId]/page.tsx");
  const platformPage = read("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
  assert.match(portalPage, /requestedView === "modules"/);
  assert.match(portalPage, /requestedView === "preview"/);
  assert.match(portalPage, /moduleView && Boolean\(requestedRevision\)/);
  assert.match(portalPage, /previewView && !requestedRevision/);
  assert.match(portalPage, /previewQuery\.set\("view", "preview"\)/);
  assert.match(platformPage, /game\.runtimeKind === "package" && game\.revision && game\.manifest && !previewOnly/);
  assert.match(platformPage, /<SdkPreviewGameShell/);
  assert.match(platformPage, /previewIdentity=/);
});

test("Preview identity is explicit and excludes formal Room", () => {
  assert.deepEqual(
    creatorPreviewSurfaceIdentity({ ...identity, environment: "development" }),
    {
      creatorSlug: "test10-1",
      gameId: "link-lines",
      revision,
      environment: "development",
      surface: "preview",
      formalRoom: false,
    },
  );
  const shell = read("app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx");
  assert.match(shell, /data-sdk-preview-identity/);
  assert.match(shell, /制作確認用Preview · 正式Roomではありません/);
});

test("existing Room recovery is formal-only and labels match their actual targets", () => {
  const frame = read("app/components/game-sdk/GameSdkFrameView.tsx");
  const revisionPanel = read("app/components/game-sdk/GameSdkPackageRevisionPanel.tsx");
  assert.match(frame, /既存Roomへの復帰を確認中/);
  assert.match(frame, /制作確認用Previewとは別の状態/);
  assert.doesNotMatch(frame, /前の部屋を確認中/);
  assert.match(frame, /制作環境へ戻る/);
  assert.match(revisionPanel, /制作環境へ戻る/);
});

test("external Portal navigation escapes the Platform iframe and preserves revision", () => {
  const lobbyAccount = read("app/games/LobbyAccountMenu.tsx");
  const unavailable = read("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
  const sessionGate = read("app/sdk-preview/SdkPreviewSessionGate.tsx");
  assert.match(lobbyAccount, /sdkDashboardHref && <a href=\{props\.sdkDashboardHref\} target="_top"/);
  assert.match(unavailable, /href=\{portalHref\} target="_top"/);
  assert.match(unavailable, /portalQuery\.set\("revision", revision\)/);
  assert.match(sessionGate, /href=\{portalHref\}[\s\S]*target="_top"/);
});

test("Runtime package UI explains revision, current use, update, and deletion policy", () => {
  const panel = read("apps/sdk-portal/app/[instanceId]/games/[gameId]/GamePackageRevisionExport.tsx");
  assert.match(panel, /Runtime package（実行・検査用履歴）/);
  assert.match(panel, /対象revision/);
  assert.match(panel, /現在の提出候補/);
  assert.match(panel, /保存履歴。現在のRuntimeでは未選択/);
  assert.match(panel, /更新: 内容変更時に新revisionを追加/);
  assert.match(panel, /個別revision削除: 不可/);
  assert.match(panel, /開始済みRoomの固定契約と監査証跡/);
  assert.match(panel, /creatorGamePreviewPath/);
  assert.match(panel, /creatorGameFormalRoomPath/);
});
