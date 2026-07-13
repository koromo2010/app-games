import { saveStoredPlayerSession } from "@/lib/player-store";
import { normalizePlayerName } from "@/lib/player-session";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry } from "@/lib/observability";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && (
    error.message === "PLAYER_STORE_NOT_CONFIGURED" ||
    error.message === "REDIS_STORE_NOT_CONFIGURED"
  );
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-session", { operation: "profile-read" });
  try {
    const session = await requireAuthenticatedPlayer();
    return Response.json({ session });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required." }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("auth.profile-read", error, 503);
      return Response.json({ error: "Player auth is not configured." }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("auth.profile-read", error, 503);
      return Response.json({ error: "Player store is not configured." }, { status: 503 });
    }

    telemetry.failure("auth.profile-read", error);
    return Response.json({ error: "Failed to load player." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-session", { operation: "profile-update" });
  let body: {
    id?: unknown;
    name?: unknown;
    avatarColor?: unknown;
    avatarImage?: unknown;
    createdAt?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    telemetry.reject("auth.profile", 400, { action: "update", errorCode: "INVALID_JSON" });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const authenticated = await requireAuthenticatedPlayer();
    const logFields = { action: "update", actorRef: telemetry.actorRef(authenticated.id) };
    const session = await saveStoredPlayerSession({
      id: authenticated.id,
      name: normalizePlayerName(typeof body.name === "string" ? body.name : ""),
      avatarColor: typeof body.avatarColor === "string" ? body.avatarColor : "",
      avatarImage: typeof body.avatarImage === "string" ? body.avatarImage : null,
      createdAt: typeof body.createdAt === "number" ? body.createdAt : undefined,
    });

    telemetry.success("auth.profile", logFields);
    return Response.json({ session });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("auth.profile", error, 401, { action: "update" });
      return Response.json({ error: "Login required." }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("auth.profile", error, 503, { action: "update" });
      return Response.json({ error: "Player auth is not configured." }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("auth.profile", error, 503, { action: "update" });
      return Response.json({ error: "Player store is not configured." }, { status: 503 });
    }

    telemetry.failure("auth.profile", error, 500, { action: "update" });
    return Response.json({ error: "Failed to save player." }, { status: 500 });
  }
}
