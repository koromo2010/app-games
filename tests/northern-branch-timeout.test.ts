import assert from "node:assert/strict";
import test from "node:test";
import { createNorthernGame, expireNorthernTurn } from "../lib/northern-branch-game.ts";
import { expireNorthernRoomTurn, isNorthernTurnExpired } from "../lib/northern-branch-room-domain.ts";
import type { NorthernRoom } from "../lib/northern-branch-types.ts";

function makeRoom(): NorthernRoom {
  const players = [
    { id: "a", name: "A", joinedAt: 1 },
    { id: "b", name: "B", joinedAt: 2 },
  ];
  return {
    code: "AB12",
    revision: 1,
    hostId: "a",
    passphrase: "",
    phase: "playing",
    players,
    gameNumber: 1,
    debugMode: false,
    debugReplayEnabled: false,
    turnTimeLimitSeconds: 60,
    turnStartedAt: 1_000,
    game: createNorthernGame(players),
    notice: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

test("ノーザンブランチの手番期限を境界どおり判定する", () => {
  const room = makeRoom();
  assert.equal(isNorthernTurnExpired(room, 60_999), false);
  assert.equal(isNorthernTurnExpired(room, 61_000), true);
  assert.equal(isNorthernTurnExpired({ ...room, turnTimeLimitSeconds: 0 }, 1_000_000), false);
});

test("手番の時間切れは資源を増やさず次のプレイヤーへ進める", () => {
  const room = makeRoom();
  const firstHand = [...room.game!.players[0].hand];
  const expired = expireNorthernRoomTurn(room, 61_000);
  assert.equal(expired.game?.activePlayerIndex, 1);
  assert.deepEqual(expired.game?.players[0].hand, firstHand);
  assert.equal(expired.game?.mainActionUsed, false);
  assert.equal(expired.turnStartedAt, 61_000);
  assert.match(expired.notice, /時間切れ/);

  const direct = expireNorthernTurn(room.game!);
  assert.equal(direct.ok, true);
  if (direct.ok) assert.match(direct.state.log[0], /時間切れ/);
});
