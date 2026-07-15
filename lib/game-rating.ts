function integerSetting(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? Math.floor(value) : fallback;
}

export const gameRatingConfig = {
  initial: integerSetting("GAME_RATING_INITIAL", 1000, 100, 3000),
  provisionalGames: integerSetting("GAME_RATING_PROVISIONAL_GAMES", 30, 1, 200),
  provisionalK: integerSetting("GAME_RATING_PROVISIONAL_K", 48, 1, 100),
  establishedK: integerSetting("GAME_RATING_ESTABLISHED_K", 20, 1, 100),
} as const;
export const initialGameRating = gameRatingConfig.initial;

export type GameRatingPlayer = { playerId: string; rating: number; performanceScore: number; gamesPlayed?: number };
export type GameRatingChange = GameRatingPlayer & { change: number; ratingAfter: number };

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }

function actualScore(playerScore: number, opponentScore: number) {
  if (playerScore === opponentScore) return 0.5;
  return playerScore > opponentScore ? 1 : 0;
}

/** 各対戦相手とのElo変動を平均し、暫定期間だけ大きなK値を使う多人数Elo。 */
export function calculateGameRatingChanges(players: GameRatingPlayer[]): GameRatingChange[] {
  return players.map((player) => {
    const opponents = players.filter((opponent) => opponent.playerId !== player.playerId);
    if (opponents.length === 0) return { ...player, change: 0, ratingAfter: player.rating };
    const kFactor = (player.gamesPlayed ?? 0) < gameRatingConfig.provisionalGames ? gameRatingConfig.provisionalK : gameRatingConfig.establishedK;
    const pairwiseChanges = opponents.map((opponent) => {
      const expected = 1 / (1 + 10 ** ((opponent.rating - player.rating) / 400));
      return kFactor * (actualScore(player.performanceScore, opponent.performanceScore) - expected);
    });
    const requestedChange = Math.round(average(pairwiseChanges));
    const ratingAfter = Math.max(100, player.rating + requestedChange);
    return { ...player, change: ratingAfter - player.rating, ratingAfter };
  });
}
