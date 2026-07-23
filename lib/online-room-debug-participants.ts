import { isOnlineRoomDebugPlayer } from "./online-room-access.ts";
import {
  normalizeRoomLobbyReturnState,
  type RoomLobbyReturnState,
} from "./room-lobby-return.ts";

type DebugParticipant = {
  id: string;
  name: string;
  isDummy?: boolean;
};

export function nextOnlineRoomDebugParticipantName(
  players: readonly DebugParticipant[],
  prefix = "ダミー",
) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
  const largestExistingNumber = players.reduce((largest, player) => {
    if (!isOnlineRoomDebugPlayer(player)) return largest;
    const match = pattern.exec(player.name.trim());
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);
  return `${prefix}${largestExistingNumber + 1}`;
}

export function removeOnlineRoomDebugParticipants<Player extends DebugParticipant>(
  players: readonly Player[],
  lobbyReturn: RoomLobbyReturnState | undefined,
  targetPlayerId?: string,
) {
  const removedPlayerIds = players
    .filter((player) => (
      isOnlineRoomDebugPlayer(player)
      && (!targetPlayerId || player.id === targetPlayerId)
    ))
    .map((player) => player.id);
  if (removedPlayerIds.length === 0) {
    return { players: [...players], lobbyReturn, removedPlayerIds };
  }

  const removed = new Set(removedPlayerIds);
  const retainedPlayers = players.filter((player) => !removed.has(player.id));
  return {
    players: retainedPlayers,
    lobbyReturn: normalizeRoomLobbyReturnState(lobbyReturn, retainedPlayers),
    removedPlayerIds,
  };
}
