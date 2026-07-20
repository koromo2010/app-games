import { getPostgresClient } from "@/lib/postgres-store";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import type { PlayerGameResult, PlayerStatsGameType } from "@/lib/player-stats-store";

type StoredResultRow = { result: PlayerGameResult | string };
type RatingStateRow = { player_id: string; rating: string | number | null; games_played: string | number };
type PlayerRatingStateRow = RatingStateRow & { game_type: PlayerStatsGameType };
export type PostgresRatingState = { rating: number; gamesPlayed: number };

function normalizeStoredResult(value: PlayerGameResult | string) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as PlayerGameResult;
    } catch {
      return null;
    }
  }
  return value;
}

export async function savePostgresPlayerResults(results: PlayerGameResult[]) {
  if (results.length === 0) return 0;
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const inserted = await sql.transaction((tx) => results.map((result) => tx`
    INSERT INTO player_game_results (id, player_id, game_type, finished_at, result)
    VALUES (${result.id}, ${result.playerId}, ${result.gameType}, ${result.finishedAt}, ${JSON.stringify(result)}::jsonb)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `)) as unknown as Array<Array<{ id: string }>>;
  return inserted.reduce((count, rows) => count + rows.length, 0);
}

export async function loadPostgresPlayerResults(playerId: string, limit = 200) {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT result
    FROM player_game_results
    WHERE player_id = ${playerId}
    ORDER BY finished_at DESC
    LIMIT ${limit}
  ` as StoredResultRow[];
  return rows.map((row) => normalizeStoredResult(row.result)).filter((result): result is PlayerGameResult => Boolean(result));
}

export async function loadPostgresRatingStates(gameType: PlayerStatsGameType, playerIds: string[]) {
  if (playerIds.length === 0) return new Map<string, PostgresRatingState>();
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql.query(`
    SELECT
      player_id,
      COUNT(*)::int AS games_played,
      (ARRAY_AGG(NULLIF(result->>'ratingAfter', '')::int ORDER BY finished_at DESC)
        FILTER (WHERE result ? 'ratingAfter'))[1] AS rating
    FROM player_game_results
    WHERE game_type = $1 AND player_id = ANY($2::text[])
    GROUP BY player_id
  `, [gameType, playerIds]) as RatingStateRow[];
  return new Map(rows.map((row) => [row.player_id, {
    rating: Number(row.rating) || 0,
    gamesPlayed: Number(row.games_played) || 0,
  }]));
}

export async function loadPostgresPlayerRatingStates(playerId: string) {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql.query(`
    SELECT
      game_type,
      player_id,
      COUNT(*)::int AS games_played,
      (ARRAY_AGG(NULLIF(result->>'ratingAfter', '')::int ORDER BY finished_at DESC)
        FILTER (WHERE result ? 'ratingAfter'))[1] AS rating
    FROM player_game_results
    WHERE player_id = $1
    GROUP BY game_type, player_id
  `, [playerId]) as PlayerRatingStateRow[];
  return new Map(rows.map((row) => [row.game_type, {
    rating: Number(row.rating) || 0,
    gamesPlayed: Number(row.games_played) || 0,
  }]));
}
