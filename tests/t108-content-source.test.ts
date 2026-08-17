import assert from "node:assert/strict";
import test from "node:test";
import { drawGameContentWords } from "../lib/game-content-source.ts";
import { reviewedWordPools } from "../lib/reviewed-word-pool.ts";

const records = [
  { id: "g-easy", pool: "general", surface: "天王星", normalizedSurface: "天王星", reading: "てんのうせい", difficulty: "easy" },
  { id: "g-normal", pool: "general", surface: "海岸", normalizedSurface: "海岸", reading: "かいがん", difficulty: "normal" },
  { id: "g-duplicate", pool: "general", surface: "天王星", normalizedSurface: "天王星", reading: "てんのうせい", difficulty: "normal" },
  { id: "proper", pool: "proper-noun", surface: "東京", normalizedSurface: "東京", reading: "とうきょう", difficulty: "normal" },
  { id: "idiom", pool: "four-character-idiom", surface: "一石二鳥", normalizedSurface: "一石二鳥", reading: "いっせきにちょう", difficulty: "normal" },
] as const;

test("T-108 internal pool boundary has explicit pools only", () => {
  assert.deepEqual(reviewedWordPools, ["general", "proper-noun", "four-character-idiom"]);
});

test("general draws stay inside general memberships and deduplicate surfaces", async () => {
  const words = await drawGameContentWords({ pool: "general", difficulty: "normal", count: 2 }, {
    idSecret: "0123456789abcdef0123456789abcdef",
    random: (() => {
      const rolls = [0, 0.5];
      return () => rolls.shift() ?? 0.5;
    })(),
    loadRecords: async () => records.filter((record) => record.pool === "general"),
  });
  assert.deepEqual(words.map((word) => word.surface), ["天王星", "海岸"]);
  assert.equal(new Set(words.map((word) => word.surface)).size, 2);
  assert.match(words[0]!.opaqueId, /^gfp2\./);
  assert.equal(words[0]!.opaqueId.includes("g-easy"), false);
});

test("proper nouns and four-character idioms require explicit pool selection", async () => {
  const loadRecords = async () => records;
  const proper = await drawGameContentWords({ pool: "proper-noun", difficulty: "normal", count: 1 }, { idSecret: "0123456789abcdef0123456789abcdef", loadRecords });
  const idiom = await drawGameContentWords({ pool: "four-character-idiom", difficulty: "normal", count: 1 }, { idSecret: "0123456789abcdef0123456789abcdef", loadRecords });
  assert.equal(proper[0]?.surface, "東京");
  assert.equal(idiom[0]?.surface, "一石二鳥");
});

test("content draws honor opaque exclusions, surface exclusions and history", async () => {
  const source = async () => records.filter((record) => record.pool === "general");
  const options = { idSecret: "0123456789abcdef0123456789abcdef", random: () => 0, loadRecords: source };
  const first = await drawGameContentWords({ pool: "general", difficulty: "easy", count: 1 }, options);
  await assert.rejects(
    drawGameContentWords({ pool: "general", difficulty: "easy", count: 1, excludeIds: [first[0]!.opaqueId] }, options),
    /GAME_CONTENT_UNAVAILABLE/,
  );
  await assert.rejects(
    drawGameContentWords({ pool: "general", difficulty: "easy", count: 1, historyIds: [first[0]!.opaqueId] }, options),
    /GAME_CONTENT_UNAVAILABLE/,
  );
  await assert.rejects(
    drawGameContentWords({ pool: "general", difficulty: "easy", count: 1, excludeSurfaces: ["天王星"] }, options),
    /GAME_CONTENT_UNAVAILABLE/,
  );
});
