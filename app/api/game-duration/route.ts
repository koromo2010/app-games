import { createHash } from "node:crypto";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { recordGameDurationSample } from "@/lib/game-duration-store";
import { createRequestTelemetry } from "@/lib/observability";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

type LocalDurationBody = {
  gameType?: unknown;
  id?: unknown;
  startedAt?: unknown;
};

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/game-duration", { operation: "duration-record" });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) return Response.json({ error: "INVALID_DURATION_SAMPLE" }, { status: 400 });

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation, { playerId: player.id });
    if (limited) return limited;
    const rawBody = await request.text();
    if (rawBody.length > 4_096) return Response.json({ error: "INVALID_DURATION_SAMPLE" }, { status: 400 });
    let body: LocalDurationBody;
    try {
      body = JSON.parse(rawBody) as LocalDurationBody;
    } catch {
      return Response.json({ error: "INVALID_DURATION_SAMPLE" }, { status: 400 });
    }
    if (body.gameType !== "daifugo"
      || typeof body.id !== "string"
      || !/^[0-9a-f-]{20,80}$/i.test(body.id)
      || typeof body.startedAt !== "number"
      || !Number.isFinite(body.startedAt)) {
      return Response.json({ error: "INVALID_DURATION_SAMPLE" }, { status: 400 });
    }
    const accessDenied = await gameApiAccessDeniedResponse("daifugo");
    if (accessDenied) return accessDenied;
    const eventId = createHash("sha256").update(`daifugo:${player.id}:${body.id}`).digest("base64url");
    const recorded = await recordGameDurationSample({
      id: eventId,
      gameType: "daifugo",
      startedAt: body.startedAt,
      finishedAt: Date.now(),
      playerCount: 4,
      variantKey: "mode=local-cpu;players=4;rules=basic-v1",
    });
    telemetry.success("game.duration", { game: "daifugo", actorRef: telemetry.actorRef(player.id), applied: recorded });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    telemetry.failure("game.duration", error, 500, { game: "daifugo" });
    return Response.json({ error: "DURATION_RECORD_FAILED" }, { status: 500 });
  }
}
