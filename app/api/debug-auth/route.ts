import { createRequestTelemetry } from "@/lib/observability";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/debug-auth", { operation: "debug-access" });
  const configuredPassword = process.env.DEBUG_MODE_PASSWORD?.trim();

  if (!configuredPassword) {
    telemetry.reject("auth.access", 503, { action: "enable-debug", errorCode: "DEBUG_AUTH_NOT_CONFIGURED" });
    return Response.json(
      { error: "DEBUG_MODE_PASSWORD is not configured." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    telemetry.reject("auth.access", 400, { action: "enable-debug", errorCode: "INVALID_JSON" });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (password !== configuredPassword) {
    telemetry.reject("auth.access", 401, { action: "enable-debug", errorCode: "INVALID_CREDENTIAL" });
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  telemetry.success("auth.access", { action: "enable-debug" });
  return Response.json({ ok: true });
}
