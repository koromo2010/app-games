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
const previewRoomRoute = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts");
const platformAdapter = source("lib/game-sdk-platform-adapter.ts");

test("reviewed SDK shell consumes every Room View permission it declares", () => {
  for (const permission of [
    "canStartGame",
    "canEditRoomSettings",
    "canAbort",
  ]) {
    assert.match(
      frame,
      new RegExp(`permissions\\.${escaped(permission)}`),
      `${permission} must control the reviewed SDK shell`,
    );
  }

  assert.match(
    header,
    /permissions\?\.canDebug === true/,
    "canDebug must control the shared DEBUG entry point",
  );
  assert.match(header, /DEBUG · ON/);
  assert.doesNotMatch(
    header,
    /DEBUG · ON[\s\S]{0,300}permissions\?\.canDebug !== true/,
  );
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

  assert.doesNotMatch(
    frame,
    /playerHasDebugAccess|requireAuthenticatedPlayer|getSdkPreviewAccountPlayerId/,
    "the client shell must not independently recalculate server permissions",
  );
});

test("Preview package page and promoted game share the same GameSdkFrame", () => {
  const approvedPage = source("app/sdk-games/[gameId]/page.tsx");
  assert.match(previewPage, /import \{ GameSdkFrame \} from "@\/app\/components\/GameSdkFrame"/);
  assert.match(approvedPage, /GameSdkFrame/);
  assert.doesNotMatch(previewPage, /ApprovedSdkGameShell/);
});
