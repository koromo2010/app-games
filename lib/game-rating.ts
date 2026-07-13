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

export type GameRatingPlayer = { playerId: string; rating: number; won: boolean; gamesPlayed?: number };
export type GameRatingChange = GameRatingPlayer & { change: number; ratingAfter: number };

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }

/** 暫定期間は速く収束し、確定後は穏やかに動くチーム戦Elo。 */
export function calculateGameRatingChanges(players: GameRatingPlayer[]): GameRatingChange[] {
  const winners = players.filter((player) => player.won);
  const losers = players.filter((player) => !player.won);
  if (!winners.length || !losers.length) return players.map((player) => ({ ...player, change: 0, ratingAfter: player.rating }));
  const winnerAverage = average(winners.map((player) => player.rating));
  const loserAverage = average(losers.map((player) => player.rating));
  return players.map((player) => {
    const opponentRating = player.won ? loserAverage : winnerAverage;
    const expected = 1 / (1 + 10 ** ((opponentRating - player.rating) / 400));
    const kFactor = (player.gamesPlayed ?? 0) < gameRatingConfig.provisionalGames ? gameRatingConfig.provisionalK : gameRatingConfig.establishedK;
    const change = Math.round(kFactor * ((player.won ? 1 : 0) - expected));
    return { ...player, change, ratingAfter: Math.max(100, player.rating + change) };
  });
}
