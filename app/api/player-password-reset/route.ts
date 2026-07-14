import {
  completePlayerPasswordReset,
  requestPlayerPasswordReset,
} from "@/lib/player-password-reset";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

type ResetRequest = {
  action?: "request" | "complete";
  email?: unknown;
  token?: unknown;
  password?: unknown;
};

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-password-reset", { operation: "password-reset" });
  let body: ResetRequest;
  try {
    body = (await request.json()) as ResetRequest;
  } catch {
    telemetry.reject("auth.password-reset", 400, { errorCode: "INVALID_JSON" });
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const action = body.action === "complete" ? "complete" : "request";
  try {
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.passwordReset, {
      identity: body.action === "complete"
        ? (typeof body.token === "string" ? body.token : null)
        : (typeof body.email === "string" ? body.email : null),
    });
    if (limited) return limited;
    if (body.action === "complete") {
      await completePlayerPasswordReset(
        typeof body.token === "string" ? body.token : "",
        typeof body.password === "string" ? body.password : "",
      );
      telemetry.success("auth.password-reset", { action });
      return Response.json({ ok: true });
    }

    const origin = new URL(request.url).origin;
    await requestPlayerPasswordReset(typeof body.email === "string" ? body.email : "", origin);
    telemetry.success("auth.password-reset", { action });
    return Response.json({ ok: true });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("auth.password-reset", error, 503, { action });
      return Response.json({ error: "STORE_NOT_CONFIGURED" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_PASSWORD_INVALID") {
      telemetry.responseError("auth.password-reset", error, 400, { action });
      return Response.json({ error: "PASSWORD_INVALID" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_RESET_INVALID") {
      telemetry.responseError("auth.password-reset", error, 400, { action });
      return Response.json({ error: "RESET_INVALID" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "EMAIL_SERVICE_NOT_CONFIGURED") {
      telemetry.responseError("auth.password-reset", error, 503, { action });
      return Response.json({ error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
    }
    telemetry.failure("auth.password-reset", error, 500, { action });
    return Response.json({ error: "UNKNOWN" }, { status: 500 });
  }
}
