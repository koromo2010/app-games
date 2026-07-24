import {
  defineGameSdkLlmGateway,
  type GameSdkLlmGateway,
  type GameSdkLlmRequest,
} from "@game-fields/game-sdk/llm";
import type {
  GameLlmMode,
  generateGameLlmText,
} from "./game-llm.ts";

type GenerateGameLlmText = typeof generateGameLlmText;
type ObservabilityLevel = "info" | "warn";
type ObservabilityFields = Record<string, string | number | boolean | undefined>;

type GameFieldsSdkLlmGatewayOptions = {
  gameId: string;
  allowHighQuality?: boolean;
  beforeGenerate?: (
    request: Readonly<GameSdkLlmRequest>,
  ) => void | Promise<void>;
  resolveMode?: () => Promise<GameLlmMode>;
  generateText?: GenerateGameLlmText;
  now?: () => number;
  emitEvent?: (
    level: ObservabilityLevel,
    event: string,
    fields: ObservabilityFields,
  ) => void | Promise<void>;
};

function normalizedGameId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/.test(normalized)) {
    throw new Error("GAME_SDK_LLM_INVALID_GAME");
  }
  return normalized;
}

/**
 * The only adapter from approved SDK game code to Game Fields' shared LLM
 * gateway. Provider clients, API keys, access cookies and fallback order stay
 * behind this server-only boundary.
 */
export function createGameFieldsSdkLlmGateway({
  gameId: gameIdInput,
  allowHighQuality = false,
  beforeGenerate,
  resolveMode = async () => (
    await import("./game-llm.ts")
  ).resolveGameLlmMode(),
  generateText = async (...parameters) => (
    await import("./game-llm.ts")
  ).generateGameLlmText(...parameters),
  now = Date.now,
  emitEvent = async (level, event, fields) => {
    const { emitObservabilityEvent } = await import("./observability/index.ts");
    emitObservabilityEvent(level, event, fields);
  },
}: GameFieldsSdkLlmGatewayOptions): GameSdkLlmGateway {
  const gameId = normalizedGameId(gameIdInput);

  return defineGameSdkLlmGateway({
    async generate(request) {
      if (request.quality === "high" && !allowHighQuality) {
        throw new Error("GAME_SDK_LLM_HIGH_QUALITY_NOT_ALLOWED");
      }
      await beforeGenerate?.(request);

      const mode = await resolveMode();
      if (mode === "local") throw new Error("GAME_SDK_LLM_UNAVAILABLE");

      const startedAt = now();
      await emitEvent("info", "ai.generation", {
        game: `sdk:${gameId}`,
        operation: request.task,
        outcome: "started",
      });
      try {
        const generated = await generateText(request.prompt, mode, {
          quality: request.quality,
          responseJsonSchema: request.responseJsonSchema,
          timeoutMs: request.timeoutMs,
        });
        const latencyMs = Math.max(0, now() - startedAt);
        await emitEvent("info", "ai.generation", {
          game: `sdk:${gameId}`,
          operation: request.task,
          provider: generated.provider,
          model: generated.model,
          durationMs: latencyMs,
          outcome: "success",
        });
        return {
          text: generated.text,
          generation: {
            provider: generated.provider,
            model: generated.model,
            mode: generated.mode,
            billingSource: generated.billingSource,
            promptVersion: request.promptVersion,
            latencyMs,
            retrievedFeedbackIds: [],
          },
        };
      } catch (error) {
        const errorCode = error instanceof Error
          ? error.message.split(":", 1)[0]?.trim() || error.name
          : "UNEXPECTED_ERROR";
        await emitEvent("warn", "ai.generation", {
          game: `sdk:${gameId}`,
          operation: request.task,
          durationMs: Math.max(0, now() - startedAt),
          outcome: "failed",
          errorCode,
        });
        if (
          error instanceof Error
          && error.message === "GAME_LLM_UNAVAILABLE"
        ) {
          throw new Error("GAME_SDK_LLM_UNAVAILABLE");
        }
        throw error;
      }
    },
  });
}

export class GameSdkLlmRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("GAME_SDK_LLM_RATE_LIMITED");
    this.name = "GameSdkLlmRateLimitError";
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

/** Counts only actual SDK LLM generations, not every room Command. */
export async function enforceGameSdkLlmRateLimit(
  request: Request,
  playerId: string,
) {
  const {
    checkRateLimit,
    rateLimitPolicies,
  } = await import("./rate-limit.ts");
  const result = await checkRateLimit(
    request,
    rateLimitPolicies.aiGeneration,
    { playerId },
  );
  if (!result.allowed) {
    throw new GameSdkLlmRateLimitError(result.retryAfterMs);
  }
}
