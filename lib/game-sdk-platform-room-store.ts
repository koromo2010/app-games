import type {
  GameSdkRoomListPage,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import {
  GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
  type GameFieldsPlatformRoomPersistence,
  type GameFieldsPlatformRoomRecord,
} from "@game-fields/game-runtime";
import {
  isMultiplayerRoomExpired,
  multiplayerRoomExpiryArgs,
  multiplayerRoomTtlSeconds,
} from "./multiplayer-room-lifecycle.ts";
import { loadIndexedOnlineRoomPage } from "./online-room-list.ts";
import {
  compareAndSetOnlineRoom,
  createIndexedOnlineRoom,
} from "./online-room-persistence.ts";
import { publishOnlineRoomRevision } from "./online-room-realtime-server.ts";
import { deleteIndexedOnlineRoomStorage } from "./online-room-dissolution.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
import { redisCommand } from "./redis-store.ts";
import {
  resolveGameFieldsEnvironment,
  type GameFieldsEnvironment,
} from "./game-fields-environment.ts";

const maximumPlatformRoomBytes = 512_000;
const platformRoomCreateConflict = "GAME_SDK_PLATFORM_ROOM_ALREADY_EXISTS";

export type GameSdkPlatformActiveRoomClaim = {
  playerId: string;
  targetCode: string;
  previousCode: string | null;
  changed: boolean;
};

export type GameSdkPlatformActiveRoomReplacement = {
  code: string;
  packageRevision: string;
  nextPackageRevision: string;
};

export type GameSdkPlatformRoomStore<TRoom extends GameSdkStoredRoom> =
  GameFieldsPlatformRoomPersistence<TRoom> & {
    claimActiveRoom(
      playerId: string,
      targetCode: string,
      replacement?: GameSdkPlatformActiveRoomReplacement,
    ): Promise<GameSdkPlatformActiveRoomClaim>;
    rollbackActiveRoomClaim(claim: GameSdkPlatformActiveRoomClaim): Promise<void>;
    releaseActiveRoom(playerId: string, roomCode: string): Promise<void>;
    loadActiveRoom(playerId: string): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
    listRooms(
      cursor: unknown,
      maximumPlayers: number,
      packageRevision?: string,
    ): Promise<GameSdkRoomListPage>;
    dissolveRoom(
      code: string,
      actorId: string,
    ): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
    dissolveHostedRooms(
      actorId: string,
      beforeDissolve?: (
        record: GameFieldsPlatformRoomRecord<TRoom>,
      ) => Promise<void>,
    ): Promise<GameFieldsPlatformRoomRecord<TRoom>[]>;
    publishRevision(record: GameFieldsPlatformRoomRecord<TRoom>, revision?: number): Promise<void>;
    claimResultOutbox(
      code: string,
      eventId: string,
      now: number,
    ): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
    completeResultOutbox(
      code: string,
      eventId: string,
      now: number,
    ): Promise<boolean>;
    retryResultOutbox(
      code: string,
      eventId: string,
      now: number,
      errorCode: string,
    ): Promise<boolean>;
  };

export function normalizeGameSdkPlatformRoomCode(value: string) {
  const code = value.normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error("GAME_SDK_INVALID_ROOM_CODE");
  return code;
}

function roomPrefix(
  gameId: string,
  environment?: GameFieldsEnvironment,
) {
  return `game-sdk-runtime:v2:${resolveGameFieldsEnvironment(environment)}:${gameId}`;
}

export function gameSdkPlatformRoomKey(
  gameId: string,
  code: string,
  environment?: GameFieldsEnvironment,
) {
  return `${roomPrefix(gameId, environment)}:room:${normalizeGameSdkPlatformRoomCode(code)}`;
}

export function gameSdkPlatformRoomIndexKey(
  gameId: string,
  environment?: GameFieldsEnvironment,
) {
  return `${roomPrefix(gameId, environment)}:rooms`;
}

export function gameSdkPlatformActiveRoomKey(
  gameId: string,
  playerId: string,
  environment?: GameFieldsEnvironment,
) {
  return `${roomPrefix(gameId, environment)}:player-active-room:${playerId.trim()}`;
}

function roomPlayerIds<TRoom extends GameSdkStoredRoom>(
  record: GameFieldsPlatformRoomRecord<TRoom>,
) {
  const players = (record.room as { players?: unknown }).players;
  if (!Array.isArray(players)) return [record.hostPlayerId];
  const ids = players
    .map((player) => (
      player && typeof player === "object" && typeof (player as { id?: unknown }).id === "string"
        ? (player as { id: string }).id.trim()
        : ""
    ))
    .filter(Boolean);
  return [...new Set([record.hostPlayerId, ...ids])];
}

function roomActivePlayerIds<TRoom extends GameSdkStoredRoom>(
  record: GameFieldsPlatformRoomRecord<TRoom>,
) {
  const players = (record.room as { players?: unknown }).players;
  if (!Array.isArray(players)) return [record.hostPlayerId];
  const ids = players
    .flatMap((player) => (
      player
      && typeof player === "object"
      && (player as { isDummy?: unknown }).isDummy !== true
      && typeof (player as { id?: unknown }).id === "string"
        ? [(player as { id: string }).id.trim()]
        : []
    ))
    .filter(Boolean);
  return [...new Set([record.hostPlayerId, ...ids])];
}

function serializedRecord<TRoom extends GameSdkStoredRoom>(
  record: GameFieldsPlatformRoomRecord<TRoom>,
) {
  const value = JSON.stringify(record);
  if (Buffer.byteLength(value, "utf8") > maximumPlatformRoomBytes) {
    throw new Error("GAME_SDK_PLATFORM_ROOM_TOO_LARGE");
  }
  return value;
}

export function parseGameSdkPlatformRoomRecord<TRoom extends GameSdkStoredRoom>(
  raw: string,
  gameId: string,
  code: string,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  const record = parsed as Partial<GameFieldsPlatformRoomRecord<TRoom>>;
  const room = record.room as Partial<TRoom> | undefined;
  if (
    record.schemaVersion !== GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION
    || record.gameId !== gameId
    || record.code !== code
    || typeof record.hostPlayerId !== "string"
    || !record.hostPlayerId.trim()
    || typeof record.creationRequestId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(record.creationRequestId)
    || !Number.isSafeInteger(record.revision)
    || typeof record.phase !== "string"
    || typeof record.createdAt !== "number"
    || typeof record.updatedAt !== "number"
    || !record.runtimeContract
    || typeof record.runtimeContract !== "object"
    || typeof record.runtimeContract.packageRevision !== "string"
    || !/^[a-f0-9]{64}$/.test(record.runtimeContract.packageRootSha256 ?? "")
    || typeof record.runtimeContract.runtimeVersion !== "string"
    || !Number.isSafeInteger(record.runtimeContract.sdkContractVersion)
    || !Number.isSafeInteger(record.runtimeContract.roomSchemaVersion)
    || !Number.isSafeInteger(record.runtimeContract.resourceProtocolVersion)
    || !Number.isSafeInteger(record.runtimeContract.clientBridgeVersion)
    || !("settingsSnapshot" in record)
    || !Array.isArray(record.commandReceipts)
    || !Array.isArray(record.resultOutbox)
    || !room
    || room.code !== code
    || room.revision !== record.revision
    || room.phase !== record.phase
  ) {
    throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  }
  return record as GameFieldsPlatformRoomRecord<TRoom>;
}

export function createRedisGameSdkPlatformRoomStore<TRoom extends GameSdkStoredRoom>(
  gameId: string,
  environment?: GameFieldsEnvironment,
): GameSdkPlatformRoomStore<TRoom> {
  const indexKey = gameSdkPlatformRoomIndexKey(gameId, environment);
  const activeKey = (playerId: string) => (
    gameSdkPlatformActiveRoomKey(gameId, playerId, environment)
  );
  const roomKey = (code: string) => gameSdkPlatformRoomKey(
    gameId,
    code,
    environment,
  );

  const deleteStorage = async (record: GameFieldsPlatformRoomRecord<TRoom>) => {
    await deleteIndexedOnlineRoomStorage({
      roomCode: record.code,
      roomKey: roomKey(record.code),
      roomIndexKey: indexKey,
      playerActiveRoomKeys: roomPlayerIds(record).map(activeKey),
    });
  };

  const store: GameSdkPlatformRoomStore<TRoom> = {
    async create(record) {
      serializedRecord(record);
      try {
        await createIndexedOnlineRoom(record, {
          roomKey,
          roomIndexKey: indexKey,
          activeRoomKeys: (created) => roomActivePlayerIds(created).map(activeKey),
          conflictError: platformRoomCreateConflict,
          activeRoomConflictError: "PLAYER_ACTIVE_ROOM",
        });
        return "created";
      } catch (error) {
        if (error instanceof Error && error.message === platformRoomCreateConflict) return "exists";
        throw error;
      }
    },

    async load(codeInput) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
      if (!raw) return null;
      const record = parseGameSdkPlatformRoomRecord<TRoom>(raw, gameId, code);
      if (!isMultiplayerRoomExpired(record.updatedAt)) return record;
      await deleteStorage(record);
      return null;
    },

    async compareAndSet(expectedRevision, record) {
      serializedRecord(record);
      const result = await compareAndSetOnlineRoom(
        expectedRevision,
        record,
        roomKey,
        roomActivePlayerIds(record).map(activeKey),
      );
      if (result === 1) return "saved";
      if (result === -1) return "missing";
      return "conflict";
    },

    async claimResultOutbox(codeInput, eventId, now) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const raw = await redisCommand<string | null>([
        "EVAL",
        "local raw=redis.call('GET',KEYS[1]); if not raw then return nil end; local record=cjson.decode(raw); for _,entry in ipairs(record.resultOutbox or {}) do if entry.eventId==ARGV[1] then if entry.status=='completed' then return nil end; if entry.status=='result-persisting' and (entry.leaseExpiresAt or 0)>tonumber(ARGV[2]) then return nil end; entry.status='result-persisting'; entry.attempts=(entry.attempts or 0)+1; entry.updatedAt=tonumber(ARGV[2]); entry.leaseExpiresAt=tonumber(ARGV[2])+tonumber(ARGV[3]); entry.lastErrorCode=nil; local next=cjson.encode(record); redis.call('SET',KEYS[1],next,'EX',ARGV[4]); return next end end; return nil",
        "1",
        roomKey(code),
        eventId,
        String(now),
        String(60_000),
        String(multiplayerRoomTtlSeconds),
      ]);
      return raw ? parseGameSdkPlatformRoomRecord<TRoom>(raw, gameId, code) : null;
    },

    async completeResultOutbox(codeInput, eventId, now) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const saved = await redisCommand<number>([
        "EVAL",
        "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local record=cjson.decode(raw); for _,entry in ipairs(record.resultOutbox or {}) do if entry.eventId==ARGV[1] then if entry.status=='completed' then return 1 end; if entry.status~='result-persisting' then return 0 end; entry.status='completed'; entry.updatedAt=tonumber(ARGV[2]); entry.leaseExpiresAt=nil; entry.lastErrorCode=nil; redis.call('SET',KEYS[1],cjson.encode(record),'EX',ARGV[3]); return 1 end end; return 0",
        "1",
        roomKey(code),
        eventId,
        String(now),
        String(multiplayerRoomTtlSeconds),
      ]);
      return saved === 1;
    },

    async retryResultOutbox(codeInput, eventId, now, errorCode) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const saved = await redisCommand<number>([
        "EVAL",
        "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local record=cjson.decode(raw); for _,entry in ipairs(record.resultOutbox or {}) do if entry.eventId==ARGV[1] then if entry.status=='completed' then return 1 end; entry.status='result-confirmed'; entry.updatedAt=tonumber(ARGV[2]); entry.leaseExpiresAt=nil; entry.lastErrorCode=ARGV[3]; redis.call('SET',KEYS[1],cjson.encode(record),'EX',ARGV[4]); return 1 end end; return 0",
        "1",
        roomKey(code),
        eventId,
        String(now),
        errorCode,
        String(multiplayerRoomTtlSeconds),
      ]);
      return saved === 1;
    },

    async claimActiveRoom(playerIdInput, targetCodeInput, replacementInput) {
      const playerId = playerIdInput.trim();
      const targetCode = normalizeGameSdkPlatformRoomCode(targetCodeInput);
      if (!playerId) throw new Error("INVALID_PLATFORM_IDENTITY");
      const key = activeKey(playerId);
      const firstCode = await redisCommand<string | null>(["GET", key]);
      const current = firstCode ? await store.load(firstCode) : null;
      const currentCode = await redisCommand<string | null>(["GET", key]);
      const replacement = replacementInput
        ? {
            code: normalizeGameSdkPlatformRoomCode(replacementInput.code),
            packageRevision: replacementInput.packageRevision.trim(),
            nextPackageRevision: replacementInput.nextPackageRevision.trim(),
          }
        : null;
      const canReplaceCurrent = Boolean(
        replacement
        && currentCode
        && current
        && current.code === currentCode
        && current.code === replacement.code
        && roomPlayerIds(current).includes(playerId)
        && current.runtimeContract.packageRevision === replacement.packageRevision
        && replacement.packageRevision !== replacement.nextPackageRevision,
      );
      if (replacement && !canReplaceCurrent) {
        throw new Error("GAME_SDK_ACTIVE_ROOM_REPLACEMENT_FORBIDDEN");
      }
      if (
        currentCode
        && current
        && current.code === currentCode
        && roomPlayerIds(current).includes(playerId)
        && current.code !== targetCode
        && current.phase !== "result"
        && !canReplaceCurrent
      ) {
        throw new Error("PLAYER_ACTIVE_ROOM");
      }
      const expectedCode = currentCode ?? "";
      const changed = currentCode?.toUpperCase() !== targetCode;
      const saved = await redisCommand<number>([
        "EVAL",
        "local current=redis.call('GET',KEYS[1]); local expected=ARGV[1]; if (not current and expected~='') or (current and string.upper(current)~=string.upper(expected)) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
        "1",
        key,
        expectedCode,
        targetCode,
        multiplayerRoomExpiryArgs()[1],
      ]);
      if (saved !== 1) throw new Error("PLAYER_ACTIVE_ROOM");
      return {
        playerId,
        targetCode,
        previousCode: currentCode,
        changed,
      };
    },

    async rollbackActiveRoomClaim(claim) {
      if (!claim.changed) return;
      const key = activeKey(claim.playerId);
      await redisCommand<number>([
        "EVAL",
        "local current=redis.call('GET',KEYS[1]); if not current or string.upper(current)~=string.upper(ARGV[1]) then return 0 end; if ARGV[2]=='' then return redis.call('DEL',KEYS[1]) end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
        "1",
        key,
        claim.targetCode,
        claim.previousCode ?? "",
        multiplayerRoomExpiryArgs()[1],
      ]);
    },

    async releaseActiveRoom(playerId, roomCode) {
      await redisCommand<number>([
        "EVAL",
        "local current=redis.call('GET',KEYS[1]); if current and string.upper(current)==string.upper(ARGV[1]) then return redis.call('DEL',KEYS[1]) end; return 0",
        "1",
        activeKey(playerId),
        normalizeGameSdkPlatformRoomCode(roomCode),
      ]);
    },

    async loadActiveRoom(playerIdInput) {
      const playerId = playerIdInput.trim();
      if (!playerId) return null;
      const key = activeKey(playerId);
      const code = await redisCommand<string | null>(["GET", key]);
      if (!code) return null;
      const record = await store.load(code);
      if (!record || !roomPlayerIds(record).includes(playerId)) {
        await store.releaseActiveRoom(playerId, code);
        return null;
      }
      return record;
    },

    async listRooms(cursor, maximumPlayers, packageRevision) {
      const page = await loadIndexedOnlineRoomPage(cursor, {
        indexKey,
        roomKey,
        parseRoom(raw) {
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as { code?: unknown };
            if (typeof parsed.code !== "string") return null;
            return parseGameSdkPlatformRoomRecord<TRoom>(
              raw,
              gameId,
              normalizeGameSdkPlatformRoomCode(parsed.code),
            );
          } catch {
            return null;
          }
        },
        loadRoom: store.load,
      });
      return {
        rooms: page.rooms
          .filter((record): record is GameFieldsPlatformRoomRecord<TRoom> => Boolean(
            record
            && !isMultiplayerRoomExpired(record.updatedAt)
            && record.phase === "lobby"
            && (
              !packageRevision
              || record.runtimeContract.packageRevision === packageRevision
            )
            && roomPlayerIds(record).length < maximumPlayers,
          ))
          .map((record) => ({
            code: record.code,
            phase: record.phase,
            revision: record.revision,
            packageRevision: record.runtimeContract.packageRevision,
            playerCount: roomPlayerIds(record).length,
            maximumPlayers,
            updatedAt: record.updatedAt,
          }))
          .sort((left, right) => right.updatedAt - left.updatedAt),
        nextCursor: page.nextCursor,
      };
    },

    async dissolveRoom(codeInput, actorId) {
      const record = await store.load(codeInput);
      if (!record) return null;
      if (record.hostPlayerId !== actorId) throw new Error("HOST_REQUIRED");
      if (record.phase !== "lobby" && record.phase !== "result") {
        throw new Error("GAME_IN_PROGRESS");
      }
      await deleteStorage(record);
      return record;
    },

    async dissolveHostedRooms(actorId, beforeDissolve) {
      const active = await store.loadActiveRoom(actorId);
      if (active?.hostPlayerId === actorId) {
        await beforeDissolve?.(active);
        const dissolved = await store.dissolveRoom(active.code, actorId);
        return dissolved ? [dissolved] : [];
      }
      const codes = await redisCommand<string[]>(["SMEMBERS", indexKey]);
      const records = await Promise.all(codes.map(store.load));
      const targets = records.filter(
        (record): record is GameFieldsPlatformRoomRecord<TRoom> => (
          record?.hostPlayerId === actorId
        ),
      );
      if (targets.some((record) => record.phase !== "lobby" && record.phase !== "result")) {
        throw new Error("GAME_IN_PROGRESS");
      }
      await Promise.all(targets.map(async (record) => {
        await beforeDissolve?.(record);
        await deleteStorage(record);
      }));
      return targets;
    },

    async publishRevision(record, revision = record.revision) {
      await schedulePostResponseWork(
        `online-room-realtime:sdk:${gameId}:${record.code}`,
        () => publishOnlineRoomRevision(`sdk:${gameId}`, {
          code: record.code,
          revision,
        }),
        { outsideRequest: "skip" },
      );
    },
  };

  return store;
}

