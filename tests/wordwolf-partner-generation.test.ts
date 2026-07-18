import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWordwolfPartnerBatchPrompt,
  parseWordwolfPartnerBatchDecision,
} from "../lib/wordwolf-partner-generation.ts";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

test("partner prompt requests one result per anchor in a single batch", () => {
  const prompt = buildWordwolfPartnerBatchPrompt({
    anchors: ids.map((inputId, index) => ({
      inputId,
      anchor: ["病院", "公園", "電車"][index],
      zipfFrequency: 5 - index * 0.1,
    })),
    difficulty: "normal",
    pairDistance: "balanced",
    ragContext: "bad example data",
  });
  assert.match(prompt, /3件まとめて独立に審査/);
  assert.match(prompt, /requested|距離|普通/);
  assert.match(prompt, /過去の利用者評価/);
  for (const id of ids) assert.match(prompt, new RegExp(id));
});

test("strict parser accepts a complete three-result batch", () => {
  const parsed = parseWordwolfPartnerBatchDecision(JSON.stringify({
    results: ids.map((inputId, index) => ({
      inputId,
      decision: "accept",
      usagePenalty: index * 0.5,
      wordwolfPenalty: 0,
      safetyFlags: [],
      partner: ["学校", "図書館", "バス"][index],
      pairReason: "同じ広い場面で使うが役割が違う",
      reasonCode: "playable_pair",
    })),
  }), ids);
  assert.equal(parsed.results.length, 3);
  assert.equal(parsed.results[2].usagePenalty, 1);
});

test("strict parser rejects missing or invented input ids", () => {
  assert.throws(() => parseWordwolfPartnerBatchDecision(JSON.stringify({
    results: [{
      inputId: ids[0],
      decision: "accept",
      usagePenalty: 0,
      wordwolfPenalty: 0,
      safetyFlags: [],
      partner: "学校",
      pairReason: "役割が違う",
      reasonCode: "playable_pair",
    }],
  }), ids), /INPUT_ID_MISMATCH/);
});

test("strict parser requires null partner for rejected words", () => {
  assert.throws(() => parseWordwolfPartnerBatchDecision(JSON.stringify({
    results: [{
      inputId: ids[0],
      decision: "reject",
      usagePenalty: 0,
      wordwolfPenalty: 1.5,
      safetyFlags: [],
      partner: "学校",
      pairReason: "単語断片のため不向き",
      reasonCode: "fragment",
    }],
  })), /REJECTION_INVALID/);
});
