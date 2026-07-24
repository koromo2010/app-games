import type { GameSdkLlmRequest } from "@game-fields/game-sdk/llm";
import {
  gameSdkModuleIsRequired,
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  createGameFieldsSdkLlmGateway,
  enforceGameSdkLlmRateLimit,
  GameSdkLlmRateLimitError,
} from "@/lib/game-sdk-llm-gateway";
import {
  createRequestTelemetry,
  observabilityErrorCode,
} from "@/lib/observability";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import {
  loadSdkPreviewRuntimeDefinition,
  sdkPreviewCreatorSlugPattern,
  sdkPreviewGameIdPattern,
} from "@/lib/sdk-preview-runtime-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sdkLlmErrorResponse(error: unknown) {
  if (error instanceof GameSdkLlmRateLimitError) {
    return json(
      {
        error: error.message,
        retryAfterMs: error.retryAfterMs,
      },
      429,
      {
        "Retry-After": String(
          Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
        ),
      },
    );
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "GAME_SDK_LLM_UNAVAILABLE") {
    return json({ error: code }, 503);
  }
  if (
    code.startsWith("GAME_SDK_LLM_INVALID_")
    || code === "GAME_SDK_LLM_HIGH_QUALITY_NOT_ALLOWED"
  ) {
    return json({ error: code }, 400);
  }
  return commonOnlineRoomErrorResponse(error)
    ?? json({ error: "GAME_SDK_LLM_FAILED" }, 500);
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/sdk-preview/llm",
    { operation: "sdk-preview-llm" },
  );
  try {
    const session = await requireAuthenticatedPlayer();
    const body = objectBody(await request.json().catch(() => null));
    const creatorSlug = typeof body?.creatorSlug === "string"
      ? body.creatorSlug.trim().toLowerCase()
      : "";
    const gameId = typeof body?.gameId === "string"
      ? body.gameId.trim().toLowerCase()
      : "";
    const llmRequest = objectBody(body?.request);
    if (
      !sdkPreviewCreatorSlugPattern.test(creatorSlug)
      || !sdkPreviewGameIdPattern.test(gameId)
      || !llmRequest
    ) {
      telemetry.reject("ai.generation", 400, {
        game: `sdk-preview:${gameId || "invalid"}`,
        errorCode: "GAME_SDK_LLM_INPUT_REQUIRED",
      });
      return json({ error: "GAME_SDK_LLM_INPUT_REQUIRED" }, 400);
    }

    const definition = await loadSdkPreviewRuntimeDefinition(
      creatorSlug,
      gameId,
    );
    if (!definition) return json({ error: "SDK_GAME_NOT_FOUND" }, 404);
    const moduleProfile = normalizeGameSdkModuleProfile(
      definition.modulePolicy,
    );
    if (!gameSdkModuleIsRequired(moduleProfile, "llm")) {
      telemetry.reject("ai.generation", 403, {
        game: `sdk-preview:${gameId}`,
        errorCode: "GAME_SDK_LLM_MODULE_REQUIRED",
      });
      return json({ error: "GAME_SDK_LLM_MODULE_REQUIRED" }, 403);
    }

    const gateway = createGameFieldsSdkLlmGateway({
      gameId: `preview:${creatorSlug}:${gameId}`,
      beforeGenerate: () => enforceGameSdkLlmRateLimit(
        request,
        session.id,
      ),
    });
    const response = await gateway.generate(
      llmRequest as unknown as GameSdkLlmRequest,
    );
    telemetry.success("ai.generation", {
      game: `sdk-preview:${gameId}`,
      provider: response.generation.provider,
      model: response.generation.model,
    });
    return json({ response });
  } catch (error) {
    const response = sdkLlmErrorResponse(error);
    telemetry.responseError("ai.generation", error, response.status, {
      errorCode: observabilityErrorCode(error),
    });
    return response;
  }
}
