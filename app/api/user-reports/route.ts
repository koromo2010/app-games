import { createRequestTelemetry } from "@/lib/observability";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { saveUserReport, type UserReportType } from "@/lib/user-report-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/user-reports", { operation: "user-report-save" });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  const type: UserReportType | null = body.type === "bug" || body.type === "request" ? body.type : null;
  const summary = clean(body.summary, 120);
  if (!type || !summary) return Response.json({ error: "Type and summary are required" }, { status: 400 });

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback, { playerId: player.id });
    if (limited) return limited;
    const report = await saveUserReport({ type, summary, details: clean(body.details, 1200), page: clean(body.page, 200), playerId: player.id });
    telemetry.success("user-report.save", { action: type, actorRef: telemetry.actorRef(player.id) });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    telemetry.failure("user-report.save", error, 503, { action: type });
    return Response.json({ error: "Report could not be saved" }, { status: 503 });
  }
}
