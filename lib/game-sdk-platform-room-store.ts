import type {
  GameSdkRoomListPage,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import {
  GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
  type GameFieldsPlatformRoomPersistence,
  type GameFieldsPlatformRoomRecord,
} from "@game-fields/game-runtime";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs } from "./multiplayer-room-lifecycle.ts";
import { loadIndexedOnlineRoomPage } from "./online-room-list.ts";
import {
  compareAndSetOnlineRoom,
  createIndexedOnlineRoom,
} from "./online-room-persistence.ts";
import { publishOnlineRoomRevision } from "./online-room-realtime-server.ts";
import { deleteIndexedOnlineRoomStorage } from "./online-room-dissolution.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
import { redisCommand } from "./redis-store.ts";

const maximumPlatformRoomBytes = 512_000;
const platformRoomCreateConflict = "GAME_SDK_PLATFORM_ROOM_ALREADY_EXISTS";

export type GameSdkPlatformActiveRoomClaim = {
  playerId: string;
  targetCode: string;
  previousCode: string | null;
  changed: boolean;
};

export type GameSdkPlatformRoomStore<TRoom extends GameSdkStoredRoom> =
  GameFieldsPlatformRoomPersistence<TRoom> & {
    claimActiveRoom(
      playerId: string,
      targetCode: string,
    ): Promise<GameSdkPlatformActiveRoomClaim>;
    rollbackActiveRoomClaim(claim: GameSdkPlatformActiveRoomClaim): Promise<void>;
    releaseActiveRoom(playerId: string, roomCode: string): Promise<void>;
    loadActiveRoom(playerId: string): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
    listRooms(cursor: unknown, maximumPlayers: number): Promise<GameSdkRoomListPage>;
    dissolveRoom(
      code: string,
      actorId: string,
    ): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
    dissolveHostedRooms(actorId: string): Promise<GameFieldsPlatformRoomRecord<TRoom>[]>;
    publishRevision(record: GameFieldsPlatformRoomRecord<TRoom>, revision?: number): Promise<void>;
  };

export function normalizeGameSdkPlatformRoomCode(value: string) {
  const code = value.normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error("GAME_SDK_INVALID_ROOM_CODE");
  return code;
}

function roomPrefix(gameId: string) {
  return `game-sdk-runtime:v1:${gameId}`;
}

export function gameSdkPlatformRoomKey(gameId: string, code: string) {
  return `${roomPrefix(gameId)}:room:${normalizeGameSdkPlatformRoomCode(code)}`;
}

export function gameSdkPlatformRoomIndexKey(gameId: string) {
  return `${roomPrefix(gameId)}:rooms`;
}

export function gameSdkPlatformActiveRoomKey(gameId: string, playerId: string) {
  return `${roomPrefix(gameId)}:player-active-room:${playerId.trim()}`;
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
    || !Number.isSafeInteger(record.revision)
    || typeof record.phase !== "string"
    || typeof record.createdAt !== "number"
    || typeof record.updatedAt !== "number"
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
): GameSdkPlatformRoomStore<TRoom> {
  const indexKey = gameSdkPlatformRoomIndexKey(gameId);
  const activeKey = (playerId: string) => gameSdkPlatformActiveRoomKey(gameId, playerId);
  const roomKey = (code: string) => gameSdkPlatformRoomKey(gameId, code);

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
          activeRoomKeys: (created) => roomPlayerIds(created).map(activeKey),
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
        roomPlayerIds(record).map(activeKey),
      );
      if (result === 1) return "saved";
      if (result === -1) return "missing";
      return "conflict";
    },

    async claimActiveRoom(playerIdInput, targetCodeInput) {
      const playerId = playerIdInput.trim();
      const targetCode = normalizeGameSdkPlatformRoomCode(targetCodeInput);
      if (!playerId) throw new Error("INVALID_PLATFORM_IDENTITY");
      const key = activeKey(playerId);
      const firstCode = await redisCommand<string | null>(["GET", key]);
      const current = firstCode ? await store.load(firstCode) : null;
      const currentCode = await redisCommand<string | null>(["GET", key]);
      if (
        currentCode
        && current
        && current.code === currentCode
        && roomPlayerIds(current).includes(playerId)
        && current.code !== targetCode
        && current.phase !== "result"
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

    async listRooms(cursor, maximumPlayers) {
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
            && roomPlayerIds(record).length < maximumPlayers,
          ))
          .map((record) => ({
            code: record.code,
            phase: record.phase,
            revision: record.revision,
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

    async dissolveHostedRooms(actorId) {
      const active = await store.loadActiveRoom(actorId);
      if (active?.hostPlayerId === actorId) {
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
      await Promise.all(targets.map(deleteStorage));
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
): GameFieldsPlatformRoomPersistence<TRoom> {
  return {
    async create(record) {
      serializedRecord(record);
      try {
        await createIndexedOnlineRoom(record, {
          roomKey: (code) => gameSdkPlatformRoomKey(gameId, code),
          roomIndexKey: gameSdkPlatformRoomIndexKey(gameId),
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
        gameSdkPlatformRoomKey(gameId, code),
      ]);
      return raw ? parseGameSdkPlatformRoomRecord<TRoom>(raw, gameId, code) : null;
    },

    async compareAndSet(expectedRevision, record) {
      serializedRecord(record);
      const result = await compareAndSetOnlineRoom(
        expectedRevision,
        record,
        (code) => gameSdkPlatformRoomKey(gameId, code),
      );
      if (result === 1) return "saved";
      if (result === -1) return "missing";
      return "conflict";
    },
  };
}
