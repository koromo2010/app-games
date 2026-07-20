import {
  correctNigoichiConfig,
  dealNigoichiRound,
  type NigoichiPlayer,
  type NigoichiRoom,
} from "./nigoichi.ts";

export function beginGame(room: NigoichiRoom, wordPool: readonly string[], now = Date.now()) {
  const dealt = dealNigoichiRound(room.players, wordPool, room.cardsPerPlayer);
  return {
    ...room,
    phase: "clue" as const,
    phaseStartedAt: now,
    words: dealt.words,
    hands: dealt.hands,
    associations: {},
    guesses: {},
    missingNumber: dealt.missingNumber,
    roundScores: {},
  };
}

export function withPlayersAndCorrectedConfig(room: NigoichiRoom, players: NigoichiPlayer[]) {
  const config = correctNigoichiConfig(players.length, room.cardsPerPlayer, room.associationWordCount);
  const totalScores = Object.fromEntries(players.map((player) => [player.id, room.totalScores[player.id] ?? 0]));
  return { ...room, players, totalScores, cardsPerPlayer: config.cardsPerPlayer, associationWordCount: config.associationWordCount };
}

export function resetGame(room: NigoichiRoom) {
  return {
    ...room,
    gameNumber: room.gameNumber + 1,
    phase: "lobby" as const,
    phaseStartedAt: null,
    debugReplayEnabled: false,
    words: [],
    hands: {},
    associations: {},
    guesses: {},
    missingNumber: null,
    roundScores: {},
  };
}
