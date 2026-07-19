import { loadCodeInterceptPlayerActiveRoom } from "@/lib/code-intercept-room-store";
import { loadHodoaiPlayerActiveRoom } from "@/lib/hodoai-room-store";
import { loadKotobaSenpukuPlayerActiveRoom } from "@/lib/kotoba-senpuku-room-store";
import { loadNigoichiPlayerActiveRoom } from "@/lib/nigoichi-room-store";
import { loadNorthernPlayerActiveRoom } from "@/lib/northern-branch-room-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { summarizePlayerActiveRoom, type PlayerActiveRoomSummarySource } from "@/lib/player-active-room-summary";
import { loadStoredTahoiyaPlayerActiveRoom } from "@/lib/tahoiya-room-store";
import { loadStoredPlayerActiveRoom } from "@/lib/wordwolf-room-store";

const loaders = {
  wordwolf: loadStoredPlayerActiveRoom,
  tahoiya: loadStoredTahoiyaPlayerActiveRoom,
  "northern-branch": loadNorthernPlayerActiveRoom,
  hodoai: loadHodoaiPlayerActiveRoom,
  "kotoba-senpuku": loadKotobaSenpukuPlayerActiveRoom,
  nigoichi: loadNigoichiPlayerActiveRoom,
  "code-intercept": loadCodeInterceptPlayerActiveRoom,
} satisfies Record<string, (playerId: string) => Promise<PlayerActiveRoomSummarySource | null>>;

export async function GET() {
  try {
    const player = await requireAuthenticatedPlayer();
    const entries = await Promise.all(Object.entries(loaders).map(async ([gameId, loadRoom]) => {
      const room = await loadRoom(player.id).catch(() => null);
      const summary = summarizePlayerActiveRoom(room);
      return summary ? [gameId, summary] as const : null;
    }));
    return Response.json({
      rooms: Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      return Response.json({ error: "Login required." }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      return Response.json({ error: "Player auth is not configured." }, { status: 503 });
    }
    return Response.json({ error: "Failed to load active rooms." }, { status: 500 });
  }
}
