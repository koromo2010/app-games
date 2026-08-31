import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("legacy code-only join is write-zero and canonical invite route is exact", () => {
  const legacyPage = readFileSync("app/join/[roomCode]/page.tsx", "utf8");
  const legacyJoiner = readFileSync("app/join/[roomCode]/InviteRoomJoiner.tsx", "utf8");
  const canonicalPage = readFileSync("app/join/i/[inviteRef]/page.tsx", "utf8");
  const resolver = readFileSync("app/api/room-invites/[roomCode]/route.ts", "utf8");
  assert.match(legacyPage, /getAuthenticatedPlayer/);
  assert.match(legacyPage, /PlayerAuthGate/);
  assert.doesNotMatch(legacyJoiner, /fetch\(/);
  assert.match(legacyJoiner, /一意に証明できない/);
  assert.match(canonicalPage, /\[a-f0-9\]\{32\}/);
  assert.match(resolver, /loadCanonicalRoomInvite/);
  assert.match(resolver, /revalidateCanonicalRoomInviteTarget/);
  assert.match(resolver, /expectedRoomInstanceId/);
  assert.match(resolver, /command: \{ type: "room\/join" \}/);
  assert.doesNotMatch(resolver, /builtInOnlineRoomDescriptors/);
});
