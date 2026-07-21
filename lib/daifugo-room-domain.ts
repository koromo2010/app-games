import { canPassDaifugoTurn, chooseDaifugoCpuPlay, createDaifugoGameForPlayers, passDaifugoTurn, playDaifugoCards } from "./daifugo.ts";
import { normalizeCommonTimeLimit } from "./game-room-config.ts";
import { daifugoMaximumPlayers, daifugoMinimumPlayers, type DaifugoRoom } from "./daifugo-room.ts";

export function normalizeDaifugoCapacity(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 4;
  return Math.max(daifugoMinimumPlayers, Math.min(daifugoMaximumPlayers, parsed));
}

function settleDaifugoRoomGame(room: DaifugoRoom, now: number): DaifugoRoom {
  let current = room;

  // Debug dummy players must never block an otherwise playable room. Advance
  // consecutive dummy turns until control returns to a real player or the game ends.
  for (let step = 0; step < 200; step += 1) {
    if (current.phase !== "playing" || !current.game || current.game.status !== "playing") return current;
    const currentPlayerId = current.game.currentPlayerId;
    const currentPlayer = current.players.find((player) => player.id === currentPlayerId);
    if (!currentPlayer?.isDummy) return current;

    const cards = chooseDaifugoCpuPlay(current.game, currentPlayerId);
    const game = cards
      ? playDaifugoCards(current.game, currentPlayerId, cards.map((card) => card.id))
      : canPassDaifugoTurn(current.game, currentPlayerId)
        ? passDaifugoTurn(current.game, currentPlayerId)
        : null;

    if (!game) throw new Error("DAIFUGO_ROOM_CONFLICT");
    current = {
      ...current,
      phase: game.status === "finished" ? "result" : "playing",
      game,
      phaseStartedAt: now,
    };
  }

  throw new Error("DAIFUGO_ROOM_CONFLICT");
}

export function beginDaifugoRoomGame(room: DaifugoRoom, now = Date.now()) {
  if (room.players.length < daifugoMinimumPlayers) throw new Error("DAIFUGO_NOT_ENOUGH_PLAYERS");
  const game = createDaifugoGameForPlayers(room.players.map((player) => ({ id: player.id, name: player.name, kind: player.isDummy ? "cpu" : "human" })));
  return settleDaifugoRoomGame({ ...room, phase: "playing" as const, game, gameStartedAt: now, phaseStartedAt: now }, now);
}

export function playDaifugoRoomCards(room: DaifugoRoom, playerId: string, cardIds: readonly string[], now = Date.now()) {
  if (room.phase !== "playing" || !room.game) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
  const game = playDaifugoCards(room.game, playerId, cardIds);
  return settleDaifugoRoomGame({ ...room, phase: game.status === "finished" ? "result" as const : "playing" as const, game, phaseStartedAt: now }, now);
}

export function passDaifugoRoomTurn(room: DaifugoRoom, playerId: string, now = Date.now()) {
  if (room.phase !== "playing" || !room.game) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
  return settleDaifugoRoomGame({ ...room, game: passDaifugoTurn(room.game, playerId), phaseStartedAt: now }, now);
}

export function expireDaifugoTurn(room: DaifugoRoom, phaseStartedAt: number, now = Date.now()) {
  if (room.phase !== "playing" || !room.game || room.phaseStartedAt !== phaseStartedAt || room.turnTimeLimitSeconds === 0
    || now < phaseStartedAt + room.turnTimeLimitSeconds * 1000) throw new Error("DAIFUGO_ROOM_CONFLICT");
  const playerId = room.game.currentPlayerId;
  if (!playerId) throw new Error("DAIFUGO_ROOM_CONFLICT");
  if (room.game.table) return passDaifugoRoomTurn(room, playerId, now);
  const cards = chooseDaifugoCpuPlay(room.game, playerId);
  if (!cards) throw new Error("DAIFUGO_ROOM_CONFLICT");
  return playDaifugoRoomCards(room, playerId, cards.map((card) => card.id), now);
}

export function resetDaifugoRoom(room: DaifugoRoom) {
  return { ...room, phase: "lobby" as const, gameNumber: room.gameNumber + 1, game: null, gameStartedAt: null, phaseStartedAt: null, debugReplayEnabled: false };
}

export function updateDaifugoRoomConfig(room: DaifugoRoom, playerCapacity: unknown, turnTimeLimitSeconds: unknown) {
  const capacity = normalizeDaifugoCapacity(playerCapacity);
  if (capacity < room.players.length) throw new Error("DAIFUGO_INVALID_CONFIG");
  return { ...room, playerCapacity: capacity, turnTimeLimitSeconds: normalizeCommonTimeLimit(turnTimeLimitSeconds) };
}
