import assert from "node:assert/strict";
import test from "node:test";
import { classifyTahoiyaDifficultyScreening, parseTahoiyaDifficultyScreening, tahoiyaDifficultyVerdictAccepted } from "../lib/tahoiya-difficulty-screening.ts";

const sources = [
  { id: "word:1", wordId: "id-1", word: "既知語" },
  { id: "word:2", wordId: "id-2", word: "秘境語" },
  { id: "word:3", wordId: "id-3", word: "魔境語" },
];

const response = {
  items: [
    { sourceId: "word:1", verdict: "known", exclusionFlags: [], estimatedRecognitionPercent: 70, confidence: 90, reason: "一般語として広く知られる。" },
    { sourceId: "word:2", verdict: "ordinary-unknown", exclusionFlags: [], estimatedRecognitionPercent: 8, confidence: 80, reason: "専門外の成人には意味が伝わりにくい。" },
    { sourceId: "word:3", verdict: "almost-nobody-knows", exclusionFlags: [], estimatedRecognitionPercent: 1, confidence: 75, reason: "専門家以外の認知がほぼ見込めない。" },
  ],
};

test("秘境は一般には分からない語だけを合格にする", () => {
  const items = parseTahoiyaDifficultyScreening(response, sources, "standard");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.accepted), [false, true, false]);
  assert.deepEqual(items.map((item) => item.difficulty), ["rejected", "standard", "extreme"]);
  assert.equal(items[1].word, "秘境語");
  assert.equal(items[1].wordId, "id-2");
});

test("魔境は0〜1%、秘境は1%超〜14%で連続して分類する", () => {
  const items = parseTahoiyaDifficultyScreening(response, sources, "extreme");
  assert.deepEqual(items.map((item) => item.accepted), [false, false, true]);
  assert.equal(tahoiyaDifficultyVerdictAccepted("almost-nobody-knows", [], 1, "extreme"), true);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", [], 1.1, "standard"), true);
});

test("センシティブ・大学名・企業名・地名は同じ除外フラグで扱う", () => {
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", [], 8, "standard"), true);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", ["university"], 8, "standard"), false);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", ["company", "place"], 8, "standard"), false);
  assert.equal(tahoiyaDifficultyVerdictAccepted("ordinary-unknown", ["sensitive"], 8, "standard"), false);
  assert.equal(classifyTahoiyaDifficultyScreening([], 9), "standard");
  assert.equal(classifyTahoiyaDifficultyScreening([], 1), "extreme");
  assert.equal(classifyTahoiyaDifficultyScreening([], 15), "rejected");
  assert.equal(classifyTahoiyaDifficultyScreening(["place"], 0), "rejected");
});

test("欠落・重複・範囲外を含むLLM応答は一括で棄却する", () => {
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: response.items.slice(0, 2) }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], response.items[0], response.items[2]] }, sources, "standard"), []);
  assert.deepEqual(parseTahoiyaDifficultyScreening({ items: [response.items[0], { ...response.items[1], confidence: 101 }, response.items[2]] }, sources, "standard"), []);
});

test("LLMのverdict境界がずれても認知率を正本として補正する", () => {
  const mismatched = {
    items: response.items.map((item, index) => index === 1
      ? { ...item, verdict: "almost-nobody-knows", estimatedRecognitionPercent: 9 }
      : item),
  };
  const items = parseTahoiyaDifficultyScreening(mismatched, sources, "extreme");
  assert.equal(items.length, 3);
  assert.equal(items[1].verdict, "ordinary-unknown");
  assert.equal(items[1].difficulty, "standard");
  assert.equal(items[1].accepted, false);
});
