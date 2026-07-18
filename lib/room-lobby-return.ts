export type RoomLobbyReturnReason = "round-result" | "debug-abort";

export type RoomLobbyReturnState = {
  reason: RoomLobbyReturnReason;
  round: number;
  startedAt: number;
  returnedPlayerIds: string[];
};

type RoomPlayer = { id: string };

function isRoomPlayer(players: readonly RoomPlayer[], playerId: string) {
  return players.some((player) => player.id === playerId);
}

function isAutomaticReturnPlayer(player: RoomPlayer) {
  return player.id.startsWith("dummy-");
}

export function beginRoomLobbyReturn(
  players: readonly RoomPlayer[],
  actorId: string,
  reason: RoomLobbyReturnReason,
  round: number,
  startedAt = Date.now(),
): RoomLobbyReturnState {
  const returnedPlayerIds = players
    .filter((player) => player.id === actorId || isAutomaticReturnPlayer(player))
    .map((player) => player.id);

  return {
    reason,
    round: Math.max(1, Math.floor(round)),
    startedAt,
    returnedPlayerIds,
  };
}

export function confirmRoomLobbyReturn(
  state: RoomLobbyReturnState | undefined,
  players: readonly RoomPlayer[],
  playerId: string,
) {
  if (!state || !isRoomPlayer(players, playerId) || state.returnedPlayerIds.includes(playerId)) return state;
  return { ...state, returnedPlayerIds: [...state.returnedPlayerIds, playerId] };
}

export function allRoomPlayersReturned(
  state: RoomLobbyReturnState | undefined,
  players: readonly RoomPlayer[],
) {
  if (!state) return true;
  const returnedPlayerIds = new Set(state.returnedPlayerIds);
  return players.every((player) => returnedPlayerIds.has(player.id));
}

export function normalizeRoomLobbyReturnState(
  value: unknown,
  players: readonly RoomPlayer[],
): RoomLobbyReturnState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parsed = value as Partial<RoomLobbyReturnState>;
  if (parsed.reason !== "round-result" && parsed.reason !== "debug-abort") return undefined;
  if (typeof parsed.round !== "number" || !Number.isFinite(parsed.round)) return undefined;
  if (typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) return undefined;

  const validPlayerIds = new Set(players.map((player) => player.id));
  const returnedPlayerIds = Array.isArray(parsed.returnedPlayerIds)
    ? [...new Set(parsed.returnedPlayerIds.filter((playerId): playerId is string => typeof playerId === "string" && validPlayerIds.has(playerId)))]
    : [];

  for (const player of players) {
    if (isAutomaticReturnPlayer(player) && !returnedPlayerIds.includes(player.id)) returnedPlayerIds.push(player.id);
  }

  return {
    reason: parsed.reason,
    round: Math.max(1, Math.floor(parsed.round)),
    startedAt: parsed.startedAt,
    returnedPlayerIds,
  };
}
