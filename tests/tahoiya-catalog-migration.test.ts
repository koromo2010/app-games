import assert from "node:assert/strict";
import test from "node:test";
import {
  isTahoiyaCatalogMigrationComplete,
  legacyTahoiyaRecordToMigrationInput,
} from "../lib/tahoiya-catalog-migration.ts";

test("旧たほい屋候補を共通DB向けの安全な形へ正規化する", () => {
  const input = legacyTahoiyaRecordToMigrationInput({
    topic: {
      word: " ＡＢＣ ",
      reading: " えーびーしー ",
      realDefinition: " 定義 ",
      note: " 注記 ",
      sourceDetail: " 出典 ",
      source: "llm",
      generation: {
        provider: "gemini",
        model: "gemini-test",
        mode: "free",
        promptVersion: "v1",
        latencyMs: 10,
        retrievedFeedbackIds: [],
      },
    },
    difficulty: "extreme",
    experiencedPlayerIds: ["player-1"],
    createdAt: Date.UTC(2026, 0, 1),
    lastUsedAt: Date.UTC(2026, 0, 2),
    useCount: 3,
    feedbackAnchorTags: ["rare"],
  });
  assert.ok(input);
  assert.equal(input.surface, "ABC");
  assert.equal(input.normalizedSurface, "abc");
  assert.equal(input.reading, "えーびーしー");
  assert.equal(input.realDefinition, "定義");
  assert.equal(input.difficulty, "extreme");
  assert.equal(input.useCount, 3);
  assert.deepEqual(input.feedbackAnchorTags, ["rare"]);
});

test("旧Redisにレコードがなければ移行対象なしで完了扱いにする", () => {
  assert.equal(isTahoiyaCatalogMigrationComplete({
    sourceRecordCount: 0,
    sourceValidCount: 0,
    targetTopicCount: 0,
    completedSourceCount: null,
  }), true);
});

test("旧Redisに無効レコードだけがあれば未完了のままにする", () => {
  assert.equal(isTahoiyaCatalogMigrationComplete({
    sourceRecordCount: 1,
    sourceValidCount: 0,
    targetTopicCount: 0,
    completedSourceCount: null,
  }), false);
});
