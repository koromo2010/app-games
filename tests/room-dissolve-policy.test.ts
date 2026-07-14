import assert from "node:assert/strict";
import test from "node:test";
import { canDissolveOnlineRoom } from "../lib/room-dissolve-policy.ts";

test("通常プレイヤーはロビーとゲーム終了後だけ部屋を解散できる", () => {
  assert.equal(canDissolveOnlineRoom("kotoba-senpuku", { phase: "lobby" }), true);
  assert.equal(canDissolveOnlineRoom("kotoba-senpuku", { phase: "secret" }), false);
  assert.equal(canDissolveOnlineRoom("kotoba-senpuku", { phase: "battle" }), false);
  assert.equal(canDissolveOnlineRoom("kotoba-senpuku", { phase: "result" }), true);
  assert.equal(canDissolveOnlineRoom("wordwolf", { phase: "vote" }), false);
  assert.equal(canDissolveOnlineRoom("tahoiya", { phase: "writing" }), false);
  assert.equal(canDissolveOnlineRoom("northern-branch", { phase: "playing" }), false);
  assert.equal(canDissolveOnlineRoom("northern-branch", { phase: "finished" }), true);
});

test("ことばで数ならべは最終ラウンド結果だけ解散できる", () => {
  assert.equal(canDissolveOnlineRoom("hodoai", { phase: "result", round: 1, roundsTotal: 3 }), false);
  assert.equal(canDissolveOnlineRoom("hodoai", { phase: "result", round: 3, roundsTotal: 3 }), true);
});
