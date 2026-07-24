import type {
  GameSdkDrawWordPairsRequest,
  GameSdkDrawWordsRequest,
  GameSdkFindDefinitionsRequest,
} from "@game-fields/game-sdk/content-source";
import {
  gameSdkModuleIsRequired,
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { createGameFieldsSdkContentSource } from "@/lib/game-sdk-content-source";
import {
  isPlayerAuthConfigurationError,
} from "@/lib/player-auth";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  requireSdkPreviewAuthenticatedPlayer,
} from "@/lib/sdk-preview-account-session";
import {
  loadSdkPreviewRuntimeDefinition,
  sdkPreviewCreatorSlugPattern,
  sdkPreviewGameIdPattern,
} from "@/lib/sdk-preview-runtime-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContentOperation =
  | "drawWords"
  | "drawWordPairs"
  | "findDefinitions";

type ContentStage =
  | "input"
  | "session"
  | "rate-limit"
  | "runtime"
  | "module-profile"
  | "content-source";

const contentOperations = new Set<ContentOperation>([
  "drawWords",
  "drawWordPairs",
  "findDefinitions",
]);

const unavailableErrors = new Set([
  "APP_DATABASE_ENV_MISSING_OR_INVALID",
  "APP_DATABASE_ENV_MISMATCH",
  "APP_ENV_MISSING_OR_INVALID",
  "APP_ENV_VERCEL_ENV_MISMATCH",
  "GAME_SDK_CONTENT_ID_SECRET_UNAVAILABLE",
  "GAME_SDK_CONTENT_UNAVAILABLE",
  "POSTGRES_STORE_NOT_CONFIGURED",
  "VOCABULARY_STORE_NOT_CONFIGURED",
]);

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeDatabaseErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
    ? code
    : undefined;
}

function contentErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (
    code.startsWith("GAME_SDK_CONTENT_INVALID_")
    || code === "GAME_SDK_CONTENT_TOO_MANY_EXCLUSIONS"
    || code === "GAME_SDK_CONTENT_WORD_POOL_REQUIRED"
    || code === "GAME_SDK_CONTENT_PAIR_POOL_REQUIRED"
    || code === "GAME_SDK_CONTENT_WORD_IDS_REQUIRED"
  ) {
    return json({ error: code }, 400);
  }
  if (isPlayerAuthConfigurationError(error) || unavailableErrors.has(code)) {
    return json({ error: "GAME_SDK_CONTENT_UNAVAILABLE" }, 503);
  }
  if (code === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED") {
    return json({ error: "GAME_SDK_CONTENT_UNAVAILABLE" }, 503);
  }
  if (code === "PLAYER_AUTH_REQUIRED") {
    return json({ error: code }, 401);
  }
  return json({ error: "GAME_SDK_CONTENT_FAILED" }, 500);
}

async function runContentOperation(
  operation: ContentOperation,
  request: Record<string, unknown>,
) {
  const source = createGameFieldsSdkContentSource();
  if (operation === "drawWords") {
    return source.drawWords(
      request as unknown as GameSdkDrawWordsRequest,
    );
  }
  if (operation === "drawWordPairs") {
    return source.drawWordPairs(
      request as unknown as GameSdkDrawWordPairsRequest,
    );
  }
  return source.findDefinitions(
    request as unknown as GameSdkFindDefinitionsRequest,
  );
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/sdk-preview/content-source",
    { operation: "sdk-preview-content-source" },
  );
  let stage: ContentStage = "input";
  let operation: ContentOperation | null = null;
  try {
    const body = objectBody(await request.json().catch(() => null));
    const creatorSlug = typeof body?.creatorSlug === "string"
      ? body.creatorSlug.trim().toLowerCase()
      : "";
    const gameId = typeof body?.gameId === "string"
      ? body.gameId.trim().toLowerCase()
      : "";
    operation = typeof body?.operation === "string"
      && contentOperations.has(body.operation as ContentOperation)
      ? body.operation as ContentOperation
      : null;
    const contentRequest = objectBody(body?.request);
    if (
      !sdkPreviewCreatorSlugPattern.test(creatorSlug)
      || !sdkPreviewGameIdPattern.test(gameId)
      || !operation
      || !contentRequest
    ) {
      return json({ error: "GAME_SDK_CONTENT_INPUT_REQUIRED" }, 400);
    }

    stage = "session";
    const session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
    stage = "rate-limit";
    const limited = await rateLimitResponseFor(
      request,
      rateLimitPolicies.sdkContentRead,
      { playerId: session.id },
    );
    if (limited) return limited;

    stage = "runtime";
    const definition = await loadSdkPreviewRuntimeDefinition(
      creatorSlug,
      gameId,
    );
    if (!definition) return json({ error: "SDK_GAME_NOT_FOUND" }, 404);
    stage = "module-profile";
    const moduleProfile = normalizeGameSdkModuleProfile(
      definition.modulePolicy,
    );
    if (!gameSdkModuleIsRequired(moduleProfile, "content-source")) {
      return json({ error: "GAME_SDK_CONTENT_MODULE_REQUIRED" }, 403);
    }

    stage = "content-source";
    const response = await runContentOperation(operation, contentRequest);
    return json({ response });
  } catch (error) {
    const response = contentErrorResponse(error);
    telemetry.responseError("sdk.resource", error, response.status, {
      action: "content-source",
      operation: operation ?? undefined,
      phase: stage,
      databaseCode: safeDatabaseErrorCode(error),
    });
    return response;
  }
}
