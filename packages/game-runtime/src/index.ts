import { createHash } from "node:crypto";
import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkTrustedActor,
  GameSdkViewer,
} from "@game-fields/game-sdk";
import {
  gameSdkViewerFromActor,
  type GameSdkCommandContext,
  type GameSdkPresentationContext,
  type GameSdkRuntimeTiming,
  type GameSdkServerModule,
} from "@game-fields/game-sdk/runtime";
import type {
  GameSdkPlatformResources,
} from "@game-fields/game-sdk/resources";

export {
  createGameFieldsOnlineRoomMutationRuntime,
  type GameFieldsOnlineRoomCompareAndSetResult,
  type GameFieldsOnlineRoomMutationContext,
  type GameFieldsOnlineRoomMutationOptions,
  type GameFieldsOnlineRoomMutationRuntime,
  type GameFieldsRevisionedOnlineRoom,
} from "./online-room.js";

export const GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION = 2 as const;

export type GameFieldsPlatformRuntimeContract = {
  packageRevision: string;
  packageRootSha256: string;
  runtimeVersion: string;
  sdkContractVersion: number;
  roomSchemaVersion: number;
  resourceProtocolVersion: number;
  clientBridgeVersion: number;
};

export type GameFieldsPlatformCommandReceipt = {
  commandId: string;
  actorPlayerId: string;
  commandSha256: string;
  expectedRevision: number;
  resultRevision: number;
  createdAt: number;
};

export type GameFieldsPlatformResultSnapshot = {
  roomCode: string;
  roomCreatedAt: number;
  resultRevision: number;
  finishedAt: number;
  runtimeContract: GameFieldsPlatformRuntimeContract;
  players: unknown;
  settings: unknown;
  standardResult: unknown;
};

export type GameFieldsPlatformResultOutboxEntry = {
  eventId: string;
  status: "result-confirmed" | "result-persisting" | "completed";
  attempts: number;
  confirmedAt: number;
  updatedAt: number;
  leaseExpiresAt?: number;
  lastErrorCode?: string;
  snapshot: GameFieldsPlatformResultSnapshot;
};

export type GameFieldsAuthenticatedIdentity = {
  playerId: string;
  displayName: string;
  debugAccess: boolean;
};

export type GameFieldsPlatformRoomRecord<TRoom extends GameSdkStoredRoom> = {
  schemaVersion: typeof GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION;
  gameId: string;
  code: string;
  revision: number;
  phase: string;
  hostPlayerId: string;
  creationRequestId: string;
  createdAt: number;
  updatedAt: number;
  runtimeContract: GameFieldsPlatformRuntimeContract;
  settingsSnapshot: unknown;
  commandReceipts: GameFieldsPlatformCommandReceipt[];
  resultOutbox: GameFieldsPlatformResultOutboxEntry[];
  room: TRoom;
};

export type GameFieldsPlatformCreateResult = "created" | "exists";
export type GameFieldsPlatformCompareAndSetResult = "saved" | "conflict" | "missing";

export type GameFieldsPlatformRoomPersistence<TRoom extends GameSdkStoredRoom> = {
  create(record: GameFieldsPlatformRoomRecord<TRoom>): Promise<GameFieldsPlatformCreateResult>;
  load(code: string): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
  compareAndSet(
    expectedRevision: number,
    record: GameFieldsPlatformRoomRecord<TRoom>,
  ): Promise<GameFieldsPlatformCompareAndSetResult>;
};

export type GameFieldsPlatformRuntimeErrorCode =
  | "ROOM_ALREADY_EXISTS"
  | "ROOM_NOT_FOUND"
  | "STALE_REVISION"
  | "ROOM_CODE_CHANGED"
  | "INVALID_INITIAL_REVISION"
  | "INVALID_NEXT_REVISION"
  | "INVALID_PLATFORM_IDENTITY"
  | "INVALID_STORED_ROOM"
  | "ROOM_RUNTIME_MISMATCH"
  | "COMMAND_ID_CONFLICT"
  | "PLAYER_NOT_IN_ROOM"
  | "GAME_SDK_MODULE_DISABLED"
  | "GAME_SDK_ACTIVE_ROOM_REPLACEMENT_FORBIDDEN"
  | "GAME_SDK_RESULT_PERSISTENCE_PENDING"
  | "DEBUG_ACCESS_REQUIRED"
  | "DEBUG_VIEWER_INVALID"
  | "DEBUG_PROGRESS_PHASE_REQUIRED"
  | "DEBUG_DUMMY_REQUIRED"
  | "GAME_SDK_INVALID_DEBUG_COMMAND"
  | "DEBUG_AUTO_PROGRESS_UNSUPPORTED"
  | "DEBUG_INPUT_ERROR_SIMULATED"
  | "DEBUG_PLAYER_REQUIRED";

