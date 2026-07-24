import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_CONTENT_POOL_DEFINITIONS,
  GAME_SDK_CONTENT_POOLS,
} from "../packages/game-sdk/src/content-source.ts";
import {
  createGameFieldsSdkContentSource,
  type GameFieldsSdkContentRepository,
  type GameFieldsSdkContentWordRecord,
} from "../lib/game-sdk-content-source.ts";

const words = {
  easyA: {
    source: "app",
    internalId: "101",
    surface: "ひまわり",
    normalizedSurface: "ひまわり",
    reading: "ひまわり",
    difficulty: "easy",
  },
  easyB: {
    source: "app",
    internalId: "102",
    surface: "飛行船",
    normalizedSurface: "飛行船",
    reading: "ひこうせん",
    difficulty: "easy",
  },
  rare: {
    source: "vocabulary",
    internalId: "123e4567-e89b-42d3-a456-426614174000",
    surface: "寂寥",
    normalizedSurface: "寂寥",
    reading: "せきりょう",
    difficulty: "normal",
  },
  pairA: {
    source: "vocabulary",
    internalId: "223e4567-e89b-42d3-a456-426614174000",
    surface: "犬",
    normalizedSurface: "犬",
    reading: "いぬ",
    difficulty: "normal",
  },
  pairB: {
    source: "vocabulary",
    internalId: "323e4567-e89b-42d3-a456-426614174000",
    surface: "猫",
    normalizedSurface: "猫",
    reading: "ねこ",
    difficulty: "normal",
  },
} as const satisfies Record<string, GameFieldsSdkContentWordRecord>;

function repository(): GameFieldsSdkContentRepository {
  const byId = new Map(
    Object.values(words).map((word) => [`${word.source}:${word.internalId}`, word]),
  );
  return {
    async loadGeneralWords() {
      return [words.easyA, words.easyB];
    },
    async loadRareWords() {
      return [words.rare];
    },
    async loadWordPairs() {
      return [{
        internalId: "423e4567-e89b-42d3-a456-426614174000",
        first: words.pairA,
        second: words.pairB,
        difficulty: "normal",
        relation: "動物",
      }];
    },
    async loadDefinitions(requested) {
      return requested.flatMap((request) => {
        const word = byId.get(`${request.source}:${request.internalId}`);
        return word ? [{
          word,
          definition: `${word.surface}の短い説明`,
        }] : [];
      });
    },
  };
}

const idSecret = "0123456789abcdef0123456789abcdef";

test("SDK content pools expose canonical names without limiting low-recognition words to difficult readings", () => {
  assert.deepEqual(
    Object.keys(GAME_SDK_CONTENT_POOL_DEFINITIONS),
    [...GAME_SDK_CONTENT_POOLS],
  );
  assert.equal(
    GAME_SDK_CONTENT_POOL_DEFINITIONS["general-words"].displayName,
    "一般語彙",
  );
  assert.equal(
    GAME_SDK_CONTENT_POOL_DEFINITIONS["rare-words"].displayName,
    "低認知語彙",
  );
  assert.match(
    GAME_SDK_CONTENT_POOL_DEFINITIONS["rare-words"].description,
    /意味が難しい語を含みます/,
  );
  assert.match(
    GAME_SDK_CONTENT_POOL_DEFINITIONS["rare-words"].description,
    /たほい屋専用または審査・採用済みのお題という意味ではありません/,
  );
});

test("SDK content source draws opaque words and resolves definitions without exposing database access", async () => {
  const source = createGameFieldsSdkContentSource({
    repository: repository(),
    idSecret,
    random: () => 0,
  });
  const [word] = await source.drawWords({
    pool: "general-words",
    difficulty: "easy",
    count: 1,
    excludeSurfaces: ["飛行船"],
  });
  assert.equal(word?.surface, "ひまわり");
  assert.match(word?.id ?? "", /^gfc1\./);
  assert.equal(word?.id.includes("101"), false);
  assert.doesNotMatch(
    Buffer.from(word!.id.split(".")[1]!, "base64url").toString("utf8"),
    /101|ひまわり/,
  );
  assert.deepEqual(await source.findDefinitions({
    wordIds: [word!.id],
  }), [{
    wordId: word!.id,
    surface: "ひまわり",
    definition: "ひまわりの短い説明",
  }]);
  const tamperIndex = Math.floor(word!.id.length / 2);
  const replacement = word!.id[tamperIndex] === "A" ? "B" : "A";
  const tamperedId = `${word!.id.slice(0, tamperIndex)}${replacement}${word!.id.slice(tamperIndex + 1)}`;
  assert.deepEqual(await source.findDefinitions({
    wordIds: [tamperedId],
  }), []);
});

test("SDK content source applies pool difficulty and opaque pair exclusions", async () => {
  const source = createGameFieldsSdkContentSource({
    repository: repository(),
    idSecret,
    random: () => 0,
  });
  const [rare] = await source.drawWords({
    pool: "rare-words",
    difficulty: "normal",
    count: 1,
  });
  assert.equal(rare?.surface, "寂寥");

  const [pair] = await source.drawWordPairs({
    pool: "word-pairs",
    difficulty: "normal",
    count: 1,
  });
  assert.equal(pair?.first.surface, "犬");
  assert.equal(pair?.second.surface, "猫");
  assert.equal(pair?.relation, "動物");
  await assert.rejects(
    source.drawWordPairs({
      pool: "word-pairs",
      difficulty: "normal",
      count: 1,
      excludeIds: [pair!.id],
    }),
    /GAME_SDK_CONTENT_UNAVAILABLE/,
  );
});
