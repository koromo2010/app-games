import assert from "node:assert/strict";
import test from "node:test";
import {
  defineGameSdkContentSource,
} from "@game-fields/game-sdk/content-source";
import {
  normalizeDrawingStroke,
} from "@game-fields/game-sdk/drawing";
import {
  defineGameSdkLlmGateway,
} from "@game-fields/game-sdk/llm";
import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  presentPlayingCardHands,
} from "@game-fields/game-sdk/playing-cards";
import {
  requireGameSdkContentSource,
  requireGameSdkLlmGateway,
} from "@game-fields/game-sdk/resources";

test("content source validates requests without exposing a database", async () => {
  let receivedCount = 0;
  const contentSource = defineGameSdkContentSource({
    async drawWords(request) {
      receivedCount = request.count;
      return [{
        id: "opaque-1",
        surface: "鉛筆",
        difficulty: request.difficulty ?? "normal",
      }];
    },
    async drawWordPairs() {
      return [];
    },
    async findDefinitions() {
      return [];
    },
  });
  const words = await requireGameSdkContentSource({
    contentSource,
  }).drawWords({
    pool: "general-words",
    count: 1,
  });
  assert.equal(receivedCount, 1);
  assert.equal(words[0]?.surface, "鉛筆");
  await assert.rejects(
    contentSource.drawWords({
      pool: "general-words",
      count: 101,
    }),
    /GAME_SDK_CONTENT_INVALID_COUNT/,
  );
  assert.throws(
    () => requireGameSdkContentSource({}),
    /GAME_SDK_CONTENT_SOURCE_UNAVAILABLE/,
  );
});

test("LLM gateway validates public requests and keeps providers behind adapter", async () => {
  const gateway = defineGameSdkLlmGateway({
    async generate(request) {
      return {
        text: request.prompt,
        generation: {
          provider: "local",
          model: "fixture",
          mode: "local",
          promptVersion: request.promptVersion,
          latencyMs: 0,
          retrievedFeedbackIds: [],
        },
      };
    },
  });
  const generated = await requireGameSdkLlmGateway({ llm: gateway }).generate({
    task: "test-generation",
    prompt: "hello",
    promptVersion: "v1",
  });
  assert.equal(generated.text, "hello");
  await assert.rejects(
    gateway.generate({
      task: "INVALID TASK",
      prompt: "hello",
      promptVersion: "v1",
    }),
    /GAME_SDK_LLM_INVALID_TASK/,
  );
});

test("playing cards are reusable through the public package", () => {
  const deck = createStandardPlayingCardDeck({ jokersPerDeck: 2 });
  assert.equal(deck.length, 54);
  const { hands, stock } = dealPlayingCardsRoundRobin(
    deck.slice(0, 7),
    ["a", "b"],
    { cardsPerPlayer: 3 },
  );
  assert.equal(hands.a?.length, 3);
  assert.equal(hands.b?.length, 3);
  assert.equal(stock.length, 1);
  assert.equal(presentPlayingCardHands(hands, "a").b?.cards, null);
});

test("drawing model is reusable through the public package", () => {
  assert.deepEqual(normalizeDrawingStroke({
    id: "stroke",
    color: "invalid",
    width: 100,
    opacity: 2,
    tool: "pen",
    points: [{ x: -1, y: 2 }],
  }), {
    id: "stroke",
    color: "#0f172a",
    width: 40,
    opacity: 1,
    tool: "pen",
    points: [{ x: 0, y: 1 }],
  });
});
