export const initialWordWolfRating = 1000;
export const wordWolfRatingKFactor = 32;

export type WordWolfRatingPlayer = { playerId: string; rating: number; won: boolean };
export type WordWolfRatingChange = WordWolfRatingPlayer & { change: number; ratingAfter: number };

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

/** 人数差のあるチーム戦用Elo。両陣営の合計変動をゼロに保つ。 */
export function calculateWordWolfRatingChanges(players: WordWolfRatingPlayer[]): WordWolfRatingChange[] {
  const winners = players.filter((player) => player.won);
  const losers = players.filter((player) => !player.won);
  if (winners.length === 0 || losers.length === 0) {
    return players.map((player) => ({ ...player, change: 0, ratingAfter: player.rating }));
  }

  const winnerAverage = average(winners.map((player) => player.rating));
  const loserAverage = average(losers.map((player) => player.rating));
  const expectedWinner = 1 / (1 + 10 ** ((loserAverage - winnerAverage) / 400));
  const exchange = Math.max(1, Math.round(wordWolfRatingKFactor * (1 - expectedWinner) * winners.length));

  const distribute = (team: WordWolfRatingPlayer[], total: number) => {
    const base = Math.trunc(total / team.length);
    let remainder = total - base * team.length;
    return team.map((player) => {
      const extra = remainder === 0 ? 0 : remainder > 0 ? 1 : -1;
      remainder -= extra;
      const change = base + extra;
      return { ...player, change, ratingAfter: Math.max(100, player.rating + change) };
    });
  };

  const changes = [...distribute(winners, exchange), ...distribute(losers, -exchange)];
  const byPlayer = new Map(changes.map((change) => [change.playerId, change]));
  return players.map((player) => byPlayer.get(player.playerId) ?? { ...player, change: 0, ratingAfter: player.rating });
}
