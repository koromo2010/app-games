import { createRequestTelemetry } from "@/lib/observability";
import { playerHasDebugAccess, setPlayerDebugAccess } from "@/lib/debug-access";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";

export async function GET() {
  try {
    const player = await requireAuthenticatedPlayer();
    return Response.json({ enabled: await playerHasDebugAccess(player.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    return Response.json({ error: "Failed to load debug access" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/debug-auth", { operation: "debug-access" });
  const configuredPassword = process.env.DEBUG_MODE_PASSWORD?.trim();

  let password = "";
  let enabled = true;
  try {
    const body = (await request.json()) as { password?: unknown; enabled?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    enabled = body.enabled !== false;
  } catch {
    telemetry.reject("auth.access", 400, { action: "enable-debug", errorCode: "INVALID_JSON" });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (enabled && !configuredPassword) {
    telemetry.reject("auth.access", 503, { action: "enable-debug", errorCode: "DEBUG_AUTH_NOT_CONFIGURED" });
    return Response.json({ error: "DEBUG_MODE_PASSWORD is not configured." }, { status: 503 });
  }

  if (enabled && password !== configuredPassword) {
    telemetry.reject("auth.access", 401, { action: "enable-debug", errorCode: "INVALID_CREDENTIAL" });
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  try {
    const player = await requireAuthenticatedPlayer();
    await setPlayerDebugAccess(player.id, enabled);
    telemetry.success("auth.access", { action: enabled ? "enable-debug" : "disable-debug", actorRef: telemetry.actorRef(player.id) });
    return Response.json({ ok: true, enabled });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    telemetry.responseError("auth.access", error, 500, { action: enabled ? "enable-debug" : "disable-debug" });
    return Response.json({ error: "Failed to save debug access" }, { status: 500 });
  }
}
