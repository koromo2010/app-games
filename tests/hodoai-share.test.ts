import assert from "node:assert/strict";
import test from "node:test";
import { clueHasNumber, dealHodoaiCards, hodoaiGameShareText, normalizeHodoaiConfig } from "../lib/hodoai-talk.ts";

test("設定枚数ぶんの重複しない数字カードを各プレイヤーへ配る", () => {
  const players = [
    { id: "p1", name: "A", joinedAt: 1 },
    { id: "p2", name: "B", joinedAt: 2 },
  ];
  const dealt = dealHodoaiCards(players, 3);
  assert.equal(dealt.cards.length, 6);
  assert.equal(dealt.cards.filter((card) => card.ownerId === "p1").length, 3);
  assert.equal(dealt.cards.filter((card) => card.ownerId === "p2").length, 3);
  assert.equal(new Set(Object.values(dealt.values)).size, 6);
});

test("1人あたりのカード枚数は初期値1枚、設定範囲は1〜5枚", () => {
  assert.equal(normalizeHodoaiConfig({}).cardsPerPlayer, 1);
  assert.equal(normalizeHodoaiConfig({ cardsPerPlayer: 0 }).cardsPerPlayer, 1);
  assert.equal(normalizeHodoaiConfig({ cardsPerPlayer: 99 }).cardsPerPlayer, 5);
});

test("数字の直接説明は半角・全角・漢数字ともヒントに使えない", () => {
  assert.equal(clueHasNumber("80くらい"), true);
  assert.equal(clueHasNumber("八十くらい"), true);
  assert.equal(clueHasNumber("キャンプ"), false);
});

test("ことばで数ならべの共有ログは得点を含み、参加者名とヒント本文を含めない", () => {
  const text = hodoaiGameShareText({
    totalPoints: 5,
    roundsTotal: 2,
    history: [{
      round: 1,
      theme: { id: "gift", title: "贈り物", lowLabel: "低", highLabel: "高" },
      inversions: 1,
      points: 2,
      cards: [{ id: "player-1", ownerId: "player-1", cardNumber: 1 }],
      order: ["player-1"],
      values: { "player-1": 80 },
      clues: { "player-1": "秘密のヒント" },
    }],
  });
  assert.match(text, /チーム得点 5\/6点/);
  assert.match(text, /第1R「贈り物」 2\/3点/);
  assert.doesNotMatch(text, /player-1|秘密のヒント|80/);
});
