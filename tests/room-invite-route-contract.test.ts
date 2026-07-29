import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generic room invite route keeps normal player auth and existing room APIs", () => {
  const page = readFileSync("app/join/[roomCode]/page.tsx", "utf8");
  const joiner = readFileSync("app/join/[roomCode]/InviteRoomJoiner.tsx", "utf8");

  assert.match(page, /getAuthenticatedPlayer/);
  assert.match(page, /PlayerAuthGate/);
  assert.match(page, /ROOM_CODE_PATTERN/);
  assert.match(page, /InviteRoomJoiner/);

  for (const endpoint of [
    "/api/wordwolf/rooms",
    "/api/tahoiya/rooms",
    "/api/hodoai/rooms",
    "/api/kotoba-senpuku/rooms",
    "/api/northern-branch/rooms",
    "/api/nigoichi/rooms",
    "/api/code-intercept/rooms",
    "/api/daifugo/rooms",
  ]) {
    assert.match(joiner, new RegExp(endpoint.replaceAll("/", "\\/")));
  }

  assert.match(joiner, /method: "PATCH"/);
  assert.match(joiner, /type: "join-room"/);
  assert.match(joiner, /router\.replace/);
  assert.doesNotMatch(joiner, /sdk-preview/i);
});
