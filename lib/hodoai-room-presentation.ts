import type { HodoaiRoom, HodoaiRoomChoice } from "./hodoai-talk.ts";

export function hodoaiRoomChoice(room: HodoaiRoom): HodoaiRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    cardsPerPlayer: room.cardsPerPlayer,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

export function sanitizeHodoaiRoom(room: HodoaiRoom, playerId: string) {
  const isDebugHost = room.debugMode && playerId === room.hostId;
  const revealAll = room.phase === "result" || isDebugHost;
  const ownCardIds = new Set(room.cards.filter((card) => card.ownerId === playerId).map((card) => card.id));
  const values = revealAll ? room.values : Object.fromEntries(Object.entries(room.values).filter(([cardId]) => ownCardIds.has(cardId)));
  const clues = room.phase === "clue" && !isDebugHost
    ? Object.fromEntries(Object.entries(room.clues).filter(([cardId]) => ownCardIds.has(cardId)))
    : room.clues;
  const clueHistory = room.phase === "clue" && !isDebugHost
    ? room.clueHistory.map((clueRound) => ({ ...clueRound, clues: Object.fromEntries(Object.entries(clueRound.clues).filter(([cardId]) => ownCardIds.has(cardId))) }))
    : room.clueHistory;
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", values, clues, clueHistory, debugLog: isDebugHost ? room.debugLog : [] };
}
