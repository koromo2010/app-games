import {
  loginPlayerAccount,
  registerPlayerAccount,
  updatePlayerAccountEmail,
  type PlayerAccountAuthInput,
} from "@/lib/player-account-store";
import { clearPlayerAuthCookie, getAuthenticatedPlayer, isPlayerAuthConfigurationError, setPlayerAuthCookie } from "@/lib/player-auth";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

type PlayerAccountRequest = PlayerAccountAuthInput & {
  mode?: "login" | "register" | "update-email" | "logout";
};

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET() {
  try {
    const session = await getAuthenticatedPlayer();
    if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    return Response.json({ session });
  } catch (error) {
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    if (isStoreNotConfigured(error)) return Response.json({ error: "STORE_NOT_CONFIGURED" }, { status: 503 });
    return Response.json({ error: "UNKNOWN" }, { status: 500 });
  }
}

function statusForError(error: unknown) {
  if (!(error instanceof Error)) return { code: "UNKNOWN", status: 500 };

  switch (error.message) {
    case "PLAYER_ACCOUNT_NAME_REQUIRED":
      return { code: "NAME_REQUIRED", status: 400 };
    case "PLAYER_ACCOUNT_PASSWORD_INVALID":
      return { code: "PASSWORD_INVALID", status: 400 };
    case "PLAYER_ACCOUNT_ALREADY_EXISTS":
      return { code: "ALREADY_EXISTS", status: 409 };
    case "PLAYER_ACCOUNT_EMAIL_INVALID":
      return { code: "EMAIL_INVALID", status: 400 };
    case "PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS":
      return { code: "EMAIL_ALREADY_EXISTS", status: 409 };
    case "PLAYER_ACCOUNT_INVALID_CREDENTIALS":
      return { code: "INVALID_CREDENTIALS", status: 401 };
    default:
      return { code: "UNKNOWN", status: 500 };
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-account", { operation: "player-auth" });
  let body: PlayerAccountRequest;
  let logFields: ObservabilityFields = {};

  try {
    body = (await request.json()) as PlayerAccountRequest;
    logFields = { action: body.mode ?? "login" };
  } catch {
    telemetry.reject("auth.session", 400, { action: "invalid-json" });
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    if (body.mode === "logout") {
      const previous = await getAuthenticatedPlayer().catch(() => null);
      await clearPlayerAuthCookie();
      telemetry.success("auth.session", { ...logFields, actorRef: telemetry.actorRef(previous?.id) });
      return Response.json({ ok: true });
    }
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.auth, {
      identity: typeof body.name === "string" ? body.name : null,
    });
    if (limited) return limited;
    const session = body.mode === "register"
      ? await registerPlayerAccount(body)
      : body.mode === "update-email"
        ? await updatePlayerAccountEmail(body)
        : await loginPlayerAccount(body);

    if (!session.id) throw new Error("PLAYER_ACCOUNT_SESSION_INVALID");
    await setPlayerAuthCookie(session.id);
    telemetry.success("auth.session", { ...logFields, actorRef: telemetry.actorRef(session.id) });
    return Response.json({ session });
  } catch (error) {
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("auth.session", error, 503, logFields);
      return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("auth.session", error, 503, logFields);
      return Response.json({ error: "STORE_NOT_CONFIGURED" }, { status: 503 });
    }

    const mapped = statusForError(error);
    telemetry.responseError("auth.session", error, mapped.status, logFields);
    return Response.json({ error: mapped.code }, { status: mapped.status });
  }
}
