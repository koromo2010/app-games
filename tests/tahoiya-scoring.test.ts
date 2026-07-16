import assert from "node:assert/strict";
import test from "node:test";
import { calculateTahoiyaRoundScores } from "../lib/tahoiya-scoring.ts";

test("たほい屋は本物の正解と偽説明でだます得点をどちらも1票1点にする", () => {
  const players = [
    { id: "a", name: "A", joinedAt: 1 },
    { id: "b", name: "B", joinedAt: 2 },
    { id: "c", name: "C", joinedAt: 3 },
  ];
  const scores = calculateTahoiyaRoundScores({
    players,
    options: [
      { id: "real", text: "本物", authorId: null, isReal: true },
      { id: "fake-b", text: "Bの嘘", authorId: "b", isReal: false },
    ],
    votes: { a: "real", c: "fake-b" },
  });

  assert.deepEqual(scores, { a: 1, b: 1, c: 0 });
});

test("たほい屋はゲーム開始時に保存した運営得点を使う", () => {
  const players = [
    { id: "a", name: "A", joinedAt: 1 },
    { id: "b", name: "B", joinedAt: 2 },
    { id: "c", name: "C", joinedAt: 3 },
  ];
  assert.deepEqual(calculateTahoiyaRoundScores({
    players,
    options: [
      { id: "real", text: "本物", authorId: null, isReal: true },
      { id: "fake-b", text: "Bの嘘", authorId: "b", isReal: false },
    ],
    votes: { a: "real", c: "fake-b" },
    correctVotePoints: 2,
    fooledVotePoints: 3,
  }), { a: 2, b: 3, c: 0 });
});
