import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
} from "@/lib/wordwolf";
import type { Player, Room, RoomChoice, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { redisCommand } from "@/lib/redis-store";
import { recordWordWolfGameResults } from "@/lib/player-stats-store";
import { recordWordWolfReplay } from "@/lib/game-replay-store";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { normalizeWordDifficulty } from "@/lib/word-selection-protocol";
import { multiplayerRoomExpiryArgs } from "@/lib/multiplayer-room-lifecycle";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { publishOnlineRoomRevision } from "@/lib/online-room-realtime-server";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import { beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import {
  applyOnlineRoomDebugParticipantCommand,
  onlineRoomNonDebugPlayerActiveRoomKeys,
} from "@/lib/online-room-debug-participants";
import { createPlatformOnlineRoomStoreRuntime } from "@/lib/online-room-store-runtime";
import {
  addRoomScore,
  normalizeClueMode,
  normalizeGameMode,
  normalizeRoundsTotal,
  normalizeWolfCount,
  normalizeWordWolfRoom,
} from "@/lib/wordwolf-room-normalizer";
import { sanitizeWordWolfRoom, wordWolfRoomChoice } from "@/lib/wordwolf-room-presentation";

export { sanitizeWordWolfRoom };

export type WordWolfRoom = Room;
export type WordWolfRoomChoice = RoomChoice;

const roomIndexKey = "wordwolf:rooms";

function normalizeWordWolfRoomForPersistence(value: unknown) {
  let room = normalizeWordWolfRoom(value);
  if (!room) return null;
  if (room.phase === "result" && room.winner && !room.statsRecordedAt) {
    room = {
      ...addRoomScore(room),
      statsRecordedAt: Date.now(),
    };
  }
  return room;
}

const roomRuntime = createPlatformOnlineRoomStoreRuntime({
  gameId: "wordwolf",
  normalize: normalizeWordWolfRoom,
  normalizeMutation: normalizeWordWolfRoomForPersistence,
  isJoinable: (room) => (
    room.phase === "lobby"
    && room.players.length < onlineRoomPlayerLimits.wordwolf
  ),
  toChoice: wordWolfRoomChoice,
  errors: {
    notFound: "WORDWOLF_ROOM_NOT_FOUND",
    invalid: "INVALID_WORDWOLF_ROOM",
    conflict: "WORDWOLF_ROOM_CONFLICT",
    playerActive: "WORDWOLF_PLAYER_ALREADY_ACTIVE",
    forbidden: "WORDWOLF_ROOM_FORBIDDEN",
    inProgress: "WORDWOLF_ROOM_IN_PROGRESS",
  },
  afterSave: (room) => Promise.all([
    recordWordWolfGameResults(room),
    recordWordWolfReplay(room),
  ]),
});

export async function loadStoredWordWolfRoom(code: string) {
  return roomRuntime.load(code);
}

export async function loadStoredPlayerActiveRoom(playerId: string) {
  return roomRuntime.loadActive(playerId);
}

export async function saveStoredWordWolfRoom(room: unknown) {
  const originalRoom = normalizeWordWolfRoom(room);
  const normalizedRoom = normalizeWordWolfRoomForPersistence(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_WORDWOLF_ROOM");
  }

  const shouldRecordResults = Boolean(
    originalRoom
    && normalizedRoom.statsRecordedAt
    && !originalRoom.statsRecordedAt,
  );

  const activeRoomKeys = onlineRoomNonDebugPlayerActiveRoomKeys(
    normalizedRoom.players,
    roomRuntime.playerActiveRoomKey,
  );
  const keys = [
    roomRuntime.roomKey(normalizedRoom.code),
    roomIndexKey,
    ...activeRoomKeys,
  ];
  // revisionをRedis内で比較し、遅れて届いた画面から部屋全体が巻き戻るのを防ぐ。
  const saved = await redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if raw then local current=cjson.decode(raw); local rev=tonumber(current.revision or 0); if tonumber(ARGV[1])<=rev then return 0 end end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); redis.call('SADD',KEYS[2],ARGV[4]); for i=3,#KEYS do redis.call('SET',KEYS[i],ARGV[4],'EX',ARGV[3]) end; return 1",
    String(keys.length), ...keys, String(normalizedRoom.revision), JSON.stringify(normalizedRoom), multiplayerRoomExpiryArgs()[1], normalizedRoom.code,
  ]);
  if (saved !== 1) throw new Error("WORDWOLF_ROOM_CONFLICT");

  await schedulePostResponseWork(
    `online-room-realtime:wordwolf:${normalizedRoom.code}`,
    () => publishOnlineRoomRevision("wordwolf", normalizedRoom),
    { outsideRequest: "skip" },
  );

  if (shouldRecordResults) {
    await schedulePostResponseWork("wordwolf-result-persistence", () => Promise.all([recordWordWolfGameResults(normalizedRoom), recordWordWolfReplay(normalizedRoom)]));
  }

  return normalizedRoom;
}

