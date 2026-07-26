import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomListPage,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type { GameSdkServerModule } from "@game-fields/game-sdk/runtime";
import type {
  GameSdkPlatformResources,
} from "@game-fields/game-sdk/resources";
import {
  createGameFieldsPlatformRuntime,
  GameFieldsPlatformRuntimeError,
  gameFieldsPlatformRuntimeContractsEqual,
  type GameFieldsAuthenticatedIdentity,
  type GameFieldsPlatformRoomRecord,
  type GameFieldsPlatformRoomPersistence,
  type GameFieldsPlatformResultOutboxEntry,
  type GameFieldsPlatformRuntimeContract,
} from "@game-fields/game-runtime";
import {
  createRedisGameSdkPlatformPersistence,
  createRedisGameSdkPlatformRoomStore,
  normalizeGameSdkPlatformRoomCode,
  type GameSdkPlatformRoomStore,
} from "./game-sdk-platform-room-store.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";
import {
  emitObservabilityEvent,
  observabilityRef,
} from "./observability/index.ts";

export {
  createRedisGameSdkPlatformPersistence,
  gameSdkPlatformRoomIndexKey,
  gameSdkPlatformRoomKey,
  normalizeGameSdkPlatformRoomCode,
} from "./game-sdk-platform-room-store.ts";

type IdentityResolver = () => Promise<GameFieldsAuthenticatedIdentity>;

export type GameSdkPlatformRuntimeDefinition<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  runtimeContract: Readonly<GameFieldsPlatformRuntimeContract>;
  resources?: Readonly<GameSdkPlatformResources>;
  onRoomSaved?: (
    previous: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
    next: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
  ) => Promise<unknown>;
  onResultConfirmed?: (
    result: Readonly<GameFieldsPlatformResultOutboxEntry>,
  ) => Promise<unknown>;
};

type AuthenticatedPlatformAdapterOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  persistence?: GameFieldsPlatformRoomPersistence<TRoom>;
  roomStore?: GameSdkPlatformRoomStore<TRoom>;
  resolveIdentity?: IdentityResolver;
  now?: () => number;
  createRequestId?: () => string;
  resources?: Readonly<GameSdkPlatformResources>;
  roomScopeId?: string;
  environment?: GameFieldsEnvironment;
  runtimeContract?: Readonly<GameFieldsPlatformRuntimeContract>;
  resolveRuntime?: (
    contract: Readonly<GameFieldsPlatformRuntimeContract>,
  ) => Promise<GameSdkPlatformRuntimeDefinition<
    TRoom,
    TCreateInput,
    TCommand,
    TRoomView
  > | null>;
  onRoomSaved?: (
    previous: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
    next: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
  ) => Promise<unknown>;
  onResultConfirmed?: (
    result: Readonly<GameFieldsPlatformResultOutboxEntry>,
  ) => Promise<unknown>;
};

export type AuthenticatedGameSdkPlatformAdapter<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
    requestId?: string;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readRoomAsDebugViewer(
    code: string,
    viewer: number | "spectator",
  ): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readActiveRoom(): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  listRooms(cursor?: string | null): Promise<GameSdkRoomListPage>;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
  }): Promise<GameSdkCommandResult<TRoomView>>;
  dissolveRoom(code: string): Promise<boolean>;
  dissolveHostedRooms(): Promise<number>;
};

async function resolveAuthenticatedIdentity(supportsDebug: boolean): Promise<GameFieldsAuthenticatedIdentity> {
  const [{ requireAuthenticatedPlayer }, { playerHasDebugAccess }] = await Promise.all([
    import("./player-auth.ts"),
    import("./debug-access.ts"),
  ]);
  const player = await requireAuthenticatedPlayer();
  return {
    playerId: player.id,
    displayName: player.name,
    debugAccess: supportsDebug ? await playerHasDebugAccess(player.id) : false,
  };
}

/**
 * Game Fields server adapter. Its public methods intentionally omit actor or
 * player IDs; every operation resolves identity from the signed HttpOnly
 * player session before delegating to the private platform Runtime.
 */
