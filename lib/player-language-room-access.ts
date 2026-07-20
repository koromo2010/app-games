import { loadStoredCodeInterceptRoom } from "@/lib/code-intercept-room-store";
import { loadAndReconcileHodoaiRoom } from "@/lib/hodoai-room-store";
import { loadAndReconcileKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-store";
import { loadStoredNigoichiRoom } from "@/lib/nigoichi-room-store";
import { releasePlayerActiveRoom } from "@/lib/player-active-room";
import { redisCommand } from "@/lib/redis-store";
import { loadAndReconcileStoredTahoiyaRoom } from "@/lib/tahoiya-room-store";
import { loadStoredWordWolfRoom } from "@/lib/wordwolf-room-store";

type MembershipRoom = { players: Array<{ id: string }> };

const descriptors: Array<{
  activeKey: (playerId: string) => string;
  loadRoom: (code: string) => Promise<MembershipRoom | null>;
}> = [
  { activeKey: (id) => `wordwolf:player-active-room:${id}`, loadRoom: loadStoredWordWolfRoom },
  { activeKey: (id) => `tahoiya:player-active-room:${id}`, loadRoom: loadAndReconcileStoredTahoiyaRoom },
  { activeKey: (id) => `hodoai:player-active-room:${id}`, loadRoom: loadAndReconcileHodoaiRoom },
  { activeKey: (id) => `kotoba-senpuku:player-active-room:${id}`, loadRoom: loadAndReconcileKotobaSenpukuRoom },
  { activeKey: (id) => `nigoichi:player-active-room:${id}`, loadRoom: loadStoredNigoichiRoom },
  { activeKey: (id) => `code-intercept:player-active-room:${id}`, loadRoom: loadStoredCodeInterceptRoom },
];

export async function playerHasActiveLanguageRoom(playerId: string) {
  const keys = descriptors.map((descriptor) => descriptor.activeKey(playerId));
  const codes = await redisCommand<Array<string | null>>(["MGET", ...keys]);
  const memberships = await Promise.all(descriptors.map(async (descriptor, index) => {
    const code = codes[index];
    if (!code) return false;
    const room = await descriptor.loadRoom(code).catch(() => null);
    if (room?.players.some((player) => player.id === playerId)) return true;
    await releasePlayerActiveRoom(keys[index]!, code).catch(() => undefined);
    return false;
  }));
  return memberships.some(Boolean);
}
