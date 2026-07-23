import {
  loginPlayerAccount,
  registerPlayerAccount,
  deletePlayerAccount,
  refreshPlayerAccountSession,
  type PlayerAccountAuthInput,
} from "@/lib/player-account-store";
import {
  requestPlayerEmailVerification,
  resendPlayerEmailVerification,
} from "@/lib/player-email-verification";
import { clearPlayerAuthCookie, getAuthenticatedPlayer, isPlayerAuthConfigurationError, setPlayerAuthCookie } from "@/lib/player-auth";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

type PlayerAccountRequest = PlayerAccountAuthInput & {
  mode?: "login" | "register" | "update-email" | "resend-email-verification" | "delete" | "logout";
};

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET() {
  try {
    const session = await getAuthenticatedPlayer();
    if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const refreshed = session.id ? await refreshPlayerAccountSession(session.id) : null;
    return Response.json({ session: refreshed ?? session });
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
    case "PLAYER_ACCOUNT_EMAIL_NOT_REGISTERED":
      return { code: "EMAIL_NOT_REGISTERED", status: 404 };
    case "PLAYER_ACCOUNT_INVALID_CREDENTIALS":
      return { code: "INVALID_CREDENTIALS", status: 401 };
    case "PLAYER_ACCOUNT_TERMS_REQUIRED":
      return { code: "TERMS_REQUIRED", status: 400 };
    case "EMAIL_SERVICE_NOT_CONFIGURED":
      return { code: "EMAIL_NOT_CONFIGURED", status: 503 };
    case "EMAIL_SEND_FAILED":
      return { code: "EMAIL_SEND_FAILED", status: 502 };
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
    if (body.mode === "delete") {
      const authenticated = await getAuthenticatedPlayer();
      if (!authenticated?.id) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
      const limited = await rateLimitResponseFor(request, rateLimitPolicies.auth, { identity: authenticated.id });
      if (limited) return limited;
      await deletePlayerAccount(body, authenticated.id);
      await clearPlayerAuthCookie();
      telemetry.success("auth.session", { ...logFields, actorRef: telemetry.actorRef(authenticated.id) });
      return Response.json({ ok: true });
    }
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.auth, {
      identity: typeof body.name === "string" ? body.name : null,
    });
    if (limited) return limited;
    const origin = new URL(request.url).origin;
    let session;
    let emailVerificationPending = false;
    let emailVerificationError: string | undefined;
    if (body.mode === "register") {
      session = await registerPlayerAccount(body);
      if (body.email?.trim()) {
        try {
          const verification = await requestPlayerEmailVerification(body, origin);
          session = verification.session;
          emailVerificationPending = verification.pending;
        } catch (error) {
          if (error instanceof Error && (
            error.message === "EMAIL_SERVICE_NOT_CONFIGURED"
            || error.message === "EMAIL_SEND_FAILED"
            || error.message === "PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS"
          )) {
            emailVerificationError = error.message === "EMAIL_SERVICE_NOT_CONFIGURED"
              ? "EMAIL_NOT_CONFIGURED"
              : error.message === "PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS"
                ? "EMAIL_ALREADY_EXISTS"
                : "EMAIL_SEND_FAILED";
          } else {
            throw error;
          }
        }
      }
    } else if (body.mode === "update-email") {
      const verification = await requestPlayerEmailVerification(body, origin);
      session = verification.session;
      emailVerificationPending = verification.pending;
    } else if (body.mode === "resend-email-verification") {
      const authenticated = await getAuthenticatedPlayer();
      if (!authenticated?.id) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
      const verification = await resendPlayerEmailVerification(body, authenticated.id, origin);
      session = verification.session;
      emailVerificationPending = verification.pending;
    } else {
      session = await loginPlayerAccount(body);
    }

    if (!session.id) throw new Error("PLAYER_ACCOUNT_SESSION_INVALID");
    await setPlayerAuthCookie(session.id);
    telemetry.success("auth.session", { ...logFields, actorRef: telemetry.actorRef(session.id) });
    return Response.json({ session, emailVerificationPending, ...(emailVerificationError ? { emailVerificationError } : {}) });
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
