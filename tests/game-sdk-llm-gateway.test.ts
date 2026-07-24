import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameFieldsSdkLlmGateway,
  GameSdkLlmRateLimitError,
} from "../lib/game-sdk-llm-gateway.ts";
import { gameSdkOnlineRoomErrorResponse } from "../lib/game-sdk-online-room-http.ts";

test("SDK LLM adapter keeps provider selection behind Game Fields", async () => {
  const received: {
    prompt?: string;
    mode?: string;
    quality?: string;
  } = {};
  const times = [1_000, 1_125];
  const gateway = createGameFieldsSdkLlmGateway({
    gameId: "answer-game",
    allowHighQuality: true,
    resolveMode: async () => "free",
    now: () => times.shift() ?? 1_125,
    emitEvent: () => {},
    generateText: async (prompt, mode, options) => {
      received.prompt = prompt;
      received.mode = mode;
      received.quality = options?.quality;
      return {
        text: "はい",
        provider: "gemini" as const,
        model: "fixture-model",
        mode: "free" as const,
        billingSource: undefined,
        attemptedProviders: ["gemini" as const],
        latencyMs: 100,
      };
    },
  });

  const response = await gateway.generate({
    task: "answer-question",
    prompt: "質問に答えてください。",
    promptVersion: "answer-question-v1",
    quality: "high",
    responseJsonSchema: {
      name: "answer",
      schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      },
    },
  });

  assert.deepEqual(received, {
    prompt: "質問に答えてください。",
    mode: "free",
    quality: "high",
  });
  assert.equal(response.text, "はい");
  assert.deepEqual(response.generation, {
    provider: "gemini",
    model: "fixture-model",
    mode: "free",
    billingSource: undefined,
    promptVersion: "answer-question-v1",
    latencyMs: 125,
    retrievedFeedbackIds: [],
  });
});

test("SDK LLM adapter rejects unavailable and unapproved expensive modes", async () => {
  const localGateway = createGameFieldsSdkLlmGateway({
    gameId: "answer-game",
    resolveMode: async () => "local",
  });
  await assert.rejects(
    localGateway.generate({
      task: "answer-question",
      prompt: "質問",
      promptVersion: "v1",
    }),
    /GAME_SDK_LLM_UNAVAILABLE/,
  );

  const previewGateway = createGameFieldsSdkLlmGateway({
    gameId: "preview:creator:answer-game",
    resolveMode: async () => "free",
  });
  await assert.rejects(
    previewGateway.generate({
      task: "answer-question",
      prompt: "質問",
      promptVersion: "v1",
      quality: "high",
    }),
    /GAME_SDK_LLM_HIGH_QUALITY_NOT_ALLOWED/,
  );
});

test("SDK room transport returns a retryable response for AI rate limits", async () => {
  const response = gameSdkOnlineRoomErrorResponse(
    new GameSdkLlmRateLimitError(2_500),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "3");
  assert.deepEqual(await response.json(), {
    error: "GAME_SDK_LLM_RATE_LIMITED",
    retryAfterMs: 2_500,
  });
});