export async function createStoredWordWolfRoom(room: unknown, actorId: string) {
  const normalizedRoom = normalizeWordWolfRoom(room);
  if (!normalizedRoom) throw new Error("INVALID_WORDWOLF_ROOM");
  if (normalizedRoom.hostId !== actorId || !normalizedRoom.players.some((player) => player.id === actorId)) {
    throw new Error("WORDWOLF_ROOM_FORBIDDEN");
  }
  return roomRuntime.create(normalizedRoom, actorId);
}

function resetWordWolfRoomToLobby(room: WordWolfRoom, advanceGame: boolean) {
  return {
    ...room,
    phase: "lobby" as const,
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: null,
    wolfId: null,
    wolfIds: [],
    villageWord: "",
    wolfWord: "",
    topicReason: "",
    topicSource: "pending" as const,
    topicFallbackExhausted: false,
    topicGeneration: undefined,
    topicAnchorWordId: undefined,
    topicPartnerWordId: undefined,
    topicAnchorWord: undefined,
    clues: [],
    votes: {},
    voteHistory: [],
    runoffCandidateIds: null,
    accusedId: null,
    wolfGuess: "",
    wolfGuessJudgement: null,
    winner: null,
    resultText: "",
    gameNumber: advanceGame ? (room.gameNumber ?? 1) + 1 : room.gameNumber,
    gameStartedAt: null,
    statsRecordedAt: undefined,
    debugReplayEnabled: false,
  };
}

export async function applyStoredWordWolfRoomAction(code: string, actorId: string, action: WordWolfRoomAction) {
  let removedDebugPlayerIds: string[] = [];
  const saved = await roomRuntime.mutate(code, (current) => {
    const actorIsHost = current.hostId === actorId;
    const actorIsMember = current.players.some((player) => player.id === actorId);
    if (!actorIsMember) throw new Error("WORDWOLF_ROOM_FORBIDDEN");

    let next: WordWolfRoom = current;
    removedDebugPlayerIds = [];
    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      next = { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, actorId) };
    } else if (action.type === "recover-player") {
      next = recoverPlayerTimeout(current, actorId, current.players.find((player) => player.id === actorId)?.name ?? "プレイヤー") ?? current;
    } else if (action.type === "update-player") {
      next = {
        ...current,
        players: current.players.map((player) => player.id === actorId ? {
          ...player,
          name: action.name.trim().slice(0, 40) || player.name,
          avatarColor: isAvatarColor(action.avatarColor ?? null) ? action.avatarColor : player.avatarColor,
          avatarImage: action.avatarImage === undefined
            ? player.avatarImage
            : action.avatarImage === null
              ? undefined
              : isAvatarImage(action.avatarImage) ? action.avatarImage : player.avatarImage,
        } : player),
      };
    } else {
      if (!actorIsHost) throw new Error("WORDWOLF_ROOM_FORBIDDEN");
      if (action.type === "remove-waiting-player") {
        if (current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("WORDWOLF_ROOM_FORBIDDEN");
        next = { ...current, players: current.players.filter((player) => player.id !== action.targetPlayerId) };
      } else if (action.type === "update-config") {
        if (current.phase !== "lobby") throw new Error("WORDWOLF_ROOM_FORBIDDEN");
        const config = action.config;
        next = {
          ...current,
          clueLogVisibility: config.clueLogVisibility === "always" ? "always" : config.clueLogVisibility === "result" ? "result" : current.clueLogVisibility,
          gameMode: config.gameMode === undefined ? current.gameMode : normalizeGameMode(config.gameMode),
          wolfCount: config.wolfCount === undefined ? current.wolfCount : normalizeWolfCount(config.wolfCount, current.players.length),
          clueMode: config.clueMode === undefined ? current.clueMode : normalizeClueMode(config.clueMode),
          randomizeTurnOrder: typeof config.randomizeTurnOrder === "boolean" ? config.randomizeTurnOrder : current.randomizeTurnOrder,
          roundsTotal: config.roundsTotal === undefined ? current.roundsTotal : normalizeRoundsTotal(config.roundsTotal),
          turnTimeLimitSeconds: config.turnTimeLimitSeconds === undefined ? current.turnTimeLimitSeconds : normalizeCommonTimeLimit(config.turnTimeLimitSeconds),
          topicDictionarySource: config.topicDictionarySource === undefined ? current.topicDictionarySource : normalizeTopicDictionarySource(config.topicDictionarySource),
          topicPairDistance: config.topicPairDistance === undefined ? current.topicPairDistance : normalizeTopicPairDistance(config.topicPairDistance),
          topicDifficulty: config.topicDifficulty === undefined ? current.topicDifficulty : normalizeWordDifficulty(config.topicDifficulty),
          topicHint: typeof config.topicHint === "string" ? config.topicHint.trim().slice(0, 80) : current.topicHint,
        };
      } else if (action.type === "set-debug"
        || action.type === "debug-add-player"
        || action.type === "debug-remove-player") {
        const result = applyOnlineRoomDebugParticipantCommand(
          current,
          actorId,
          action,
          {
            forbiddenError: "WORDWOLF_ROOM_FORBIDDEN",
            assertCanAdd: (room) => {
              if (room.players.length >= onlineRoomPlayerLimits.wordwolf) {
                throw new Error("WORDWOLF_ROOM_FORBIDDEN");
              }
            },
            createPlayer: (seed, room) => ({
              id: seed.id,
              name: `Player ${room.players.length + 1}`,
              joinedAt: seed.joinedAt,
            }),
            afterParticipantsChanged: (room, change) => {
              const retainedPlayerIds = new Set(
                change.players.map((player) => player.id),
              );
              return {
                ...room,
                wolfCount: normalizeWolfCount(
                  room.wolfCount,
                  change.players.length,
                ),
                scores: Object.fromEntries(
                  Object.entries(room.scores).filter(([playerId]) => (
                    retainedPlayerIds.has(playerId)
                  )),
                ),
              };
            },
          },
        );
        next = result.room;
        removedDebugPlayerIds = result.removedPlayerIds;
      } else if (action.type === "set-debug-replay") {
        if (!current.debugMode) throw new Error("WORDWOLF_ROOM_FORBIDDEN");
        next = { ...current, debugReplayEnabled: action.enabled };
      } else if (action.type === "reset-game") {
        if (current.phase !== "result") throw new Error("WORDWOLF_ROOM_FORBIDDEN");
        next = { ...resetWordWolfRoomToLobby(current, true), lobbyReturn: beginRoomLobbyReturn(current.players, actorId, "round-result", current.gameNumber) };
      } else if (action.type === "abort-game") {
        if (!current.debugMode || current.phase === "lobby") throw new Error("WORDWOLF_ROOM_FORBIDDEN");
        next = { ...resetWordWolfRoomToLobby(current, false), lobbyReturn: beginRoomLobbyReturn(current.players, actorId, "debug-abort", current.gameNumber) };
      } else {
        throw new Error("WORDWOLF_ROOM_FORBIDDEN");
      }
    }

    return next;
  });
  if (action.type === "remove-waiting-player") {
    await roomRuntime.release(action.targetPlayerId, saved.code);
  }
  if (removedDebugPlayerIds.length > 0) {
    await roomRuntime.releaseMany(removedDebugPlayerIds, saved.code);
  }
  return saved;
}

