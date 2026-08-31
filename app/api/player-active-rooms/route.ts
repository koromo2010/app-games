import { loadStoredCodeInterceptRoom } from "@/lib/code-intercept-room-store";
import { loadStoredDaifugoRoom } from "@/lib/daifugo-room-store";
import { loadAndReconcileHodoaiRoom } from "@/lib/hodoai-room-store";
import { loadAndReconcileKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-store";
import { loadStoredNigoichiRoom } from "@/lib/nigoichi-room-store";
import { loadStoredNorthernRoom } from "@/lib/northern-branch-room-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { releasePlayerActiveRoom } from "@/lib/player-active-room";
import { summarizePlayerActiveRoom, type PlayerActiveRoomSummarySource } from "@/lib/player-active-room-summary";
import { redisCommand } from "@/lib/redis-store";
import { loadAndReconcileStoredTahoiyaRoom } from "@/lib/tahoiya-room-store";
import { loadStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { builtInOnlineRoomDescriptors, type BuiltInCommonOnlineRoomGameId } from "@/lib/online-room-descriptors";

type ActiveRoomDescriptor = {
  gameId: string;
  activeKey: (playerId: string) => string;
  loadRoom: (code: string) => Promise<PlayerActiveRoomSummarySource | null>;
};

const activeRoomLoaders: Record<BuiltInCommonOnlineRoomGameId, ActiveRoomDescriptor["loadRoom"]> = {
  wordwolf: loadStoredWordWolfRoom,
  tahoiya: loadAndReconcileStoredTahoiyaRoom,
  "northern-branch": loadStoredNorthernRoom,
  hodoai: loadAndReconcileHodoaiRoom,
  "kotoba-senpuku": loadAndReconcileKotobaSenpukuRoom,
  nigoichi: loadStoredNigoichiRoom,
  "code-intercept": loadStoredCodeInterceptRoom,
  daifugo: loadStoredDaifugoRoom,
};

const descriptors: ActiveRoomDescriptor[] = builtInOnlineRoomDescriptors.map((descriptor) => ({
  ...descriptor,
  loadRoom: activeRoomLoaders[descriptor.gameId],
}));

export async function GET() {
  try {
    const playerId = await requireAuthenticatedPlayerId();
    const activeKeys = descriptors.map((descriptor) => descriptor.activeKey(playerId));
    const codes = await redisCommand<Array<string | null>>(["MGET", ...activeKeys]);
    const entries = await Promise.all(descriptors.map(async (descriptor, index) => {
      const code = codes[index];
      if (!code) return null;
      let room: PlayerActiveRoomSummarySource | null;
      try {
        room = await descriptor.loadRoom(code);
      } catch {
        return null;
      }
      if (!room || !room.players.some((player) => player.id === playerId)) {
        await releasePlayerActiveRoom(activeKeys[index]!, code).catch(() => undefined);
        return null;
      }
      const summary = summarizePlayerActiveRoom(room);
      return summary ? [descriptor.gameId, summary] as const : null;
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
