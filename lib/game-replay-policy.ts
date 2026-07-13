import type { GameReplayPolicy } from "./game-replay-types.ts";

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function resolveGameReplayPolicy(environment: Record<string, string | undefined> = process.env): GameReplayPolicy {
  return {
    retentionDays: integerSetting(environment.GAME_REPLAY_RETENTION_DAYS, 30, 1, 3650),
    favoriteLimit: integerSetting(environment.GAME_REPLAY_FAVORITE_LIMIT, 10, 1, 100),
  };
}
