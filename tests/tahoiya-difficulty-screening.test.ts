import assert from "node:assert/strict";
import test from "node:test";
import { parseTahoiyaDifficultyScreening, tahoiyaDifficultyVerdictAccepted } from "../lib/tahoiya-difficulty-screening.ts";

const sources = [
  { id: "word:1", word: "既知語" },
  { id: "word:2", word: "秘境語" },
  { id: "word:3", word: "魔境語" },
];

const response = {
  items: [
    { sourceId: "word:1", verdict: "known", estimatedRecognitionPercent: 70, confidence: 90, reason: "一般語として広く知られる。" },
    { sourceId: "word:2", verdict: "ordinary-unknown", estimatedRecognitionPercent: 8, confidence: 80, reason: "専門外の成人には意味が伝わりにくい。" },
    { sourceId: "word:3", verdict: "almost-nobody-knows", estimatedRecognitionPercent: 1, confidence: 75, reason: "専門家以外の認知がほぼ見込めない。" },
  ],
};

test("秘境は一般には分からない語だけを合格にする", () => {
  const items = parseTahoiyaDifficultyScreening(response, sources, "standard");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.accepted), [false, true, false]);
  assert.equal(items[1].word, "秘境語");
});

test("魔境はほぼ誰も知らない語だけを合格にする", () => {
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", "extreme"), false);
  assert.equal(tahoiyaDifficultyVerdictAccepted("almost-nobody-knows", "extreme"), true);
});

test("欠落・重複・範囲外を含むLLM応答は一括で棄却する", () => {
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: response.items.slice(0, 2) }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], response.items[0], response.items[2]] }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], { ...response.items[1], confidence: 101 }, response.items[2]] }, sources, "standard"), []);
});
