import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlayerActiveRoom } from "../lib/player-active-room-summary.ts";

test("広場の復帰概要はゲームの秘密フィールドを返さない", () => {
  const room = {
    code: "ABCD",
    phase: "clue",
    players: [{ id: "p1", name: "PLAYER1", secret: "hidden" }],
    updatedAt: 123,
    secretWord: "hidden",
    passphrase: "hidden",
  };
  const summary = summarizePlayerActiveRoom(room);

  assert.deepEqual(summary, {
    code: "ABCD",
    phase: "clue",
    players: [{ id: "p1", name: "PLAYER1" }],
    updatedAt: 123,
  });
});

test("復帰先がなければ概要も返さない", () => {
  assert.equal(summarizePlayerActiveRoom(null), null);
});
