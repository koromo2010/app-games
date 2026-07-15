import assert from "node:assert/strict";
import test from "node:test";
import { tahoiyaReplaySummaryHighlights } from "../lib/game-replay-types.ts";

test("たほい屋のプレイバック要約は詳細表示と同じ説明・投票・得点を使う", () => {
  const highlights = tahoiyaReplaySummaryHighlights({
    definitions: [
      { id: "real", text: "本物の語釈", isReal: true },
      { id: "fake", text: "もっともらしい偽説明", isReal: false },
    ],
    playerId: "viewer",
    realDefinition: "本物の語釈",
    scores: { viewer: 1 },
    votes: { viewer: "fake", another: "fake" },
  });

  assert.deepEqual(highlights, [
    "本物の説明「本物の語釈」",
    "あなたの投票「もっともらしい偽説明」（偽説明・2票）",
    "あなたの得点 1点",
  ]);
  assert.equal(highlights.some((line) => line.includes("another")), false);
});

test("投票しない役割にも詳細内容に基づく案内を出す", () => {
  const highlights = tahoiyaReplaySummaryHighlights({
    definitions: [{ id: "real", text: "本物の語釈", isReal: true }],
    playerId: "writer",
    realDefinition: "本物の語釈",
    scores: { writer: 0 },
    votes: {},
  });

  assert.equal(highlights[1], "全1個の説明と投票結果");
  assert.equal(highlights[2], "あなたの得点 0点");
});
