import { expireNorthernTurn } from "./northern-branch-game.ts";
import type { NorthernRoom } from "./northern-branch-types.ts";

export function isNorthernTurnExpired(room: NorthernRoom, now = Date.now()) {
  return room.phase === "playing"
    && room.turnTimeLimitSeconds > 0
    && room.turnStartedAt !== null
    && now >= room.turnStartedAt + room.turnTimeLimitSeconds * 1000;
}

export function expireNorthernRoomTurn(room: NorthernRoom, now = Date.now()) {
  if (!room.game || room.phase !== "playing") return room;
  const outcome = expireNorthernTurn(room.game);
  if (!outcome.ok) return room;
  return {
    ...room,
    game: outcome.state,
    turnStartedAt: now,
    notice: outcome.notice,
  };
}