export class GameFieldsPlatformRuntimeError extends Error {
  readonly code: GameFieldsPlatformRuntimeErrorCode;
  readonly status: number;

  constructor(code: GameFieldsPlatformRuntimeErrorCode, status: number) {
    super(code);
    this.name = "GameFieldsPlatformRuntimeError";
    this.code = code;
    this.status = status;
  }
}

type PlatformRuntimeOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  persistence: GameFieldsPlatformRoomPersistence<TRoom>;
  now?: () => number;
  createRequestId?: () => string;
  resources?: Readonly<GameSdkPlatformResources>;
  runtimeContract?: Readonly<GameFieldsPlatformRuntimeContract>;
  onSaved?: (
    previous: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
    next: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
  ) => Promise<unknown>;
};

export type GameFieldsPlatformRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
    requestId?: string;
    identity: GameFieldsAuthenticatedIdentity;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(input: {
    code: string;
    identity: GameFieldsAuthenticatedIdentity;
    debugViewer?: GameSdkViewer;
  }): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
    identity: GameFieldsAuthenticatedIdentity;
    presentation?: {
      identity: GameFieldsAuthenticatedIdentity;
      debugViewer?: GameSdkViewer;
    };
    timing?: GameSdkRuntimeTiming;
  }): Promise<GameSdkCommandResult<TRoomView>>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function measured<T>(
  timing: GameSdkRuntimeTiming | undefined,
  stage: Parameters<GameSdkRuntimeTiming["record"]>[0],
  operation: () => T | Promise<T>,
) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    timing?.record(stage, Math.max(0, performance.now() - startedAt));
  }
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function roomSettingsSnapshot(room: Readonly<GameSdkStoredRoom>) {
  if (!("settings" in room)) return null;
  return clone((room as GameSdkStoredRoom & { settings: unknown }).settings);
}

function validRuntimeContract(
  value: unknown,
): value is GameFieldsPlatformRuntimeContract {
  if (!value || typeof value !== "object") return false;
  const contract = value as Partial<GameFieldsPlatformRuntimeContract>;
  return (
    typeof contract.packageRevision === "string"
    && contract.packageRevision.trim().length > 0
    && contract.packageRevision.length <= 160
    && typeof contract.packageRootSha256 === "string"
    && /^[a-f0-9]{64}$/.test(contract.packageRootSha256)
    && typeof contract.runtimeVersion === "string"
    && contract.runtimeVersion.trim().length > 0
    && contract.runtimeVersion.length <= 80
    && Number.isSafeInteger(contract.sdkContractVersion)
    && contract.sdkContractVersion! >= 1
    && Number.isSafeInteger(contract.roomSchemaVersion)
    && contract.roomSchemaVersion! >= 1
    && Number.isSafeInteger(contract.resourceProtocolVersion)
    && contract.resourceProtocolVersion! >= 1
    && Number.isSafeInteger(contract.clientBridgeVersion)
    && contract.clientBridgeVersion! >= 1
  );
}

const maximumCommandReceipts = 128;
const maximumResultOutboxEntries = 32;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function validCommandReceipt(
  value: unknown,
): value is GameFieldsPlatformCommandReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<GameFieldsPlatformCommandReceipt>;
  return (
    typeof receipt.commandId === "string"
    && commandIdPattern.test(receipt.commandId)
    && typeof receipt.actorPlayerId === "string"
    && receipt.actorPlayerId.trim().length > 0
    && typeof receipt.commandSha256 === "string"
    && /^[a-f0-9]{64}$/.test(receipt.commandSha256)
    && Number.isSafeInteger(receipt.expectedRevision)
    && receipt.expectedRevision! >= 1
    && Number.isSafeInteger(receipt.resultRevision)
    && receipt.resultRevision === receipt.expectedRevision! + 1
    && typeof receipt.createdAt === "number"
    && Number.isFinite(receipt.createdAt)
  );
}

