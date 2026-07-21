import type { HodoaiRoom } from "@/lib/hodoai-talk";

export type HodoaiViewPermissions = {
  canEditRoomSettings: boolean;
  canStartGame: boolean;
  canAbort: boolean;
  canDebug: boolean;
  canDissolve: boolean;
  canLeave: boolean;
  canRecover: boolean;
};

export function createHodoaiViewPermissions(
  room: HodoaiRoom | null,
  playerId: string,
): HodoaiViewPermissions {
  const isHost = Boolean(room && room.hostId === playerId);
  const isLobby = room?.phase === "lobby";
  const isPlaying = Boolean(room && room.phase !== "lobby" && room.phase !== "result");

  return {
    canEditRoomSettings: Boolean(isHost && isLobby),
    canStartGame: Boolean(isHost && isLobby),
    canAbort: Boolean(isHost && room?.debugMode && isPlaying),
    canDebug: isHost,
    canDissolve: Boolean(isHost && (isLobby || room?.phase === "result")),
    canLeave: Boolean(room && !isHost && isLobby),
    canRecover: Boolean(room?.playerTimeouts?.[playerId]?.reducedTime),
  };
}
