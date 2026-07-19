import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { rememberTahoiyaDeviceTopicHistory } from "@/lib/tahoiya-topic-history-store";

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = await request.json() as { topicIds?: unknown };
    const savedCount = await rememberTahoiyaDeviceTopicHistory(player.id, body.topicIds);
    return Response.json({ ok: true, savedCount });
  } catch {
    return Response.json({ error: "Failed to sync topic history" }, { status: 400 });
  }
}
