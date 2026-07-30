import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("shared room invites resolve and join SDK Preview rooms by pinned revision", () => {
  const previewRoute = readFileSync(
    "app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts",
    "utf8",
  );
  const resolver = readFileSync(
    "app/api/room-invites/[roomCode]/route.ts",
    "utf8",
  );
  const joiner = readFileSync(
    "app/join/[roomCode]/InviteRoomJoiner.tsx",
    "utf8",
  );
  const previewPage = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx",
    "utf8",
  );
  const lobby = readFileSync(
    "app/components/game-sdk/GameSdkLobbyPanel.tsx",
    "utf8",
  );

  assert.match(previewRoute, /saveSdkPreviewRoomInviteTarget/);
  assert.match(previewRoute, /schedulePostResponseWork/);
  assert.match(previewRoute, /sdk-preview-room-invite-index-save/);
  assert.match(previewRoute, /sdk-preview-room-invite-index-delete/);
  assert.doesNotMatch(
    previewRoute,
    /void (?:save|delete)SdkPreviewRoomInviteTarget/,
  );
  assert.match(previewRoute, /revision: requestedRevision/);
  assert.match(resolver, /loadSdkPreviewRoomInviteTarget/);
  assert.match(resolver, /kind: "sdk-preview"/);
  assert.match(joiner, /room\/join/);
  assert.match(joiner, /expectedRevision/);
  assert.match(joiner, /\/api\/room-invites\//);
  assert.match(previewPage, /rooms\?revision=/);
  assert.match(lobby, /招待リンクをコピー/);
  assert.match(lobby, /\/join\//);
});