function validResultOutboxEntry(
  value: unknown,
): value is GameFieldsPlatformResultOutboxEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<GameFieldsPlatformResultOutboxEntry>;
  const snapshot = entry.snapshot as Partial<GameFieldsPlatformResultSnapshot> | undefined;
  return (
    typeof entry.eventId === "string"
    && /^[a-f0-9]{64}$/.test(entry.eventId)
    && (
      entry.status === "result-confirmed"
      || entry.status === "result-persisting"
      || entry.status === "completed"
    )
    && Number.isSafeInteger(entry.attempts)
    && entry.attempts! >= 0
    && typeof entry.confirmedAt === "number"
    && typeof entry.updatedAt === "number"
    && (
      entry.leaseExpiresAt === undefined
      || typeof entry.leaseExpiresAt === "number"
    )
    && (
      entry.lastErrorCode === undefined
      || (
        typeof entry.lastErrorCode === "string"
        && /^[A-Z][A-Z0-9_]{1,99}$/.test(entry.lastErrorCode)
      )
    )
    && snapshot !== undefined
    && typeof snapshot.roomCode === "string"
    && typeof snapshot.roomCreatedAt === "number"
    && Number.isSafeInteger(snapshot.resultRevision)
    && typeof snapshot.finishedAt === "number"
    && validRuntimeContract(snapshot.runtimeContract)
    && "players" in snapshot
    && "settings" in snapshot
    && "standardResult" in snapshot
  );
}

function resultSnapshot(
  room: Readonly<GameSdkStoredRoom>,
  record: Pick<
    GameFieldsPlatformRoomRecord<GameSdkStoredRoom>,
    "createdAt" | "runtimeContract"
  >,
  finishedAt: number,
): GameFieldsPlatformResultSnapshot | null {
  if (
    room.phase !== "result"
    || !("standardResult" in room)
    || !(room as GameSdkStoredRoom & { standardResult?: unknown }).standardResult
    || !("players" in room)
    || !Array.isArray((room as GameSdkStoredRoom & { players?: unknown }).players)
  ) return null;
  return {
    roomCode: room.code,
    roomCreatedAt: record.createdAt,
    resultRevision: room.revision,
    finishedAt,
    runtimeContract: clone(record.runtimeContract),
    players: clone((room as GameSdkStoredRoom & { players: unknown }).players),
    settings: roomSettingsSnapshot(room),
    standardResult: clone(
      (room as GameSdkStoredRoom & { standardResult: unknown }).standardResult,
    ),
  };
}

export function gameFieldsPlatformRuntimeContractsEqual(
  left: Readonly<GameFieldsPlatformRuntimeContract>,
  right: Readonly<GameFieldsPlatformRuntimeContract>,
) {
  return (
    left.packageRevision === right.packageRevision
    && left.packageRootSha256 === right.packageRootSha256
    && left.runtimeVersion === right.runtimeVersion
    && left.sdkContractVersion === right.sdkContractVersion
    && left.roomSchemaVersion === right.roomSchemaVersion
    && left.resourceProtocolVersion === right.resourceProtocolVersion
    && left.clientBridgeVersion === right.clientBridgeVersion
  );
}

function defaultRuntimeContract(
  module: GameSdkServerModule<GameSdkStoredRoom, unknown, { type: string }, unknown>,
): GameFieldsPlatformRuntimeContract {
  return {
    packageRevision: `builtin:${module.manifest.id}:sdk-${module.manifest.sdkVersion}`,
    packageRootSha256: sha256(module.manifest),
    runtimeVersion: "game-fields-platform-runtime-v1",
    sdkContractVersion: module.manifest.sdkVersion,
    roomSchemaVersion: GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
    resourceProtocolVersion: 1,
    clientBridgeVersion: 1,
  };
}

function trustedActor(
  identity: GameFieldsAuthenticatedIdentity,
  hostPlayerId: string,
): GameSdkTrustedActor {
  const playerId = identity.playerId.trim();
  const displayName = identity.displayName.trim();
  if (!playerId || !displayName) {
    throw new GameFieldsPlatformRuntimeError("INVALID_PLATFORM_IDENTITY", 500);
  }
  return {
    playerId,
    displayName,
    role: playerId === hostPlayerId ? "host" : "player",
    debugAccess: identity.debugAccess === true,
  };
}

function storedRoomHasPlayer(
  room: Readonly<GameSdkStoredRoom>,
  playerId: string,
) {
  if (!("players" in room) || !Array.isArray(room.players)) return false;
  return room.players.some((player) => (
    player
    && typeof player === "object"
    && (player as { id?: unknown }).id === playerId
  ));
}

