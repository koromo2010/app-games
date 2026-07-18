import { playerHasDebugAccess } from "@/lib/debug-access";
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