export function createAuthenticatedGameSdkPlatformAdapter<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  module,
  persistence: persistenceInput,
  roomStore: roomStoreInput,
  resolveIdentity = () => resolveAuthenticatedIdentity(module.manifest.supportsDebug),
  now,
  createRequestId,
  resources,
  roomScopeId,
  environment,
  runtimeContract,
  resolveRuntime,
  onRoomSaved,
  onResultConfirmed,
}: AuthenticatedPlatformAdapterOptions<TRoom, TCreateInput, TCommand, TRoomView>): AuthenticatedGameSdkPlatformAdapter<TCreateInput, TCommand, TRoomView> {
  const roomScope = roomScopeId ?? module.manifest.id;
  const roomStore = roomStoreInput
    ?? (persistenceInput
      ? null
      : createRedisGameSdkPlatformRoomStore<TRoom>(roomScope, environment));
  const persistence = roomStore
    ?? persistenceInput
    ?? createRedisGameSdkPlatformPersistence<TRoom>(roomScope, environment);
  const currentDefinition = {
    module,
    resources,
    onRoomSaved,
    onResultConfirmed,
    ...(runtimeContract ? { runtimeContract } : {}),
  };

  const createRuntime = (
    definition: typeof currentDefinition | GameSdkPlatformRuntimeDefinition<
      TRoom,
      TCreateInput,
      TCommand,
      TRoomView
    >,
  ) => createGameFieldsPlatformRuntime<
    TRoom,
    TCreateInput,
    TCommand,
    TRoomView
  >({
    module: definition.module,
    persistence,
    now,
    createRequestId,
    resources: definition.resources,
    ...("runtimeContract" in definition && definition.runtimeContract
      ? { runtimeContract: definition.runtimeContract }
      : {}),
    ...((definition.onRoomSaved || definition.onResultConfirmed) ? {
      onSaved: async (previous, next) => {
        if (definition.onRoomSaved) {
          await schedulePostResponseWork(
            `game-sdk-saved:${roomScope}:${next.code}:${next.revision}`,
            () => definition.onRoomSaved!(previous, next),
          );
        }
        if (definition.onResultConfirmed) {
          await scheduleResultOutbox(next, definition);
        }
      },
    } : {}),
  });

  const definitionForRecord = async (
    record: GameFieldsPlatformRoomRecord<TRoom>,
  ) => {
    if (
      runtimeContract
      && gameFieldsPlatformRuntimeContractsEqual(
        record.runtimeContract,
        runtimeContract,
      )
    ) return currentDefinition;
    if (!runtimeContract) return currentDefinition;
    const resolved = await resolveRuntime?.(record.runtimeContract);
    if (
      !resolved
      || resolved.module.manifest.id !== record.gameId
      || !gameFieldsPlatformRuntimeContractsEqual(
        resolved.runtimeContract,
        record.runtimeContract,
      )
    ) {
      throw new GameFieldsPlatformRuntimeError("ROOM_RUNTIME_MISMATCH", 409);
    }
    return resolved;
  };

  const runtimeForCode = async (code: string) => {
    if (!roomStore || !runtimeContract) return createRuntime(currentDefinition);
    const record = await roomStore.load(code);
    if (!record) return createRuntime(currentDefinition);
    return createRuntime(await definitionForRecord(record));
  };

  const safeResultErrorCode = (error: unknown) => {
    const code = error instanceof Error ? error.message : "";
    return /^[A-Z][A-Z0-9_]{1,99}$/.test(code)
      ? code
      : "GAME_SDK_RESULT_PERSISTENCE_FAILED";
  };

  async function scheduleResultOutbox(
    record: GameFieldsPlatformRoomRecord<TRoom>,
    definitionInput?: typeof currentDefinition | GameSdkPlatformRuntimeDefinition<
      TRoom,
      TCreateInput,
      TCommand,
      TRoomView
    >,
  ) {
    if (!roomStore) return;
    const pending = record.resultOutbox.filter(
      (entry) => entry.status !== "completed",
    );
    if (pending.length === 0) return;
    const definition = definitionInput ?? await definitionForRecord(record);
    if (!definition.onResultConfirmed) return;
    await Promise.all(pending.map((entry) => schedulePostResponseWork(
      `game-sdk-result:${roomScope}:${record.code}:${entry.eventId}`,
      async () => {
        const claimed = await roomStore.claimResultOutbox(
          record.code,
          entry.eventId,
          Date.now(),
        );
        const claimedEntry = claimed?.resultOutbox.find(
          (item) => item.eventId === entry.eventId,
        );
        if (!claimedEntry) return;
        emitObservabilityEvent("info", "game-sdk.result-outbox", {
          game: `sdk:${roomScope}`,
          operation: "persist-result",
          roomRef: observabilityRef("room", record.code),
          eventRef: observabilityRef("event", entry.eventId),
          revision: entry.snapshot.resultRevision,
          attempt: claimedEntry.attempts,
          outcome: "started",
        });
        try {
          await definition.onResultConfirmed!(claimedEntry);
          const completed = await roomStore.completeResultOutbox(
            record.code,
            entry.eventId,
            Date.now(),
          );
          if (!completed) throw new Error("GAME_SDK_RESULT_OUTBOX_CONFLICT");
          emitObservabilityEvent("info", "game-sdk.result-outbox", {
            game: `sdk:${roomScope}`,
            operation: "persist-result",
            roomRef: observabilityRef("room", record.code),
            eventRef: observabilityRef("event", entry.eventId),
            revision: entry.snapshot.resultRevision,
            attempt: claimedEntry.attempts,
            outcome: "success",
          });
        } catch (error) {
          const code = safeResultErrorCode(error);
          await roomStore.retryResultOutbox(
            record.code,
            entry.eventId,
            Date.now(),
            code,
          );
          emitObservabilityEvent("error", "game-sdk.result-outbox", {
            game: `sdk:${roomScope}`,
            operation: "persist-result",
            roomRef: observabilityRef("room", record.code),
            eventRef: observabilityRef("event", entry.eventId),
            revision: entry.snapshot.resultRevision,
            attempt: claimedEntry.attempts,
            outcome: "failed",
            errorCode: code,
          });
          throw new Error(code);
        }
      },
    )));
  }

  return {
    async createRoom({ roomCode, create, requestId }) {
      const identity = await resolveIdentity();
      const normalizedCode = normalizeGameSdkPlatformRoomCode(roomCode);
      const claim = roomStore
        ? await roomStore.claimActiveRoom(identity.playerId, normalizedCode)
        : null;
      try {
        const room = await createRuntime(currentDefinition).createRoom({
          roomCode: normalizedCode,
          create,
          requestId,
          identity,
        });
        const record = roomStore ? await roomStore.load(normalizedCode) : null;
        if (record) {
          await roomStore!.publishRevision(record);
          await scheduleResultOutbox(record);
        }
        return room;
      } catch (error) {
        if (claim) await roomStore!.rollbackActiveRoomClaim(claim);
        throw error;
      }
    },

    async readRoom(code) {
      const identity = await resolveIdentity();
      const normalizedCode = normalizeGameSdkPlatformRoomCode(code);
      const runtime = await runtimeForCode(normalizedCode);
      const room = await runtime.readRoom({
        code: normalizedCode,
        identity,
      });
      const record = roomStore ? await roomStore.load(normalizedCode) : null;
      if (record) await scheduleResultOutbox(record);
      return room;
    },

    async readRoomAsDebugViewer(code, viewer) {
      const identity = await resolveIdentity();
      if (!identity.debugAccess) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_ACCESS_REQUIRED",
          403,
        );
      }
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const normalizedCode = normalizeGameSdkPlatformRoomCode(code);
      const record = await roomStore.load(normalizedCode);
      if (!record) return null;
      if (record.hostPlayerId !== identity.playerId) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_ACCESS_REQUIRED",
          403,
        );
      }
      const players = "players" in record.room
        && Array.isArray(
          (record.room as GameSdkStoredRoom & { players?: unknown }).players,
        )
        ? (record.room as GameSdkStoredRoom & {
            players: Array<{ id?: unknown }>;
          }).players
        : [];
      const target = viewer === "spectator" ? null : players[viewer];
      if (
        viewer !== "spectator"
        && (
          !Number.isSafeInteger(viewer)
          || viewer < 0
          || !target
          || typeof target.id !== "string"
        )
      ) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_VIEWER_INVALID",
          400,
        );
      }
      const runtime = createRuntime(await definitionForRecord(record));
      const room = await runtime.readRoom({
        code: normalizedCode,
        identity,
        debugViewer: target
          ? {
              playerId: target.id as string,
              role: target.id === record.hostPlayerId ? "host" : "player",
              debugAccess: true,
            }
          : {
              playerId: null,
              role: "spectator",
              debugAccess: true,
            },
      });
      await scheduleResultOutbox(record);
      return room;
    },

    async readActiveRoom() {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const record = await roomStore.loadActiveRoom(identity.playerId);
      if (!record) return null;
      const runtime = createRuntime(await definitionForRecord(record));
      const room = await runtime.readRoom({ code: record.code, identity });
      await scheduleResultOutbox(record);
      return room;
    },

    async listRooms(cursor) {
      await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      return roomStore.listRooms(cursor, module.manifest.maximumPlayers);
    },

    async sendCommand({ code, envelope }) {
      const identity = await resolveIdentity();
      const normalizedCode = normalizeGameSdkPlatformRoomCode(code);
      const lifecycleType = envelope.command.type;
      const claim = roomStore && lifecycleType === "room/join"
        ? await roomStore.claimActiveRoom(identity.playerId, normalizedCode)
        : null;
      try {
        const runtime = await runtimeForCode(normalizedCode);
        const result = await runtime.sendCommand({
          code: normalizedCode,
          envelope,
          identity,
        });
        if (roomStore && lifecycleType === "room/leave") {
          await roomStore.releaseActiveRoom(identity.playerId, normalizedCode);
        }
        const record = roomStore ? await roomStore.load(normalizedCode) : null;
        if (record) {
          await roomStore!.publishRevision(record);
          await scheduleResultOutbox(record);
        }
        return result;
      } catch (error) {
        if (claim) await roomStore!.rollbackActiveRoomClaim(claim);
        throw error;
      }
    },

    async dissolveRoom(code) {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const record = await roomStore.dissolveRoom(
        normalizeGameSdkPlatformRoomCode(code),
        identity.playerId,
      );
      if (record) await roomStore.publishRevision(record, record.revision + 1);
      return Boolean(record);
    },

    async dissolveHostedRooms() {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const records = await roomStore.dissolveHostedRooms(identity.playerId);
      await Promise.all(records.map(
        (record) => roomStore.publishRevision(record, record.revision + 1),
      ));
      return records.length;
    },
  };
}
