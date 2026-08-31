import { builtInCommonOnlineRoomGameIds } from "./game-locale-registry.ts";

export type BuiltInCommonOnlineRoomGameId = typeof builtInCommonOnlineRoomGameIds[number];

export const builtInOnlineRoomDescriptors = builtInCommonOnlineRoomGameIds.map((gameId) => ({
  gameId,
  endpoint: `/api/${gameId}/rooms`,
  activeKey(playerId: string) {
    return `${gameId}:player-active-room:${playerId}`;
  },
}));

export function builtInOnlineRoomDescriptor(gameId: string) {
  return builtInOnlineRoomDescriptors.find((descriptor) => descriptor.gameId === gameId) ?? null;
}
