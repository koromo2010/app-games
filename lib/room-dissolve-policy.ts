export type DissolvableGameId = "wordwolf" | "tahoiya" | "hodoai" | "kotoba-senpuku" | "northern-branch" | "nigoichi" | "code-intercept";

type RoomState = { phase: string; round?: number; roundsTotal?: number };

export function canDissolveOnlineRoom(gameId: DissolvableGameId, room: RoomState) {
  if (room.phase === "lobby") return true;
  if (gameId === "northern-branch") return room.phase === "finished";
  if (gameId === "hodoai") return room.phase === "result" && room.round === room.roundsTotal;
  if (gameId === "code-intercept") return room.phase === "game-result";
  return room.phase === "result";
}

export function canMoveFromOnlineRoom(gameId: DissolvableGameId, room: RoomState) {
  return room.phase !== "lobby" && canDissolveOnlineRoom(gameId, room);
}
