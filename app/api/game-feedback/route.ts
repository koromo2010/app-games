import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { loadGameFeedback, saveGameFeedback } from "@/lib/game-feedback-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const artifactId = cleanString(url.searchParams.get("artifactId"), 200);
  const requestedPlayerId = cleanString(url.searchParams.get("playerId"), 100);
  if (!artifactId) return Response.json({ feedback: null });

  try {
    const player = await requireAuthenticatedPlayer();
    if (requestedPlayerId && requestedPlayerId !== player.id) return Response.json({ error: "Feedback access is not allowed" }, { status: 403 });
    return Response.json({ feedback: await loadGameFeedback(artifactId, player.id!) });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    return Response.json({ feedback: null });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/game-feedback", { operation: "feedback-save" });
  let logFields: ObservabilityFields = {};
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    telemetry.reject("feedback.save", 400);
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const generation = normalizeGameGenerationMeta(body.generation);
  const rating = body.rating === "good" || body.rating === "bad" ? body.rating : null;
  const artifactId = cleanString(body.artifactId, 200);
  const requestedPlayerId = cleanString(body.playerId, 100);
  const game = cleanString(body.game, 50);
  const task = cleanString(body.task, 80);
  logFields = { game, action: `${task || "unknown"}:${rating || "invalid"}` };
  if (!generation || !rating || !artifactId || !game || !task) {
    telemetry.reject("feedback.save", 400, logFields);
    return Response.json({ error: "Missing feedback fields." }, { status: 400 });
  }

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback, { playerId: player.id });
    if (limited) return limited;
    logFields = { ...logFields, actorRef: telemetry.actorRef(player.id) };
    if (requestedPlayerId && requestedPlayerId !== player.id) {
      telemetry.reject("feedback.save", 403, logFields);
      return Response.json({ error: "Feedback access is not allowed" }, { status: 403 });
    }
    const feedback = await saveGameFeedback({
      artifactId,
      artifactText: cleanString(body.artifactText, 1200),
      game,
      task,
      rating,
      reasonTags: Array.isArray(body.reasonTags)
        ? body.reasonTags.map((tag) => cleanString(tag, 80)).filter(Boolean).slice(0, 8)
        : [],
      comment: cleanString(body.comment, 800),
      playerId: player.id!,
      generation,
      settings: body.settings && typeof body.settings === "object"
        ? body.settings as Record<string, string | number | boolean>
        : {},
      outcome: body.outcome && typeof body.outcome === "object"
        ? body.outcome as Record<string, string | number | boolean>
        : {},
    });
    telemetry.success("feedback.save", logFields);
    return Response.json({ feedback });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("feedback.save", error, 401, logFields);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("feedback.save", error, 503, logFields);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    telemetry.failure("feedback.save", error, 503, logFields);
    return Response.json({ error: "Feedback could not be saved." }, { status: 503 });
  }
}