export function createRedisGameSdkPlatformPersistence<TRoom extends GameSdkStoredRoom>(
  gameId: string,
  environment?: GameFieldsEnvironment,
): GameFieldsPlatformRoomPersistence<TRoom> {
  return {
    async create(record) {
      serializedRecord(record);
      try {
        await createIndexedOnlineRoom(record, {
          roomKey: (code) => gameSdkPlatformRoomKey(gameId, code, environment),
          roomIndexKey: gameSdkPlatformRoomIndexKey(gameId, environment),
          conflictError: platformRoomCreateConflict,
        });
        return "created";
      } catch (error) {
        if (error instanceof Error && error.message === platformRoomCreateConflict) return "exists";
        throw error;
      }
    },

    async load(codeInput) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const raw = await redisCommand<string | null>([
        "GET",
        gameSdkPlatformRoomKey(gameId, code, environment),
      ]);
      return raw ? parseGameSdkPlatformRoomRecord<TRoom>(raw, gameId, code) : null;
    },

    async compareAndSet(expectedRevision, record) {
      serializedRecord(record);
      const result = await compareAndSetOnlineRoom(
        expectedRevision,
        record,
        (code) => gameSdkPlatformRoomKey(gameId, code, environment),
      );
      if (result === 1) return "saved";
      if (result === -1) return "missing";
      return "conflict";
    },
  };
}
