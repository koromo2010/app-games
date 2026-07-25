import type { GameSdkStoredRoom } from "@game-fields/game-sdk";
import type { GameSdkStandardResult } from "@game-fields/game-sdk/modules";
import type {
  GameFieldsPlatformResultOutboxEntry,
  GameFieldsPlatformRoomRecord,
} from "@game-fields/game-runtime";
import {
  recordStandardPlatformGameReplay,
  type StandardPlatformGameReplayInput,
} from "./game-replay-store.ts";
import {
  recordStandardPlatformGameResults,
  type PlayerStatsGameType,
} from "./player-stats-store.ts";

type ResultRoom = GameSdkStoredRoom & {
  players?: Array<{ id: string; displayName: string }>;
  settings?: Record<string, unknown>;
  standardResult?: GameSdkStandardResult<string>;
};

type ApprovedSdkResultPersistenceOptions = {
  gameType: PlayerStatsGameType
    & StandardPlatformGameReplayInput["gameType"];
  title: string;
  supportsStats: boolean;
  supportsRating: boolean;
  supportsReplay: boolean;
  previous: Readonly<GameFieldsPlatformRoomRecord<GameSdkStoredRoom>>;
  next: Readonly<GameFieldsPlatformRoomRecord<GameSdkStoredRoom>>;
};

type ApprovedSdkResultEventPersistenceOptions = Omit<
  ApprovedSdkResultPersistenceOptions,
  "previous" | "next"
> & {
  result: Readonly<GameFieldsPlatformResultOutboxEntry>;
};

export async function persistApprovedGameSdkResultEvent({
  gameType,
  title,
  supportsStats,
  supportsRating,
  supportsReplay,
  result: outbox,
}: ApprovedSdkResultEventPersistenceOptions) {
  const snapshot = outbox.snapshot;
  const standardResult = snapshot.standardResult as GameSdkStandardResult<string> | null;
  if (
    !standardResult
    || !Array.isArray(snapshot.players)
    || !snapshot.players.every((player) => (
      player
      && typeof player === "object"
      && typeof (player as { id?: unknown }).id === "string"
      && typeof (player as { displayName?: unknown }).displayName === "string"
    ))
  ) return;
  const players = snapshot.players.map((player) => {
    const typed = player as { id: string; displayName: string };
    return { id: typed.id, name: typed.displayName };
  });
  const settings = snapshot.settings && typeof snapshot.settings === "object"
    ? snapshot.settings as Record<string, unknown>
    : {};
  await Promise.all([
    ...(supportsStats ? [recordStandardPlatformGameResults({
      gameType,
      eventId: outbox.eventId,
      roomCode: snapshot.roomCode,
      roomCreatedAt: snapshot.roomCreatedAt,
      gameNumber: snapshot.resultRevision,
      startedAt: snapshot.roomCreatedAt,
      finishedAt: snapshot.finishedAt,
      players,
      winnerIds: standardResult.winnerIds,
      rankings: standardResult.rankings,
      reason: standardResult.reason,
      supportsRating,
      variantKey: Object.entries(settings)
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
    })] : []),
    ...(supportsReplay ? [
      recordStandardPlatformGameReplay({
        gameType,
        eventId: outbox.eventId,
        roomCode: snapshot.roomCode,
        finishedAt: snapshot.finishedAt,
        gameNumber: snapshot.resultRevision,
        title,
        runtimeContract: snapshot.runtimeContract,
        players,
        winnerIds: standardResult.winnerIds,
        rankings: standardResult.rankings,
        reason: standardResult.reason,
      }),
    ] : []),
  ]);
}

/**
 * Persists a result once, when a reviewed SDK room first enters a result state.
 * Only the common result contract is stored; game secrets never cross this
 * boundary into player history or playback.
 */
export async function persistApprovedGameSdkResult({
  gameType,
  title,
  supportsStats,
  supportsRating,
  supportsReplay,
  previous,
  next,
}: ApprovedSdkResultPersistenceOptions) {
  const previousRoom = previous.room as ResultRoom;
  const nextRoom = next.room as ResultRoom;
  const result = nextRoom.standardResult;
  if (
    next.phase !== "result"
    || !result
    || previousRoom.standardResult
    || !Array.isArray(nextRoom.players)
  ) return;
  const players = nextRoom.players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
  }));
  await persistApprovedGameSdkResultEvent({
    gameType,
    title,
    supportsStats,
    supportsRating,
    supportsReplay,
    result: {
      eventId: `sdk:${gameType}:${next.code}:${next.createdAt}:${next.revision}`,
      status: "result-persisting",
      attempts: 1,
      confirmedAt: next.updatedAt,
      updatedAt: next.updatedAt,
      snapshot: {
        roomCode: next.code,
        roomCreatedAt: next.createdAt,
        resultRevision: next.revision,
        finishedAt: next.updatedAt,
        runtimeContract: next.runtimeContract,
        players,
        settings: nextRoom.settings ?? {},
        standardResult: result,
      },
    },
  });
}
