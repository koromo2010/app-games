export type PlayerRatingState = { rating: number; gamesPlayed: number };

type RatingResult<GameType extends string> = { gameType: GameType; ratingAfter?: number };

export function buildPlayedGameRatings<GameType extends string>(input: {
  gameTypes: readonly GameType[];
  results: readonly RatingResult<GameType>[];
  storedRatings: readonly (string | null)[];
  postgresStates?: ReadonlyMap<GameType, PlayerRatingState>;
  initialRating: number;
}) {
  const entries = input.gameTypes.flatMap((gameType, index) => {
    const result = input.results.find((item) => item.gameType === gameType);
    const storedRating = input.storedRatings[index];
    const postgresState = input.postgresStates?.get(gameType);
    const hasPlayed = Boolean(result) || storedRating !== null || (postgresState?.gamesPlayed ?? 0) > 0;
    if (!hasPlayed) return [];
    const resultRating = typeof result?.ratingAfter === "number" ? result.ratingAfter : 0;
    const rating = resultRating || Number(storedRating) || postgresState?.rating || input.initialRating;
    return [[gameType, rating] as const];
  });
  return Object.fromEntries(entries) as Partial<Record<GameType, number>>;
}
