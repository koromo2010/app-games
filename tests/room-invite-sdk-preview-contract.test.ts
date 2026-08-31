import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("shared Room invites use opaque canonical targets and pinned SDK identity", () => {
  const previewRoute = readFileSync("app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts", "utf8");
  const resolver = readFileSync("app/api/room-invites/[roomCode]/route.ts", "utf8");
  const canonicalJoiner = readFileSync("app/join/i/[inviteRef]/CanonicalInviteJoiner.tsx", "utf8");
  const legacyJoiner = readFileSync("app/join/[roomCode]/InviteRoomJoiner.tsx", "utf8");
  const lobby = readFileSync("app/components/game-sdk/GameSdkLobbyPanel.tsx", "utf8");
  const issueRoute = readFileSync("app/api/room-invites/route.ts", "utf8");
  assert.doesNotMatch(previewRoute, /scheduleSdkPreviewRoomInviteIndexSuccess/);
  assert.match(resolver, /loadCanonicalRoomInvite/);
  assert.match(resolver, /revalidateCanonicalRoomInviteTarget/);
  assert.match(resolver, /expectedRoomInstanceId/);
  assert.match(resolver, /expectedRevision/);
  assert.match(canonicalJoiner, /method: "POST"/);
  assert.doesNotMatch(legacyJoiner, /fetch\(/);
  assert.match(legacyJoiner, /一意に証明できない/);
  assert.match(lobby, /providerKind: previewOnly \? "sdk-preview" : "sdk-approved"/);
  assert.match(lobby, /packageRevision/);
  assert.match(issueRoute, /\/join\/i\//);
});