export async function joinStoredWordWolfRoom(code: string, player: Player, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const claim = await roomRuntime.claim(player.id, normalizedCode);
  try {
    return await roomRuntime.mutate(normalizedCode, (room) => {
      if (room.phase !== "lobby") throw new Error("WORDWOLF_ROOM_STARTED");
      if (room.passphrase && room.passphrase !== passphrase.trim()) throw new Error("WORDWOLF_BAD_PASSPHRASE");
      if (room.players.some((item) => item.id === player.id)) {
        if (!room.lobbyReturn || room.lobbyReturn.returnedPlayerIds.includes(player.id)) {
          return room;
        }
        return {
          ...room,
          lobbyReturn: confirmRoomLobbyReturn(
            room.lobbyReturn,
            room.players,
            player.id,
          ),
        };
      }
      if (room.players.length >= onlineRoomPlayerLimits.wordwolf) throw new Error("WORDWOLF_ROOM_FULL");
      const players = [...room.players, player];
      return {
        ...room,
        players,
        lobbyReturn: confirmRoomLobbyReturn(
          room.lobbyReturn,
          players,
          player.id,
        ),
      };
    });
  } catch (error) {
    if (claim === "claimed") {
      await roomRuntime.release(player.id, normalizedCode);
    }
    throw error;
  }
}

export async function deleteStoredWordWolfRoom(code: string, actorId = "") {
  if (actorId) {
    await roomRuntime.dissolve(code, actorId);
    return;
  }
  const room = await loadStoredWordWolfRoom(code);
  if (room) await roomRuntime.dissolve(code, room.hostId);
}

export async function listStoredWordWolfRooms() {
  return roomRuntime.listAll();
}

export async function listStoredJoinableWordWolfRooms(cursor?: unknown) {
  return roomRuntime.list(cursor);
}

export async function deleteStoredHostedWordWolfRooms(hostId: string) {
  return roomRuntime.dissolveHosted(hostId);
}
