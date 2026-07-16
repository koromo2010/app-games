import {
  correctNigoichiConfig,
  dealNigoichiRound,
  type NigoichiPlayer,
  type NigoichiRoom,
} from "@/lib/nigoichi";
import { listLocalWordWolfWords, listLocalWordWolfWordsByDifficulty } from "@/lib/wordwolf";

export function beginGame(room: NigoichiRoom) {
  const preferredWords = listLocalWordWolfWordsByDifficulty(room.wordDifficulty);
  const preferredKeys = new Set(preferredWords.map((word) => word.trim().toLocaleLowerCase("ja-JP")));
  const wordPool = [...preferredWords, ...listLocalWordWolfWords().filter((word) => !preferredKeys.has(word.trim().toLocaleLowerCase("ja-JP")))];
  const dealt = dealNigoichiRound(room.players, wordPool, room.cardsPerPlayer);
  return {
    ...room,
    phase: "clue" as const,
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
    debugReplayEnabled: false,
    words: [],
    hands: {},
    associations: {},
    guesses: {},
    missingNumber: null,
    roundScores: {},
  };
}

