import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWordwolfPartnerBatchPrompt,
  buildWordwolfPartnerPrompt,
  parseWordwolfPartnerBatchDecision,
  parseWordwolfPartnerDecision,
} from "../lib/wordwolf-partner-generation.ts";

test("partner prompt asks for safety decision and partner in one response", () => {
  const prompt = buildWordwolfPartnerPrompt({
    anchor: "映画",
    reading: "エイガ",
    zipfFrequency: 5.1,
    ragContext: "既出ペアを避ける",
  });
  assert.match(prompt, /decisionをreject/);
  assert.match(prompt, /相方を1語だけ生成/);
  assert.match(prompt, /RAG参考情報/);
  assert.match(prompt, /映画/);
});

test("accept decision contains only a safe partner", () => {
  assert.deepEqual(
    parseWordwolfPartnerDecision(
      JSON.stringify({ decision: "accept", safetyFlags: [], partner: "ドラマ" }),
    ),
    { decision: "accept", safetyFlags: [], partner: "ドラマ" },
  );
});

test("reject decision requires flags and does not retain a partner", () => {
  assert.deepEqual(
    parseWordwolfPartnerDecision(
      JSON.stringify({
        decision: "reject",
        safetyFlags: ["identity_slur"],
        partner: null,
      }),
    ),
    { decision: "reject", safetyFlags: ["identity_slur"], partner: null },
  );
  assert.throws(
    () =>
      parseWordwolfPartnerDecision(
        JSON.stringify({ decision: "reject", safetyFlags: [], partner: "映画" }),
      ),
    /WORDWOLF_PARTNER_REJECTION_INVALID/,
  );
});

test("accept decision rejects a response that contains safety flags", () => {
  assert.throws(
    () =>
      parseWordwolfPartnerDecision(
        JSON.stringify({
          decision: "accept",
          safetyFlags: ["sexual_explicit"],
          partner: "不適切語",
        }),
      ),
    /WORDWOLF_PARTNER_ACCEPTANCE_INVALID/,
  );
});

test("batch prompt reviews three anchors with RAG in one request", () => {
  const prompt = buildWordwolfPartnerBatchPrompt({
    anchors: [
      { inputId: 1, anchor: "女性", reading: "ジョセイ", zipfFrequency: 5.5 },
      { inputId: 2, anchor: "何円", reading: "ナンエン", zipfFrequency: 5.64 },
      { inputId: 3, anchor: "中人", reading: "チュウニン", zipfFrequency: 6.01 },
    ],
    difficulty: "easy",
    pairDistance: "balanced",
    ragContext: "Good例とBad例",
  });
  assert.match(prompt, /3件まとめて/);
  assert.match(prompt, /usagePenalty/);
  assert.match(prompt, /wordwolfPenalty/);
  assert.match(prompt, /Good例とBad例/);
});

test("batch response keeps common and wordwolf penalties separate", () => {
  const parsed = parseWordwolfPartnerBatchDecision(JSON.stringify({
    results: [
      {
        inputId: 1,
        decision: "accept",
        usagePenalty: 0,
        wordwolfPenalty: 0.5,
        safetyFlags: [],
        partner: "男性",
        pairReason: "同じ人物属性だが立場が異なる",
        reasonCode: "balanced_person_attribute",
      },
      {
        inputId: 2,
        decision: "reject",
        usagePenalty: 1.5,
        wordwolfPenalty: 1.5,
        safetyFlags: [],
        partner: null,
        pairReason: "単独のお題として不自然",
        reasonCode: "unnatural_standalone",
      },
    ],
  }), [1, 2]);
  assert.equal(parsed.results[0].partner, "男性");
  assert.equal(parsed.results[0].wordwolfPenalty, 0.5);
  assert.equal(parsed.results[1].decision, "reject");
});

test("batch response must return every requested input id exactly once", () => {
  assert.throws(() => parseWordwolfPartnerBatchDecision(JSON.stringify({
    results: [{
      inputId: 1,
      decision: "accept",
      usagePenalty: 0,
      wordwolfPenalty: 0,
      safetyFlags: [],
      partner: "紅茶",
      pairReason: "飲み物",
      reasonCode: "same_layer",
    }],
  }), [1, 2]), /INPUT_ID_MISMATCH/);
});
