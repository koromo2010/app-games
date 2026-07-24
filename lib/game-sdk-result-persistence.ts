import type { GameSdkStandardResult } from "@game-fields/game-sdk/modules";
import type { GameFieldsPlatformRoomRecord } from "@game-fields/game-runtime";
import {
  recordStandardPlatformGameReplay,
  type StandardPlatformGameReplayInput,
} from "./game-replay-store.ts";
import {
  recordStandardPlatformGameResults,
  type PlayerStatsGameType,
} from "./player-stats-store.ts";

type ResultRoom = {
  players: Array<{ id: string; displayName: string }>;
  settings?: Record<string, unknown>;
  standardResult?: GameSdkStandardResult<string>;
};

type ApprovedSdkResultPersistenceOptions = {
  gameType: PlayerStatsGameType
    & StandardPlatformGameReplayInput["gameType"];
  title: string;
  supportsRating: boolean;
  supportsReplay: boolean;
  previous: Readonly<GameFieldsPlatformRoomRecord<ResultRoom & {
    code: string;
    revision: number;
    phase: string;
  }>>;
  next: Readonly<GameFieldsPlatformRoomRecord<ResultRoom & {
    code: string;
    revision: number;
    phase: string;
  }>>;
};

/**
 * Persists a result once, when a reviewed SDK room first enters a result state.
 * Only the common result contract is stored; game secrets never cross this
 * boundary into player history or playback.
 */
export async function persistApprovedGameSdkResult({
  gameType,
  title,
  supportsRating,
  supportsReplay,
  previous,
  next,
}: ApprovedSdkResultPersistenceOptions) {
  const result = next.room.standardResult;
  if (
    next.phase !== "result"
    || !result
    || previous.room.standardResult
  ) return;
  const players = next.room.players.map((player) => ({
    id: player.id,
    name: player.displayName,
  }));
  const eventId = `sdk:${gameType}:${next.code}:${next.createdAt}:${next.revision}`;
  await Promise.all([
    recordStandardPlatformGameResults({
      gameType,
      eventId,
      roomCode: next.code,
      roomCreatedAt: next.createdAt,
      gameNumber: next.revision,
      startedAt: next.createdAt,
      finishedAt: next.updatedAt,
      players,
      winnerIds: result.winnerIds,
      rankings: result.rankings,
      reason: result.reason,
      supportsRating,
      variantKey: Object.entries(next.room.settings ?? {})
        .filter((entry): entry is [string, string | number | boolean | null] => (
          entry[1] === null
          || typeof entry[1] === "string"
          || typeof entry[1] === "number"
          || typeof entry[1] === "boolean"
        ))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(";")
        .slice(0, 300),
    }),
    ...(supportsReplay ? [
      recordStandardPlatformGameReplay({
        gameType,
        eventId,
        roomCode: next.code,
        finishedAt: next.updatedAt,
        gameNumber: next.revision,
        title,
        players,
        winnerIds: result.winnerIds,
        rankings: result.rankings,
        reason: result.reason,
      }),
    ] : []),
  ]);
}
