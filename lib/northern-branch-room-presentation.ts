import type { NorthernRoom, NorthernRoomChoice } from "@/lib/northern-branch-types";

export function northernRoomChoice(room: NorthernRoom): NorthernRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "不明",
    playerCount: room.players.length,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

export function sanitizeNorthernRoom(room: NorthernRoom, playerId: string): NorthernRoom {
  const canSeeAllHands = room.debugMode && playerId === room.hostId;
  const game = room.game ? {
    ...room.game,
    offerDeck: [],
    discard: [],
    players: room.game.players.map((player) => ({
      ...player,
      handCount: player.hand.length,
      hand: player.id === playerId || canSeeAllHands ? player.hand : [],
    })),
  } : null;
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", game };
}
