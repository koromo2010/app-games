import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAiWordSurface,
  parseAiWordBatchInput,
} from "../lib/ai-word-candidate-batch.ts";
import { generalWordGenres, hardWordGenres } from "../lib/general-word-genres.ts";

test("general word genre catalog contains base and hard-word genres without duplicates", () => {
  assert.equal(hardWordGenres.length, 50);
  assert.equal(generalWordGenres.length, 125);
  assert.equal(new Set(generalWordGenres.map((genre) => genre.key)).size, 125);
  assert.equal(new Set(generalWordGenres.map((genre) => genre.name)).size, 125);
});

test("AI word batches normalize and accept Japanese candidates", () => {
  const result = parseAiWordBatchInput({
    schemaVersion: 1,
    batchKey: "general-v1-001",
    generatedBy: "codex",
    model: "gpt-test",
    promptVersion: "general-word-candidate-v1",
    categories: [{
      categoryKey: "food_meals",
      words: [
        { surface: "おにぎり", reading: "おにぎり" },
        { surface: "カレーライス", reading: "かれーらいす" },
      ],
    }],
  });

  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.equal(normalizeAiWordSurface(" カレー ライス "), "カレーライス");
});

test("AI word batches reject English, non-hiragana readings, and duplicates", () => {
  const result = parseAiWordBatchInput({
    schemaVersion: 1,
    batchKey: "general-v1-002",
    generatedBy: "codex",
    model: "gpt-test",
    promptVersion: "general-word-candidate-v1",
    categories: [{
      categoryKey: "food_meals",
      words: [
        { surface: "pizza", reading: "ぴざ" },
        { surface: "焼きそば", reading: "ヤキソバ" },
        { surface: "おにぎり", reading: "おにぎり" },
        { surface: "おにぎり", reading: "おにぎり" },
      ],
    }],
  });

  assert.deepEqual(
    result.rejected.map((candidate) => candidate.reason),
    ["surface_not_japanese", "reading_not_hiragana", "duplicate_in_batch"],
  );
  assert.equal(result.accepted.length, 1);
});

test("AI word batches reject overlong surfaces instead of truncating them", () => {
  const surface = "超".repeat(25);
  const result = parseAiWordBatchInput({
    schemaVersion: 1,
    batchKey: "general-v1-003",
    generatedBy: "codex",
    model: "gpt-test",
    promptVersion: "general-word-candidate-v1",
    categories: [{
      categoryKey: "science_experiments",
      words: [{ surface, reading: "ちょう" }],
    }],
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0]?.surface, surface);
  assert.equal(result.rejected[0]?.reason, "surface_too_long");
});
