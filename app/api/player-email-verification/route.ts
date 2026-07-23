import { completePlayerEmailVerification } from "@/lib/player-email-verification";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function verificationPageUrl(request: Request, status: string) {
  const url = new URL("/verify-email", request.url);
  url.searchParams.set("status", status);
  return url;
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-email-verification", { operation: "email-verification" });
  let token = "";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json() as { token?: unknown };
      token = typeof body.token === "string" ? body.token : "";
    } else {
      const form = await request.formData();
      const value = form.get("token");
      token = typeof value === "string" ? value : "";
    }
  } catch {
    telemetry.reject("auth.profile", 400, { action: "verify-email", errorCode: "INVALID_INPUT" });
    return Response.redirect(verificationPageUrl(request, "invalid"), 303);
  }

  const limited = await rateLimitResponseFor(request, rateLimitPolicies.passwordReset, { identity: token || null });
  if (limited) return Response.redirect(verificationPageUrl(request, "retry"), 303);

  try {
    await completePlayerEmailVerification(token);
    telemetry.success("auth.profile", { action: "verify-email" });
    return Response.redirect(verificationPageUrl(request, "verified"), 303);
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS") {
      telemetry.reject("auth.profile", 409, { action: "verify-email", errorCode: "EMAIL_ALREADY_EXISTS" });
      return Response.redirect(verificationPageUrl(request, "conflict"), 303);
    }
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_EMAIL_VERIFICATION_INVALID") {
      telemetry.reject("auth.profile", 400, { action: "verify-email", errorCode: "VERIFICATION_INVALID" });
      return Response.redirect(verificationPageUrl(request, "invalid"), 303);
    }
    telemetry.failure("auth.profile", error, 500, { action: "verify-email" });
    return Response.redirect(verificationPageUrl(request, "retry"), 303);
  }
}
