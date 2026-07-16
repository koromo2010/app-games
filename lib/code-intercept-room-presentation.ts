import {
  sanitizeCodeInterceptRoomForPlayer,
  teamPlayers,
  type CodeInterceptRoom,
  type CodeInterceptRoomChoice,
} from "@/lib/code-intercept";

export function sanitizeCodeInterceptRoom(room: CodeInterceptRoom, playerId: string) {
  return sanitizeCodeInterceptRoomForPlayer(room, playerId);
}

export function codeInterceptRoomChoice(room: CodeInterceptRoom): CodeInterceptRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    playerCapacity: room.playerCapacity,
    hasPassphrase: Boolean(room.passphrase),
    redCount: teamPlayers(room, "red").length,
    blueCount: teamPlayers(room, "blue").length,
    updatedAt: room.updatedAt,
  };
}
