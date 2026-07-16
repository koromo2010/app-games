import {
  sanitizeNigoichiRoomForPlayer,
  type NigoichiRoom,
  type NigoichiRoomChoice,
} from "@/lib/nigoichi";

export function sanitizeNigoichiRoom(room: NigoichiRoom, playerId: string) {
  return sanitizeNigoichiRoomForPlayer(room, playerId);
}

export function nigoichiRoomChoice(room: NigoichiRoom): NigoichiRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    playerCapacity: room.playerCapacity,
    hasPassphrase: Boolean(room.passphrase),
    cardsPerPlayer: room.cardsPerPlayer,
    associationWordCount: room.associationWordCount,
    wordDifficulty: room.wordDifficulty,
    updatedAt: room.updatedAt,
  };
}
