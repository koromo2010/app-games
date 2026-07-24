import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createOnlineRoomSpectatorGrant, parseOnlineRoomSpectatorGrant } from "../lib/online-room-spectator-auth.ts";
import { presentOnlineRoomForSpectator } from "../lib/online-room-spectator.ts";
import type { OnlineRoomRealtimeGame } from "../lib/online-room-realtime-protocol.ts";

const secretMarkers = ["SECRET_WORD", "SECRET_HAND", "SECRET_CODE", "SECRET_VOTE", "SECRET_DEFINITION"];

function room(game: OnlineRoomRealtimeGame) {
  const base = {
    code: "AB12", hostId: "player-a", passphrase: "SECRET_PASSPHRASE", phase: "playing",
    players: [{ id: "player-a", name: "REAL_NAME_A" }, { id: "player-b", name: "REAL_NAME_B", teamId: "blue" }],
    revision: 4, createdAt: 100, updatedAt: 200,
    villageWord: "SECRET_WORD", wolfWord: "SECRET_WORD", realDefinition: "SECRET_DEFINITION",
    votes: { "player-a": "SECRET_VOTE" }, secrets: { "player-a": "SECRET_WORD" },
    masks: { "player-a": "秘___密" },
    secretCodes: { red: [9, 9, 9] }, fakeDefinitions: { "player-a": ["SECRET_DEFINITION"] },
    hands: { "player-a": ["SECRET_HAND"] },
  };
  if (game === "daifugo") return { ...base, game: { players: [], hands: { "player-a": [{ id: "SECRET_HAND" }], "player-b": [] }, finishOrder: [], currentPlayerId: "player-a", turnNumber: 1, table: null } };
  return base;
}

for (const game of ["wordwolf", "tahoiya", "hodoai", "kotoba-senpuku", "nigoichi", "northern-branch", "code-intercept", "daifugo"] as const) {
  test(`${game}の観戦表示は保存Roomの秘密値・実名・内部IDを返さない`, () => {
    const snapshot = presentOnlineRoomForSpectator(game, room(game));
    const serialized = JSON.stringify(snapshot);
    for (const marker of [...secretMarkers, "SECRET_PASSPHRASE", "REAL_NAME_A", "REAL_NAME_B", "player-a", "player-b", "秘___密"]) assert.equal(serialized.includes(marker), false, marker);
    assert.deepEqual(snapshot.players.map((player) => player.seatId), ["P1", "P2"]);
  });
}

test("観戦grantはゲーム・部屋・本人・部屋作成時刻へ署名される", () => {
  const previousSecret = process.env.PLAYER_SESSION_SECRET;
  try {
    process.env.PLAYER_SESSION_SECRET = "spectator-test-secret-that-is-at-least-32-characters";
    const token = createOnlineRoomSpectatorGrant({ game: "daifugo", code: "AB12", playerId: "viewer", roomCreatedAt: 123 }, 1_000);
    const parsed = parseOnlineRoomSpectatorGrant(token, 1_001);
    assert.equal(parsed?.game, "daifugo");
    assert.equal(parsed?.code, "AB12");
    assert.equal(parsed?.playerId, "viewer");
    assert.equal(parsed?.roomCreatedAt, 123);
    assert.equal(parseOnlineRoomSpectatorGrant(`${token}x`, 1_001), null);
    assert.equal(parseOnlineRoomSpectatorGrant(token, 1_000 + 6 * 60 * 60 * 1000 + 1), null);
  } finally {
    if (previousSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousSecret;
  }
});

test("SDK観戦APIはSDK Room用の4〜12文字コード正規化を使う", () => {
  const route = readFileSync(
    new URL("../app/api/online-room-spectators/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /normalizeOnlineRoomRealtimeCode/);
  assert.doesNotMatch(route, /normalizeOnlineRoomCode\(/);
});
