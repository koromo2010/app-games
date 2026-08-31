import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generic room invite route keeps normal player auth and existing room APIs", () => {
  const page = readFileSync("app/join/[roomCode]/page.tsx", "utf8");
  const joiner = readFileSync("app/join/[roomCode]/InviteRoomJoiner.tsx", "utf8");
  const resolver = readFileSync("app/api/room-invites/[roomCode]/route.ts", "utf8");

  assert.match(page, /getAuthenticatedPlayer/);
  assert.match(page, /PlayerAuthGate/);
  assert.match(page, /ROOM_CODE_PATTERN/);
  assert.match(page, /InviteRoomJoiner/);

  assert.match(joiner, /builtInOnlineRoomDescriptors/);
  assert.match(joiner, /const INVITE_TARGETS: InviteTarget\[\] = builtInOnlineRoomDescriptors/);

  assert.match(joiner, /method: "PATCH"/);
  assert.match(joiner, /type: "join-room"/);
  assert.match(joiner, /\/api\/room-invites\//);
  assert.match(joiner, /target\.kind !== "sdk-preview"/);
  assert.match(joiner, /const expectedRevision = roomPayload\.room\?\.revision/);
  assert.match(joiner, /command: \{ type: "room\/join" \}/);
  assert.match(joiner, /expectedRevision,/);
  assert.match(joiner, /router\.replace/);
  assert.match(resolver, /loadSdkPreviewRoomInviteTarget/);
  assert.match(resolver, /kind: "sdk-preview"/);
  assert.match(
    resolver,
    /endpoint: `\/api\/sdk-preview\/\$\{encodeURIComponent\(target\.creatorSlug\)\}\/games\/\$\{encodeURIComponent\(target\.gameId\)\}\/rooms\?revision=\$\{encodeURIComponent\(target\.revision\)\}`/,
  );
  assert.ok(
    joiner.indexOf("if (await joinStandardRoom()) return;")
      < joiner.indexOf("if (await joinSdkPreviewRoom()) return;"),
    "normal Room discovery must run before SDK Preview invite resolution",
  );
});
