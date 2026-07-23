import { isOnlineRoomDebugPlayer } from "./online-room-access.ts";
import { normalizeRoomLobbyReturnState } from "./room-lobby-return.ts";
import type { TahoiyaPlayer, TahoiyaRoom } from "./tahoiya-types.ts";

function filterPlayerRecord<Value>(
  record: Record<string, Value>,
  retainedPlayerIds: ReadonlySet<string>,
) {
  return Object.fromEntries(
    Object.entries(record).filter(([playerId]) => retainedPlayerIds.has(playerId)),
  );
}

export function nextTahoiyaDebugPlayerName(players: readonly TahoiyaPlayer[]) {
  const largestExistingNumber = players.reduce((largest, player) => {
    if (!isOnlineRoomDebugPlayer(player)) return largest;
    const match = /^テスト(\d+)$/.exec(player.name.trim());
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);
  return `テスト${Math.max(players.length + 1, largestExistingNumber + 1)}`;
}

export function removeTahoiyaDebugParticipants(
  room: TahoiyaRoom,
  targetPlayerId?: string,
) {
  const removedPlayerIds = new Set(
    room.players
      .filter((player) => (
        isOnlineRoomDebugPlayer(player)
        && (!targetPlayerId || player.id === targetPlayerId)
      ))
      .map((player) => player.id),
  );
  if (removedPlayerIds.size === 0) return room;

  const players = room.players.filter((player) => !removedPlayerIds.has(player.id));
  const retainedPlayerIds = new Set(players.map((player) => player.id));
  return {
    ...room,
    players,
    answererId: removedPlayerIds.has(room.answererId) ? "" : room.answererId,
    fakeDefinitions: filterPlayerRecord(room.fakeDefinitions, retainedPlayerIds),
    votes: filterPlayerRecord(room.votes, retainedPlayerIds),
    scores: filterPlayerRecord(room.scores, retainedPlayerIds),
    playerTimeouts: filterPlayerRecord(room.playerTimeouts, retainedPlayerIds),
    playerTimeoutNotice: room.playerTimeoutNotice
      && removedPlayerIds.has(room.playerTimeoutNotice.playerId)
      ? null
      : room.playerTimeoutNotice,
    lobbyReturn: normalizeRoomLobbyReturnState(room.lobbyReturn, players),
  };
}
