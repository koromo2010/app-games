import { playerHasDebugAccess } from "@/lib/debug-access";
import { loadGameSdkFeedbackArtifacts } from "@/lib/game-sdk-feedback-store";
import { loadApprovedGameSdkRuntimeRegistration } from "@/lib/game-sdk-runtime-catalog";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { createRequestTelemetry } from "@/lib/observability";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { gameId: rawGameId } = await context.params;
  const gameId = rawGameId.trim().toLowerCase();
  const telemetry = createRequestTelemetry(
    request,
    `/api/game-sdk/${gameId}/feedback`,
    { game: `sdk:${gameId}`, operation: "feedback-artifacts" },
  );
  try {
    const registration = approvedGameSdkRegistration(gameId)
      ?? await loadApprovedGameSdkRuntimeRegistration(gameId);
    if (
      !registration
      || !registration.usesLlm
      || registration.moduleProfile.feedback.mode !== "required"
    ) {
      return Response.json({ artifacts: [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(
      request,
      rateLimitPolicies.sdkRuntimeRead,
      { playerId: session.id },
    );
    if (limited) return limited;
    const roomCode = new URL(request.url).searchParams.get("roomCode")
      ?.trim().toUpperCase() ?? "";
    if (!roomCode) {
      return Response.json({ error: "ROOM_CODE_REQUIRED" }, { status: 400 });
    }
    const identity = {
      playerId: session.id,
      displayName: session.name,
      debugAccess: registration.supportsDebug
        ? await playerHasDebugAccess(session.id)
        : false,
    };
    const room = await registration.createAdapter(
      async () => identity,
      request,
      session.id,
    ).readRoom(roomCode);
    const common = room?.view && typeof room.view === "object"
      ? (room.view as { common?: { isMember?: unknown } }).common
      : undefined;
    if (
      !room
      || room.phase !== "result"
      || common?.isMember !== true
    ) {
      telemetry.reject("feedback.read", 403, {
        actorRef: telemetry.actorRef(session.id),
      });
      return Response.json({ error: "FEEDBACK_ACCESS_DENIED" }, {
        status: 403,
      });
    }
    return Response.json({
      artifacts: await loadGameSdkFeedbackArtifacts({
        runtimeId: registration.id,
        roomCode: room.code,
      }),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "PLAYER_AUTH_REQUIRED"
    ) {
      return Response.json({ error: "PLAYER_AUTH_REQUIRED" }, { status: 401 });
    }
    telemetry.failure("feedback.read", error, 503);
    return Response.json({ error: "FEEDBACK_UNAVAILABLE" }, { status: 503 });
  }
}
