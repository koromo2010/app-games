import type { Room as WordWolfRoom, RoomChoice as WordWolfRoomChoice } from "@/lib/wordwolf-game-types";
import { normalizeWolfIds } from "@/lib/wordwolf-room-normalizer";

export function sanitizeWordWolfRoom(room: WordWolfRoom, playerId: string) {
  const revealAll = room.phase === "result" || (room.debugMode && room.hostId === playerId);
  const playerIsWolf = normalizeWolfIds(room).includes(playerId);
  const ownWord = playerIsWolf ? room.wolfWord : room.villageWord;
  const votes = revealAll ? room.votes : room.votes[playerId] ? { [playerId]: room.votes[playerId] } : {};
  return {
    ...room,
    passphrase: room.passphrase ? "設定済み" : "",
    wolfId: revealAll ? room.wolfId : playerIsWolf ? playerId : null,
    wolfIds: revealAll ? room.wolfIds : playerIsWolf ? [playerId] : [],
    villageWord: revealAll ? room.villageWord : ownWord,
    wolfWord: revealAll ? room.wolfWord : ownWord,
    topicReason: revealAll ? room.topicReason : "",
    clues: revealAll || room.clueLogVisibility === "always"
      ? room.clues
      : room.clues.map((clue) => clue.playerId === playerId ? clue : { ...clue, text: "投稿済み" }),
    votes,
    voteHistory: revealAll
      ? room.voteHistory
      : room.voteHistory.map((round) => ({
          ...round,
          votes: round.votes[playerId] ? { [playerId]: round.votes[playerId] } : {},
        })),
  };
}

export function wordWolfRoomChoice(room: WordWolfRoom): WordWolfRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}
