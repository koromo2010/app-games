import {
  loadGameSdkPlayerDefaults,
  saveGameSdkPlayerDefaults,
} from "@/lib/game-sdk-player-defaults-store";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

async function target(context: RouteContext) {
  const { gameId: rawGameId } = await context.params;
  const gameId = rawGameId.trim().toLowerCase();
  return {
    gameId,
    registration: approvedGameSdkRegistration(gameId),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { gameId, registration } = await target(context);
  if (!registration) {
    return Response.json({ error: "GAME_SDK_NOT_AVAILABLE" }, { status: 404 });
  }
  const player = await requireAuthenticatedPlayer();
  const settings = await loadGameSdkPlayerDefaults(
    player.id,
    gameId,
    registration.settings,
  );
  return Response.json({ settings }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { gameId, registration } = await target(context);
  if (!registration) {
    return Response.json({ error: "GAME_SDK_NOT_AVAILABLE" }, { status: 404 });
  }
  const player = await requireAuthenticatedPlayer();
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.roomMutation,
    { playerId: player.id },
  );
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    settings?: unknown;
  } | null;
  const settings = await saveGameSdkPlayerDefaults(
    player.id,
    gameId,
    registration.settings,
    body?.settings,
  );
  return Response.json({ settings });
}
