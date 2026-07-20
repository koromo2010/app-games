import type { KotobaSenpukuRoom, KotobaSenpukuRoomChoice } from "@/lib/kotoba-senpuku";

export function kotobaSenpukuRoomChoice(room: KotobaSenpukuRoom): KotobaSenpukuRoomChoice {
  return {
    code: room.code,
    contentLocale: room.contentLocale,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "不明",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

export function sanitizeKotobaSenpukuRoom(room: KotobaSenpukuRoom, playerId: string) {
  const revealAll = room.phase === "result" || (room.debugMode && playerId === room.hostId);
  const secrets = revealAll ? room.secrets : room.secrets[playerId] ? { [playerId]: room.secrets[playerId] } : {};
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", secrets };
}
