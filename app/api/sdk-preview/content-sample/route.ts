import { createGameFieldsSdkContentSource } from "@/lib/game-sdk-content-source";
import {
  isPlayerAuthConfigurationError,
  requireAuthenticatedPlayer,
} from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unavailableErrors = new Set([
  "APP_DATABASE_ENV_MISSING_OR_INVALID",
  "APP_DATABASE_ENV_MISMATCH",
  "APP_ENV_MISSING_OR_INVALID",
  "APP_ENV_VERCEL_ENV_MISMATCH",
  "GAME_SDK_CONTENT_ID_SECRET_UNAVAILABLE",
  "GAME_SDK_CONTENT_UNAVAILABLE",
  "POSTGRES_STORE_NOT_CONFIGURED",
]);

export async function GET(request: Request) {
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(
      request,
      rateLimitPolicies.sdkContentRead,
      { playerId: player.id },
    );
    if (limited) return limited;
    const [word] = await createGameFieldsSdkContentSource().drawWords({
      pool: "general-words",
      difficulty: "normal",
      count: 1,
    });
    if (!word) throw new Error("GAME_SDK_CONTENT_UNAVAILABLE");
    return Response.json({
      word,
      source: "game-fields-content-source",
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (
      isPlayerAuthConfigurationError(error)
      || (error instanceof Error && unavailableErrors.has(error.message))
    ) {
      return Response.json(
        { error: "SDK content source is unavailable" },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Failed to load SDK content sample" },
      { status: 500 },
    );
  }
}
