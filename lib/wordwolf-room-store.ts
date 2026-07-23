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
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs } from "@/lib/multiplayer-room-lifecycle";
import { canDissolveOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom } from "@/lib/player-active-room";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { publishOnlineRoomRevision } from "@/lib/online-room-realtime-server";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import { beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import {
  applyOnlineRoomDebugParticipantCommand,
  onlineRoomNonDebugPlayerActiveRoomKeys,
  releaseOnlineRoomDebugParticipantActiveRooms,
} from "@/lib/online-room-debug-participants";
import { deleteIndexedOnlineRoomStorage } from "@/lib/online-room-dissolution";
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

const roomKeyPrefix = "wordwolf:room:";
const roomIndexKey = "wordwolf:rooms";
const playerActiveRoomKeyPrefix = "wordwolf:player-active-room:";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

async function deleteWordWolfRoomStorage(roomCode: string, playerIds: string[]) {
  await deleteIndexedOnlineRoomStorage({
    roomCode,
    roomKey: roomKey(roomCode),
    roomIndexKey,
    playerActiveRoomKeys: playerIds.map(playerActiveRoomKey),
  });
}

export async function loadStoredWordWolfRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;

  try {
    const room = normalizeWordWolfRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await deleteWordWolfRoomStorage(room.code, room.players.map((player) => player.id));
      return null;
    }
    return room;
  } catch {
    return null;
  }
}

function parseStoredWordWolfRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeWordWolfRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function deletePlayerActiveRoom(playerId: string, roomCode: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), roomCode);
}

export async function loadStoredPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadStoredWordWolfRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function saveStoredWordWolfRoom(room: unknown) {
  let normalizedRoom = normalizeWordWolfRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_WORDWOLF_ROOM");
  }

  const shouldRecordResults = normalizedRoom.phase === "result" && Boolean(normalizedRoom.winner) && !normalizedRoom.statsRecordedAt;
  if (shouldRecordResults) {
    normalizedRoom = addRoomScore(normalizedRoom);
    normalizedRoom = {
      ...normalizedRoom,
      statsRecordedAt: Date.now(),
    };
  }

  const activeRoomKeys = onlineRoomNonDebugPlayerActiveRoomKeys(
    normalizedRoom.players,
    playerActiveRoomKey,
  );
  const keys = [roomKey(normalizedRoom.code), roomIndexKey, ...activeRoomKeys];
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
  const current = await loadStoredWordWolfRoom(normalizedRoom.code);
  if (current) throw new Error("WORDWOLF_ROOM_CONFLICT");
  if (normalizedRoom.hostId !== actorId || !normalizedRoom.players.some((player) => player.id === actorId)) {
    throw new Error("WORDWOLF_ROOM_FORBIDDEN");
  }
  const activeRoom = await loadStoredPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: normalizedRoom.code, currentRoom: activeRoom, gameId: "wordwolf", conflictError: "WORDWOLF_PLAYER_ALREADY_ACTIVE" });
  try {
    return await saveStoredWordWolfRoom(normalizedRoom);
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), normalizedRoom.code);
    throw error;
  }
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
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredWordWolfRoom(code);
    if (!current) throw new Error("WORDWOLF_ROOM_NOT_FOUND");
    const actorIsHost = current.hostId === actorId;
    const actorIsMember = current.players.some((player) => player.id === actorId);
    if (!actorIsMember) throw new Error("WORDWOLF_ROOM_FORBIDDEN");

    let next: WordWolfRoom = current;
    let removedDebugPlayerIds: string[] = [];
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

    if (next === current) return current;
    try {
      const saved = await saveStoredWordWolfRoom({ ...next, revision: current.revision + 1, updatedAt: Date.now() });
      if (action.type === "remove-waiting-player") await deletePlayerActiveRoom(action.targetPlayerId, saved.code);
      if (removedDebugPlayerIds.length > 0) {
        await releaseOnlineRoomDebugParticipantActiveRooms(
          removedDebugPlayerIds,
          saved.code,
          playerActiveRoomKey,
        );
      }
      return saved;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "WORDWOLF_ROOM_CONFLICT") throw error;
    }
  }
  throw new Error("WORDWOLF_ROOM_CONFLICT");
}

export async function joinStoredWordWolfRoom(code: string, player: Player, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const activeRoom = await loadStoredPlayerActiveRoom(player.id);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(player.id), targetCode: normalizedCode, currentRoom: activeRoom, gameId: "wordwolf", conflictError: "WORDWOLF_PLAYER_ALREADY_ACTIVE" });
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const room = await loadStoredWordWolfRoom(normalizedCode);
      if (!room) throw new Error("WORDWOLF_ROOM_NOT_FOUND");
      if (room.phase !== "lobby") throw new Error("WORDWOLF_ROOM_STARTED");
      if (room.passphrase && room.passphrase !== passphrase.trim()) throw new Error("WORDWOLF_BAD_PASSPHRASE");
      if (room.players.some((item) => item.id === player.id)) {
        if (!room.lobbyReturn || room.lobbyReturn.returnedPlayerIds.includes(player.id)) return room;
        try {
          return await saveStoredWordWolfRoom({ ...room, lobbyReturn: confirmRoomLobbyReturn(room.lobbyReturn, room.players, player.id), revision: room.revision + 1, updatedAt: Date.now() });
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "WORDWOLF_ROOM_CONFLICT") throw error;
          continue;
        }
      }
      if (room.players.length >= onlineRoomPlayerLimits.wordwolf) throw new Error("WORDWOLF_ROOM_FULL");
      try {
        return await saveStoredWordWolfRoom({
          ...room,
          players: [...room.players, player],
          lobbyReturn: confirmRoomLobbyReturn(room.lobbyReturn, [...room.players, player], player.id),
          revision: room.revision + 1,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "WORDWOLF_ROOM_CONFLICT") throw error;
      }
    }
    throw new Error("WORDWOLF_ROOM_CONFLICT");
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
    throw error;
  }
}

export async function deleteStoredWordWolfRoom(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const room = await loadStoredWordWolfRoom(normalizedCode);
  if (room && !canDissolveOnlineRoom("wordwolf", room)) throw new Error("WORDWOLF_ROOM_IN_PROGRESS");
  await deleteWordWolfRoomStorage(normalizedCode, room?.players.map((player) => player.id) ?? []);
}

export async function listStoredWordWolfRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredWordWolfRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is WordWolfRoom => Boolean(room));
}

export async function listStoredJoinableWordWolfRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredWordWolfRoom, loadRoom: loadStoredWordWolfRoom });
  const rooms = page.rooms
    .filter((room): room is WordWolfRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt)))
    .filter((room) => room.phase === "lobby" && room.players.length < onlineRoomPlayerLimits.wordwolf)
    .map(wordWolfRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredHostedWordWolfRooms(hostId: string) {
  const activeRoom = await loadStoredPlayerActiveRoom(hostId);
  if (activeRoom?.hostId === hostId) {
    if (!canDissolveOnlineRoom("wordwolf", activeRoom)) throw new Error("WORDWOLF_ROOM_IN_PROGRESS");
    await deleteWordWolfRoomStorage(activeRoom.code, activeRoom.players.map((player) => player.id));
    return 1;
  }

  const rooms = await listStoredWordWolfRooms();
  const hostedRooms = rooms.filter((room) => room.hostId === hostId);
  if (hostedRooms.some((room) => !canDissolveOnlineRoom("wordwolf", room))) throw new Error("WORDWOLF_ROOM_IN_PROGRESS");
  const deletions = rooms
    .filter((room) => room.hostId === hostId)
    .map((room) => deleteStoredWordWolfRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}