function assertStoredRecord<TRoom extends GameSdkStoredRoom>(
  record: GameFieldsPlatformRoomRecord<TRoom>,
  gameId: string,
  code: string,
  runtimeContract: Readonly<GameFieldsPlatformRuntimeContract>,
) {
  if (
    record.schemaVersion !== GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION
    || record.gameId !== gameId
    || record.code !== code
    || record.room.code !== code
    || record.revision !== record.room.revision
    || record.phase !== record.room.phase
    || !Number.isSafeInteger(record.revision)
    || record.revision < 1
    || !record.hostPlayerId.trim()
    || !commandIdPattern.test(record.creationRequestId)
    || !validRuntimeContract(record.runtimeContract)
    || canonicalJson(record.settingsSnapshot) !== canonicalJson(roomSettingsSnapshot(record.room))
    || !Array.isArray(record.commandReceipts)
    || record.commandReceipts.length > maximumCommandReceipts
    || !record.commandReceipts.every(validCommandReceipt)
    || !Array.isArray(record.resultOutbox)
    || record.resultOutbox.length > maximumResultOutboxEntries
    || !record.resultOutbox.every(validResultOutboxEntry)
  ) {
    throw new GameFieldsPlatformRuntimeError("INVALID_STORED_ROOM", 500);
  }
  if (!gameFieldsPlatformRuntimeContractsEqual(record.runtimeContract, runtimeContract)) {
    throw new GameFieldsPlatformRuntimeError("ROOM_RUNTIME_MISMATCH", 409);
  }
}

function snapshot<TRoom extends GameSdkStoredRoom, TRoomView>(
  room: Readonly<TRoom>,
  view: TRoomView,
): GameSdkRoomSnapshot<TRoomView> {
  return clone({
    code: room.code,
    revision: room.revision,
    phase: room.phase,
    view,
  });
}

/**
 * Internal adapter core. Callers must resolve identity from a signed platform
 * session before invoking it; browser request bodies never supply identity.
 */
