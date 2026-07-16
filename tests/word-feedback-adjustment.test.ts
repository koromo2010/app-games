import assert from "node:assert/strict";
import test from "node:test";

import type { GameFeedbackRecord } from "../lib/game-ai-types.ts";
import { wordFamiliarityFeedbackAdjustment } from "../lib/game-feedback-store.ts";

function record(index: number, rating: "good" | "bad", reason: string, anchorWordMasterId = 10): GameFeedbackRecord {
  return {
    id: String(index),
    artifactId: `artifact-${index}`,
    artifactText: "村側=女性 / 狼側=男性",
    game: "wordwolf",
    task: "wordwolf.topic",
    rating,
    reasonTags: [reason],
    comment: "",
    playerId: `player-${index}`,
    generation: { provider: "local", model: "test", mode: "local", promptVersion: "test", latencyMs: 0, retrievedFeedbackIds: [] },
    settings: { anchorWordMasterId, anchorWord: "女性" },
    outcome: {},
    createdAt: index,
    updatedAt: index,
  };
}

test("familiarity feedback only adjusts the matching anchor after enough samples", () => {
  const records = Array.from({ length: 5 }, (_, index) => record(index, "good", "familiar"));
  assert.ok(wordFamiliarityFeedbackAdjustment(records, { wordMasterId: 10, surface: "女性" }) > 0);
  assert.equal(wordFamiliarityFeedbackAdjustment(records, { wordMasterId: 11, surface: "男性" }), 0);
});

test("pair-quality reasons do not change shared word familiarity", () => {
  const records = Array.from({ length: 8 }, (_, index) => record(index, "bad", "distance-too-far"));
  assert.equal(wordFamiliarityFeedbackAdjustment(records, { wordMasterId: 10, surface: "女性" }), 0);
});
