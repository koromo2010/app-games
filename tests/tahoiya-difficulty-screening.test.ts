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
    { sourceId: "word:1", verdict: "known", entityFlag: "none", estimatedRecognitionPercent: 70, confidence: 90, reason: "一般語として広く知られる。" },
    { sourceId: "word:2", verdict: "ordinary-unknown", entityFlag: "none", estimatedRecognitionPercent: 8, confidence: 80, reason: "専門外の成人には意味が伝わりにくい。" },
    { sourceId: "word:3", verdict: "almost-nobody-knows", entityFlag: "none", estimatedRecognitionPercent: 1, confidence: 75, reason: "専門家以外の認知がほぼ見込めない。" },
  ],
};

test("秘境は一般には分からない語だけを合格にする", () => {
  const items = parseTahoiyaDifficultyScreening(response, sources, "standard");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.accepted), [false, true, false]);
  assert.equal(items[1].word, "秘境語");
});

test("魔境は推定認知率0〜1%だけを合格にして2%を除外する", () => {
  const items = parseTahoiyaDifficultyScreening(response, sources, "extreme");
  assert.deepEqual(items.map((item) => item.accepted), [false, false, true]);
  assert.equal(tahoiyaDifficultyVerdictAccepted("almost-nobody-knows", "none", 2, "extreme"), false);
});

test("大学名・企業名・地名は難易度が適切でも除外する", () => {
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", "none", 8, "standard"), true);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", "university", 8, "standard"), false);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", "company", 8, "standard"), false);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", "place", 8, "standard"), false);
});

test("欠落・重複・範囲外を含むLLM応答は一括で棄却する", () => {
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: response.items.slice(0, 2) }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], response.items[0], response.items[2]] }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], { ...response.items[1], confidence: 101 }, response.items[2]] }, sources, "standard"), []);
});
