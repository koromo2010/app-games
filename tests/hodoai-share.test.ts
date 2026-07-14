import assert from "node:assert/strict";
import test from "node:test";
import { hodoaiGameShareText } from "../lib/hodoai-talk.ts";

test("ことばで数ならべの共有ログは得点を含み、参加者名とヒント本文を含めない", () => {
  const text = hodoaiGameShareText({
    totalPoints: 5,
    roundsTotal: 2,
    history: [{
      round: 1,
      theme: { id: "gift", title: "贈り物", lowLabel: "低", highLabel: "高" },
      inversions: 1,
      points: 2,
      order: ["player-1"],
      values: { "player-1": 80 },
      clues: { "player-1": "秘密のヒント" },
    }],
  });
  assert.match(text, /チーム得点 5\/6点/);
  assert.match(text, /第1R「贈り物」 2\/3点/);
  assert.doesNotMatch(text, /player-1|秘密のヒント|80/);
});
