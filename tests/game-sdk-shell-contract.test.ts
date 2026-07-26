import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
const previewRoomRoute = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts");
const platformAdapter = source("lib/game-sdk-platform-adapter.ts");

test("reviewed SDK shell consumes every Room View permission it declares", () => {
  for (const permission of [
    "canStartGame",
    "canEditRoomSettings",
    "canAbort",
    "canDebug",
  ]) {
    assert.match(
      frame,
      new RegExp(`permissions\\.${escaped(permission)}`),
      `${permission} must control the reviewed SDK shell`,
    );
  }

  assert.match(frame, /debugRoom=\{common\?\.permissions\.canDebug \? \{/);
  assert.match(header, /debugRoom\?: GameSdkDebugRoom \| null/);
  assert.match(header, /DEBUG · ON/);
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
  for (const prop of ["supportsReplay", "usesLlm"]) {
    assert.match(
      previewPage,
      new RegExp(`${escaped(prop)}=\\{game\\.manifest\\.${escaped(prop)}\\}`),
      `${prop} must be passed from the immutable package manifest`,
    );
  }

  assert.match(frame, /supportsReplay && moduleRequired\("replay"\)/);
  assert.match(frame, /usesLlm && moduleRequired\("ai-activity"\)/);
  assert.match(frame, /withAiActivity\(/);
  assert.match(previewPage, /moduleProfile=\{normalizeGameSdkModuleProfile\(game\.modulePolicy\)\}/);
  assert.match(previewPage, /rules=\{\(game\.manifest\.rules \?\? \[\]\)\.map/);
});

test("formal Preview grants DEBUG only to the linked creator identity", () => {
  assert.match(previewRoomRoute, /getSdkPreviewAccountPlayerId\(creatorSlug\)/);
  assert.match(previewRoomRoute, /debugAccess: creatorPlayerId === session\.id/);
  assert.doesNotMatch(previewRoomRoute, /debugAccess:\s*true/);

  assert.match(platformAdapter, /module\.manifest\.supportsDebug/);
  assert.match(platformAdapter, /debugAccess: supportsDebug \? await playerHasDebugAccess/);
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