export function createGameFieldsPlatformRuntime<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  module,
  persistence,
  now = Date.now,
  createRequestId = () => crypto.randomUUID(),
  resources = {},
  runtimeContract: runtimeContractInput,
  onSaved,
}: PlatformRuntimeOptions<TRoom, TCreateInput, TCommand, TRoomView>): GameFieldsPlatformRuntime<TCreateInput, TCommand, TRoomView> {
  const runtimeContract = clone(
    runtimeContractInput
      ?? defaultRuntimeContract(
        module as unknown as GameSdkServerModule<
          GameSdkStoredRoom,
          unknown,
          { type: string },
          unknown
        >,
      ),
  );
  if (!validRuntimeContract(runtimeContract)) {
    throw new GameFieldsPlatformRuntimeError("ROOM_RUNTIME_MISMATCH", 500);
  }
  const present = async (
    room: Readonly<TRoom>,
    actor: GameSdkTrustedActor,
    timestamp: number,
    viewer: GameSdkViewer = gameSdkViewerFromActor(actor),
    timing?: GameSdkRuntimeTiming,
  ) => snapshot(
    room,
    await measured(timing, "present-room", () => module.presentRoom(clone(room), {
      viewer: clone(viewer),
      now: timestamp,
      resources,
    })),
  );

  const resolveDebugViewer = (
    record: Readonly<GameFieldsPlatformRoomRecord<TRoom>>,
    requester: GameSdkTrustedActor,
    debugViewer: GameSdkViewer | undefined,
  ) => {
    if (!debugViewer) return gameSdkViewerFromActor(requester);
    if (
      !module.manifest.supportsDebug
      || !requester.debugAccess
      || requester.role !== "host"
    ) {
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
    const playerExists = debugViewer.playerId === null
      || players.some((player) => player.id === debugViewer.playerId);
    const roleMatches = debugViewer.playerId === null
      ? (
          module.manifest.supportsSpectators
          && debugViewer.role === "spectator"
        )
      : debugViewer.role === "host" || debugViewer.role === "player";
    if (!playerExists || !roleMatches) {
      throw new GameFieldsPlatformRuntimeError(
        "DEBUG_VIEWER_INVALID",
        400,
      );
    }
    return clone(debugViewer);
  };

  return {
    async createRoom({ roomCode, create, requestId: requestIdInput, identity }) {
      const timestamp = now();
      const actor = trustedActor(identity, identity.playerId.trim());
      const requestId = requestIdInput?.trim() || createRequestId();
      if (!commandIdPattern.test(requestId)) {
        throw new GameFieldsPlatformRuntimeError("COMMAND_ID_CONFLICT", 409);
      }
      const existing = await persistence.load(roomCode);
      if (existing) {
        assertStoredRecord(existing, module.manifest.id, roomCode, runtimeContract);
        if (
          existing.creationRequestId === requestId
          && existing.hostPlayerId === actor.playerId
        ) {
          return await present(existing.room, actor, timestamp);
        }
        throw new GameFieldsPlatformRuntimeError("ROOM_ALREADY_EXISTS", 409);
      }
      const room = await module.createRoom(clone(create), {
        actor: clone(actor),
        now: timestamp,
        requestId,
        roomCode,
        resources,
      });
      if (room.code !== roomCode) {
        throw new GameFieldsPlatformRuntimeError("ROOM_CODE_CHANGED", 500);
      }
      if (room.revision !== 1) {
        throw new GameFieldsPlatformRuntimeError("INVALID_INITIAL_REVISION", 500);
      }
      const record: GameFieldsPlatformRoomRecord<TRoom> = {
        schemaVersion: GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
        gameId: module.manifest.id,
        code: room.code,
        revision: room.revision,
        phase: room.phase,
        hostPlayerId: actor.playerId,
        creationRequestId: requestId,
        createdAt: timestamp,
        updatedAt: timestamp,
        runtimeContract: clone(runtimeContract),
        settingsSnapshot: roomSettingsSnapshot(room),
        commandReceipts: [],
        resultOutbox: [],
        room: clone(room),
      };
      const result = await persistence.create(record);
      if (result === "exists") {
        throw new GameFieldsPlatformRuntimeError("ROOM_ALREADY_EXISTS", 409);
      }
      return await present(room, actor, timestamp);
    },

    async readRoom({ code, identity, debugViewer }) {
      const record = await persistence.load(code);
      if (!record) return null;
      assertStoredRecord(record, module.manifest.id, code, runtimeContract);
      const actor = trustedActor(identity, record.hostPlayerId);
      const isMember = storedRoomHasPlayer(record.room, actor.playerId);
      const resolvedDebugViewer = debugViewer
        ? resolveDebugViewer(record, actor, debugViewer)
        : undefined;
      if (!debugViewer && !isMember && record.phase !== "lobby") {
        throw new GameFieldsPlatformRuntimeError(
          "PLAYER_NOT_IN_ROOM",
          403,
        );
      }
      const viewer = resolvedDebugViewer ?? (
        isMember
          ? gameSdkViewerFromActor(actor)
          : {
              playerId: null,
              role: "anonymous" as const,
              debugAccess: false,
            }
      );
      return await present(record.room, actor, now(), viewer);
    },

    async sendCommand({ code, envelope, identity, presentation, timing }) {
      const record = await measured(
        timing,
        "room-load",
        () => persistence.load(code),
      );
      if (!record) throw new GameFieldsPlatformRuntimeError("ROOM_NOT_FOUND", 404);
      assertStoredRecord(record, module.manifest.id, code, runtimeContract);
      if (
        envelope.expectedRoomInstanceId
        && envelope.expectedRoomInstanceId !== record.creationRequestId
      ) {
        throw new GameFieldsPlatformRuntimeError("ROOM_RUNTIME_MISMATCH", 409);
      }
      const timestamp = now();
      const actor = trustedActor(identity, record.hostPlayerId);
      const presenter = trustedActor(
        presentation?.identity ?? identity,
        record.hostPlayerId,
      );
      if (
        presenter.playerId !== actor.playerId
        && (!presenter.debugAccess || presenter.role !== "host")
      ) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_ACCESS_REQUIRED",
          403,
        );
      }
      const responseViewer = resolveDebugViewer(
        record,
        presenter,
        presentation?.debugViewer,
      );
      if (
        envelope.command.type !== "room/join"
        && !storedRoomHasPlayer(record.room, actor.playerId)
      ) {
        throw new GameFieldsPlatformRuntimeError(
          "PLAYER_NOT_IN_ROOM",
          403,
        );
      }
      const commandId = envelope.commandId?.trim() || createRequestId();
      if (!commandIdPattern.test(commandId)) {
        throw new GameFieldsPlatformRuntimeError("COMMAND_ID_CONFLICT", 409);
      }
      const commandSha256 = sha256({
        expectedRevision: envelope.expectedRevision,
        command: envelope.command,
      });
      const receiptResult = async (
        source: GameFieldsPlatformRoomRecord<TRoom>,
      ): Promise<GameSdkCommandResult<TRoomView> | null> => {
        const receipt = source.commandReceipts.find(
          (item) => item.commandId === commandId,
        );
        if (!receipt) return null;
        if (
          receipt.actorPlayerId !== actor.playerId
          || receipt.commandSha256 !== commandSha256
          || receipt.expectedRevision !== envelope.expectedRevision
        ) {
          throw new GameFieldsPlatformRuntimeError("COMMAND_ID_CONFLICT", 409);
        }
        const room = await present(
          source.room,
          presenter,
          now(),
          responseViewer,
          timing,
        );
        return {
          room,
          revision: room.revision,
          commandId,
          commandRevision: receipt.resultRevision,
          applied: false,
        };
      };
      const duplicate = await receiptResult(record);
      if (duplicate) return duplicate;
      if (record.revision !== envelope.expectedRevision) {
        throw new GameFieldsPlatformRuntimeError("STALE_REVISION", 409);
      }
      const debugCommand = envelope.command.type.startsWith("room/debug-");
      if (
        debugCommand
        && (
          !module.manifest.supportsDebug
          || !actor.debugAccess
          || actor.role !== "host"
        )
      ) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_ACCESS_REQUIRED",
          403,
        );
      }
      const commandRoom = clone(record.room);
      let command = clone(envelope.command);
      const commandTimestamp = timestamp;
      let platformRoom: TRoom | null = null;
      if (
        envelope.command.type === "room/debug-auto-progress"
        || envelope.command.type === "room/debug-simulate-timeout"
      ) {
        const timer = "timer" in commandRoom
          && commandRoom.timer
          && typeof commandRoom.timer === "object"
          ? commandRoom.timer as {
              deadlineAt?: unknown;
              durationSeconds?: unknown;
              startedAt?: unknown;
              turnSequence?: unknown;
            }
          : null;
        if (!timer || !Number.isSafeInteger(timer.turnSequence)) {
          throw new GameFieldsPlatformRuntimeError(
            "DEBUG_AUTO_PROGRESS_UNSUPPORTED",
            409,
          );
        }
        timer.deadlineAt = timestamp - 30_001;
        command = {
          type: "room/expire-timer",
          turnSequence: timer.turnSequence,
        } as unknown as TCommand;
      } else if (envelope.command.type === "room/debug-set-connected") {
        const players = "players" in commandRoom
          && Array.isArray(commandRoom.players)
          ? commandRoom.players as Array<{
              connected?: unknown;
              [key: string]: unknown;
            }>
          : [];
        const debugConnection = envelope.command as {
          seat?: unknown;
          connected?: unknown;
        };
        const seat = Number.isSafeInteger(debugConnection.seat)
          ? Number(debugConnection.seat)
          : -1;
        if (
          !players[seat]
          || typeof debugConnection.connected !== "boolean"
        ) {
          throw new GameFieldsPlatformRuntimeError(
            "DEBUG_PLAYER_REQUIRED",
            409,
          );
        }
        players[seat] = {
          ...players[seat],
          connected: debugConnection.connected,
        };
        platformRoom = {
          ...commandRoom,
          revision: commandRoom.revision + 1,
        };
      } else if (
        envelope.command.type === "room/debug-simulate-input-error"
      ) {
        throw new GameFieldsPlatformRuntimeError(
          "DEBUG_INPUT_ERROR_SIMULATED",
          409,
        );
      }
      const commandContext: GameSdkCommandContext = {
        actor: clone(actor),
        now: commandTimestamp,
        requestId: commandId,
        resources,
      };
      const presentationContext: GameSdkPresentationContext = {
        viewer: clone(responseViewer),
        now: timestamp,
        resources,
      };
      const canBatchPresentation = Boolean(
        !platformRoom
        && !envelope.command.type.startsWith("room/debug-")
        && module.applyCommandAndPresent
      );
      const batched = canBatchPresentation
        ? await measured(timing, "apply-command", () => (
            module.applyCommandAndPresent!(
              commandRoom,
              command,
              commandContext,
              presentationContext,
              timing,
            )
          ))
        : null;
      let nextRoom = platformRoom
        ?? batched?.room
        ?? await measured(timing, "apply-command", () => module.applyCommand(
          commandRoom,
          command,
          commandContext,
        ));
      if (
        (
          envelope.command.type === "room/debug-auto-progress"
          || envelope.command.type === "room/debug-simulate-timeout"
        )
        && "timer" in record.room
        && "timer" in nextRoom
      ) {
        const previousTimer = record.room.timer as {
          durationSeconds?: unknown;
        } | undefined;
        const nextTimer = nextRoom.timer as {
          deadlineAt?: unknown;
          durationSeconds?: unknown;
          startedAt?: unknown;
        } | undefined;
        const previousDuration = typeof previousTimer?.durationSeconds === "number"
          ? previousTimer.durationSeconds
          : null;
        const nextDuration = typeof nextTimer?.durationSeconds === "number"
          ? nextTimer.durationSeconds
          : null;
        const durationSeconds = envelope.command.type === "room/debug-auto-progress"
          ? previousDuration
          : nextDuration;
        nextRoom = {
          ...nextRoom,
          ...(nextTimer && durationSeconds !== null ? {
            timer: {
              ...nextTimer,
              durationSeconds,
              startedAt: nextTimer.startedAt === null ? null : timestamp,
              deadlineAt: nextTimer.deadlineAt === null
                ? null
                : timestamp + durationSeconds * 1_000,
            },
          } : {}),
          ...(envelope.command.type === "room/debug-auto-progress"
            && "playerTimeouts" in record.room ? {
              playerTimeouts: clone(record.room.playerTimeouts),
            } : {}),
        };
      }
      if (nextRoom.code !== record.room.code) {
        throw new GameFieldsPlatformRuntimeError("ROOM_CODE_CHANGED", 500);
      }
      if (nextRoom.revision !== record.revision + 1) {
        throw new GameFieldsPlatformRuntimeError("INVALID_NEXT_REVISION", 500);
      }
      const nextRecord: GameFieldsPlatformRoomRecord<TRoom> = {
        ...record,
        revision: nextRoom.revision,
        phase: nextRoom.phase,
        updatedAt: timestamp,
        settingsSnapshot: roomSettingsSnapshot(nextRoom),
        commandReceipts: [
          ...record.commandReceipts,
          {
            commandId,
            actorPlayerId: actor.playerId,
            commandSha256,
            expectedRevision: record.revision,
            resultRevision: nextRoom.revision,
            createdAt: timestamp,
          },
        ].slice(-maximumCommandReceipts),
        resultOutbox: (() => {
          const confirmed = resultSnapshot(
            nextRoom,
            record,
            timestamp,
          );
          if (!confirmed || record.phase === "result") {
            return record.resultOutbox;
          }
          return [
            ...record.resultOutbox,
            {
              eventId: sha256({
                packageRootSha256: runtimeContract.packageRootSha256,
                roomCode: record.code,
                resultRevision: nextRoom.revision,
              }),
              status: "result-confirmed" as const,
              attempts: 0,
              confirmedAt: timestamp,
              updatedAt: timestamp,
              snapshot: confirmed,
            },
          ].slice(-maximumResultOutboxEntries);
        })(),
        room: clone(nextRoom),
      };
      const saved = await measured(
        timing,
        "room-cas",
        () => persistence.compareAndSet(record.revision, nextRecord),
      );
      if (saved === "missing") throw new GameFieldsPlatformRuntimeError("ROOM_NOT_FOUND", 404);
      if (saved === "conflict") {
        const latest = await persistence.load(code);
        if (!latest) throw new GameFieldsPlatformRuntimeError("ROOM_NOT_FOUND", 404);
        assertStoredRecord(latest, module.manifest.id, code, runtimeContract);
        const concurrentDuplicate = await receiptResult(latest);
        if (concurrentDuplicate) return concurrentDuplicate;
        throw new GameFieldsPlatformRuntimeError("STALE_REVISION", 409);
      }
      await onSaved?.(clone(record), clone(nextRecord));
      const room = batched
        ? snapshot(nextRoom, batched.view)
        : await present(
            nextRoom,
            presenter,
            timestamp,
            responseViewer,
            timing,
          );
      return {
        room,
        revision: room.revision,
        commandId,
        commandRevision: room.revision,
        applied: true,
      };
    },
  };
}
