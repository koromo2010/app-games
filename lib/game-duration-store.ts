import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import { getRedisConfig, redisCommand, redisPipeline } from "@/lib/redis-store";
import {
  estimateGameDuration,
  gameDurationGameIds,
  gameDurationStatisticsPolicy,
  isGameDurationGameId,
  isValidGameDurationSeconds,
  type GameDurationEstimate,
  type GameDurationGameId,
} from "@/lib/game-duration-statistics";

type GameDurationSample = {
  schemaVersion: 1;
  id: string;
  gameType: GameDurationGameId;
  startedAt: number;
  finishedAt: number;
  durationSeconds: number;
  playerCount: number;
  variantKey: string;
};

type StoredDurationRow = {
  game_type: string;
  duration_seconds: string | number;
  player_count: string | number;
  variant_key: string;
};

export type RecordGameDurationInput = {
  id: string;
  gameType: GameDurationGameId;
  startedAt: number | null | undefined;
  finishedAt: number;
  playerCount: number;
  variantKey?: string;
};

const sampleKey = (gameType: GameDurationGameId) => `game-duration-samples:v1:${gameType}`;
const eventKey = (id: string) => `game-duration-event:v1:${id}`;
const eventRetentionSeconds = 2 * 365 * 24 * 60 * 60;

function normalizeSample(input: RecordGameDurationInput): GameDurationSample | null {
  if (!input.id || !isGameDurationGameId(input.gameType) || typeof input.startedAt !== "number") return null;
  const durationSeconds = Math.round((input.finishedAt - input.startedAt) / 1000);
  if (!isValidGameDurationSeconds(durationSeconds)) return null;
  if (!Number.isInteger(input.playerCount) || input.playerCount < 1) return null;
  return {
    schemaVersion: 1,
    id: input.id.slice(0, 240),
    gameType: input.gameType,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationSeconds,
    playerCount: Math.min(100, input.playerCount),
    variantKey: (input.variantKey ?? "").slice(0, 300),
  };
}

function parseRedisSample(value: unknown): GameDurationSample | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<GameDurationSample>;
    if (parsed.schemaVersion !== 1
      || typeof parsed.id !== "string"
      || !isGameDurationGameId(parsed.gameType)
      || !isValidGameDurationSeconds(parsed.durationSeconds)
      || typeof parsed.playerCount !== "number"
      || typeof parsed.finishedAt !== "number") return null;
    return parsed as GameDurationSample;
  } catch {
    return null;
  }
}

async function saveRedisSample(sample: GameDurationSample) {
  const serialized = JSON.stringify(sample);
  return redisCommand<number>([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],'1','EX',ARGV[3]); redis.call('ZADD',KEYS[2],ARGV[1],ARGV[2]); local count=redis.call('ZCARD',KEYS[2]); if count>tonumber(ARGV[4]) then redis.call('ZREMRANGEBYRANK',KEYS[2],0,count-tonumber(ARGV[4])-1) end; return 1",
    "2",
    eventKey(sample.id),
    sampleKey(sample.gameType),
    String(sample.finishedAt),
    serialized,
    String(eventRetentionSeconds),
    String(gameDurationStatisticsPolicy.recentSampleLimit),
  ]);
}

async function savePostgresSample(sample: GameDurationSample) {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const inserted = await sql`
    INSERT INTO game_duration_samples (
      id, game_type, started_at, finished_at, duration_seconds, player_count, variant_key
    ) VALUES (
      ${sample.id}, ${sample.gameType}, ${sample.startedAt}, ${sample.finishedAt},
      ${sample.durationSeconds}, ${sample.playerCount}, ${sample.variantKey}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ` as Array<{ id: string }>;
  return inserted.length;
}

export async function recordGameDurationSample(input: RecordGameDurationInput) {
  const sample = normalizeSample(input);
  if (!sample) return false;
  const writes: Promise<number>[] = [];
  if (getRedisConfig()) writes.push(saveRedisSample(sample));
  if (isPostgresConfigured()) writes.push(savePostgresSample(sample));
  if (writes.length === 0) return false;
  const results = await Promise.allSettled(writes);
  const successes = results.filter((result): result is PromiseFulfilledResult<number> => result.status === "fulfilled");
  if (successes.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  return successes.some((result) => result.value > 0);
}

async function loadPostgresSamples() {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql.query(`
    SELECT game_type, duration_seconds, player_count, variant_key
    FROM (
      SELECT game_type, duration_seconds, player_count, variant_key,
        ROW_NUMBER() OVER (PARTITION BY game_type ORDER BY finished_at DESC) AS sample_rank
      FROM game_duration_samples
    ) recent
    WHERE sample_rank <= $1
  `, [gameDurationStatisticsPolicy.recentSampleLimit]) as StoredDurationRow[];
  return rows.flatMap((row): GameDurationSample[] => {
    const durationSeconds = Number(row.duration_seconds);
    if (!isGameDurationGameId(row.game_type) || !isValidGameDurationSeconds(durationSeconds)) return [];
    return [{
      schemaVersion: 1,
      id: "postgres-aggregate-row",
      gameType: row.game_type,
      startedAt: 0,
      finishedAt: 0,
      durationSeconds,
      playerCount: Number(row.player_count),
      variantKey: row.variant_key,
    }];
  });
}

async function loadRedisSamples() {
  const results = await redisPipeline<string[][]>(gameDurationGameIds.map((gameType) => [
    "ZREVRANGE", sampleKey(gameType), "0", String(gameDurationStatisticsPolicy.recentSampleLimit - 1),
  ]));
  return results.flatMap((values) => values.map(parseRedisSample).filter((sample): sample is GameDurationSample => Boolean(sample)));
}

export async function loadGameDurationEstimates(filters: { playerCount?: number; variantKey?: string } = {}) {
  let samples: GameDurationSample[] = [];
  if (isPostgresConfigured()) {
    samples = await loadPostgresSamples().catch(() => []);
  }
  if (samples.length === 0 && getRedisConfig()) {
    samples = await loadRedisSamples().catch(() => []);
  }
  const filtered = samples.filter((sample) => (
    (filters.playerCount === undefined || sample.playerCount === filters.playerCount)
    && (filters.variantKey === undefined || sample.variantKey === filters.variantKey)
  ));
  const estimates: Partial<Record<GameDurationGameId, GameDurationEstimate>> = {};
  for (const gameType of gameDurationGameIds) {
    const estimate = estimateGameDuration(filtered.filter((sample) => sample.gameType === gameType).map((sample) => sample.durationSeconds));
    if (estimate) estimates[gameType] = estimate;
  }
  return estimates;
}
