import { randomUUID } from "node:crypto";
import { appendGameDebugLog } from "@/lib/game-debug-log";
import { prepareGeneralGameWordDraw, rememberGeneralGameWordHistory } from "@/lib/general-game-word-history-store";
import { recordNigoichiReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import {
  allNigoichiAssociationsSubmitted,
  allNigoichiGuessesSubmitted,
  correctNigoichiConfig,
  finishNigoichiRound,
  expireNigoichiPhase,
  isNigoichiPhaseExpired,
  isValidNigoichiGuess,
  isValidNigoichiConfig,
  nigoichiMaximumAssociationWordsForPlayers,
  nigoichiMinimumPlayers,
  normalizeNigoichiTimeLimit,
  nigoichiRoomHasSpace,
  normalizeNigoichiTimeoutAssociations,
  type NigoichiRoom,
  type NigoichiRoomAction,
} from "@/lib/nigoichi";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { recordNigoichiGameResults } from "@/lib/player-stats-store";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { canLeaveOnlineRoomLobby, canRemoveOnlineRoomDebugPlayer, isOnlineRoomDebugPlayer, onlineRoomActorAccess } from "@/lib/online-room-access";
import { nextOnlineRoomDebugParticipantName, removeOnlineRoomDebugParticipants } from "@/lib/online-room-debug-participants";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { deleteIndexedOnlineRoomStorage, dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { redisCommand } from "@/lib/redis-store";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { beginGame, resetGame, withPlayersAndCorrectedConfig } from "@/lib/nigoichi-room-domain";
import { normalizeAssociationWords, normalizeNigoichiRoom, normalizeWordDifficulty } from "@/lib/nigoichi-room-normalizer";
import { nigoichiRoomChoice, sanitizeNigoichiRoom } from "@/lib/nigoichi-room-presentation";

export { sanitizeNigoichiRoom };

const roomKeyPrefix = "nigoichi:room:";
const roomIndexKey = "nigoichi:rooms";
const playerActiveRoomKeyPrefix = "nigoichi:player-active-room:";

const debugActionLabels: Record<NigoichiRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "confirm-lobby-return": "ロビー復帰を確認",
  "remove-waiting-player": "復帰待ち参加者を退出",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "set-config": "ゲーム設定を変更",
  "expire-phase": "時間切れでフェーズを進行",
  "start-game": "ゲームを開始",
  "submit-associations": "連想語を提出",
  "submit-timeout-associations": "時間切れ時の入力済み連想語を提出",
  "submit-guess": "余り番号を予想",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-remove-player": "ダミープレイヤーを削除",
  "debug-fill-associations": "未提出の連想語を自動入力",
  "debug-fill-guesses": "未提出の予想を自動入力",
};

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}


type DebugEvent = { actorId?: string; action: string };

async function mutateStoredRoom(code: string, mutate: (room: NigoichiRoom) => NigoichiRoom | Promise<NigoichiRoom>, debugEvent?: DebugEvent) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredNigoichiRoom, mutate, normalize: normalizeNigoichiRoom, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), errors: { notFound: "NIGOICHI_ROOM_NOT_FOUND", invalid: "INVALID_NIGOICHI_ROOM", conflict: "NIGOICHI_ROOM_CONFLICT" }, prepare: (current, changed, { revision, timestamp }) => {
    const actorName = debugEvent?.actorId
      ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
      : "システム";
    return changed.debugMode && debugEvent
      ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action: debugEvent.action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
      : changed;
  }, realtimeGame: "nigoichi", afterSave: (room) => Promise.all([recordNigoichiGameResults(room), recordNigoichiReplay(room)]) });
}

async function clearActiveRoom(playerId: string, code: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code);
}

export async function loadStoredNigoichiRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeNigoichiRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await deleteIndexedOnlineRoomStorage({ roomCode: room.code, roomKey: roomKey(room.code), roomIndexKey, playerActiveRoomKeys: room.players.map((player) => playerActiveRoomKey(player.id)) });
      return null;
    }
    return room;
  } catch {
    return null;
  }
}

function parseStoredRoom(raw: string | null) {
  if (!raw) return null;
  try { return normalizeNigoichiRoom(JSON.parse(raw)); } catch { return null; }
}

export async function loadNigoichiPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadStoredNigoichiRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredNigoichiRoom(value: unknown, actorId: string) {
  const room = normalizeNigoichiRoom(value);
  if (!room || room.hostId !== actorId) throw new Error("INVALID_NIGOICHI_ROOM");
  const created: NigoichiRoom = {
    ...room,
    revision: 0,
    phase: "lobby",
    gameNumber: 1,
    debugMode: false,
    debugReplayEnabled: false,
    phaseStartedAt: null,
    words: [],
    hands: {},
    associations: {},
    guesses: {},
    missingNumber: null,
    totalScores: Object.fromEntries(room.players.map((player) => [player.id, 0])),
    roundScores: {},
    roundHistory: [],
    debugLog: [],
    updatedAt: Date.now(),
  };
  const activeRoom = await loadNigoichiPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "nigoichi", conflictError: "NIGOICHI_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), conflictError: "NIGOICHI_ROOM_CONFLICT" });
    return created;
  } catch (error) {
    if (claim === "claimed") await clearActiveRoom(actorId, created.code);
    throw error;
  }
}

export async function applyStoredNigoichiAction(code: string, action: NigoichiRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const removedDebugPlayerIds = new Set<string>();
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    const activeRoom = await loadNigoichiPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: normalizedCode, currentRoom: activeRoom, gameId: "nigoichi", conflictError: "NIGOICHI_PLAYER_ALREADY_ACTIVE" });
  }
  const startDrawRef: { value: Awaited<ReturnType<typeof prepareGeneralGameWordDraw>> | null } = { value: null };
  const room = await mutateStoredRoom(normalizedCode, async (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("NIGOICHI_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
      if (!nigoichiRoomHasSpace(current)) throw new Error("NIGOICHI_ROOM_FULL");
      const next = withPlayersAndCorrectedConfig(current, [...current.players, action.player]);
      return { ...next, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, next.players, action.actorId) };
    }

    const { isHost, isMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId);
    if (!isMember) throw new Error("NIGOICHI_ROOM_FORBIDDEN");

    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!isHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return withPlayersAndCorrectedConfig(current, current.players.filter((player) => player.id !== action.targetPlayerId));
    }

    if (action.type === "abort-game") {
      if (!isHost || !current.debugMode || current.phase === "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.gameNumber), gameStartedAt: null, phaseStartedAt: null, debugReplayEnabled: false, words: [], hands: {}, associations: {}, guesses: {}, missingNumber: null, roundScores: {} };
    }
    if (action.type === "expire-phase") {
      if (current.phaseStartedAt !== action.phaseStartedAt || !isNigoichiPhaseExpired(current)) throw new Error("NIGOICHI_ROOM_CONFLICT");
      return expireNigoichiPhase(current);
    }
    if (isNigoichiPhaseExpired(current)) return expireNigoichiPhase(current);
    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost, isMember }, current.phase)) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return withPlayersAndCorrectedConfig(current, current.players.filter((player) => player.id !== action.actorId));
    }
    if (action.type === "set-debug") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      const cleanup = action.enabled
        ? null
        : removeOnlineRoomDebugParticipants(current.players, current.lobbyReturn);
      cleanup?.removedPlayerIds.forEach((playerId) => removedDebugPlayerIds.add(playerId));
      return withPlayersAndCorrectedConfig({
        ...current,
        debugMode: action.enabled,
        debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false,
        debugLog: [],
        lobbyReturn: cleanup?.lobbyReturn ?? current.lobbyReturn,
      }, cleanup?.players ?? current.players);
    }
    if (action.type === "set-debug-replay") {
      if (!isHost || !current.debugMode) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (normalizeWordDifficulty(action.wordDifficulty) !== action.wordDifficulty
        || !Number.isInteger(action.associationWordCount)
        || action.associationWordCount < 1
        || action.associationWordCount > nigoichiMaximumAssociationWordsForPlayers(current.players.length)) {
        throw new Error("NIGOICHI_INVALID_CONFIG");
      }
      const config = correctNigoichiConfig(current.players.length, action.cardsPerPlayer, action.associationWordCount);
      return {
        ...current,
        cardsPerPlayer: config.cardsPerPlayer,
        associationWordCount: config.associationWordCount,
        wordDifficulty: normalizeWordDifficulty(action.wordDifficulty),
        clueTimeLimitSeconds: normalizeNigoichiTimeLimit(action.clueTimeLimitSeconds),
        guessTimeLimitSeconds: normalizeNigoichiTimeLimit(action.guessTimeLimitSeconds),
      };
    }
    if (action.type === "debug-add-player") {
      if (!isHost || !current.debugMode || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!nigoichiRoomHasSpace(current)) throw new Error("NIGOICHI_ROOM_FULL");
      const name = nextOnlineRoomDebugParticipantName(current.players);
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16"];
      const player = {
        id: `dummy-${randomUUID()}`,
        name,
        joinedAt: Date.now(),
        avatarColor: colors[current.players.filter(isOnlineRoomDebugPlayer).length % colors.length],
        isDummy: true,
      };
      const players = [...current.players, player];
      return withPlayersAndCorrectedConfig({
        ...current,
        lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, player.id),
      }, players);
    }
    if (action.type === "debug-remove-player") {
      if (!canRemoveOnlineRoomDebugPlayer({
        actorId: action.actorId,
        debugMode: current.debugMode,
        hostId: current.hostId,
        phase: current.phase,
        players: current.players,
        targetPlayerId: action.targetPlayerId,
      })) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      const cleanup = removeOnlineRoomDebugParticipants(
        current.players,
        current.lobbyReturn,
        action.targetPlayerId,
      );
      cleanup.removedPlayerIds.forEach((playerId) => removedDebugPlayerIds.add(playerId));
      return withPlayersAndCorrectedConfig({
        ...current,
        lobbyReturn: cleanup.lobbyReturn,
      }, cleanup.players);
    }
    if (action.type === "start-game") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("NIGOICHI_PLAYERS_NOT_RETURNED");
      if (!current.debugMode && current.players.length < nigoichiMinimumPlayers) throw new Error("NIGOICHI_NOT_ENOUGH_PLAYERS");
      const validationPlayerCount = current.debugMode ? Math.max(nigoichiMinimumPlayers, current.players.length) : current.players.length;
      if (!isValidNigoichiConfig(validationPlayerCount, current.cardsPerPlayer, current.associationWordCount)) throw new Error("NIGOICHI_INVALID_CONFIG");
      try {
        startDrawRef.value = await prepareGeneralGameWordDraw({
          game: "nigoichi",
          playerIds: current.players.filter((player) => !player.isDummy).map((player) => player.id),
          difficulty: current.wordDifficulty,
          count: current.players.length * current.cardsPerPlayer + 1,
        });
      } catch {
        throw new Error("NIGOICHI_WORDS_UNAVAILABLE");
      }
      return beginGame({ ...current, lobbyReturn: undefined }, startDrawRef.value.words, startDrawRef.value.now);
    }
    if (action.type === "reset-game") {
      if (!isHost || current.phase !== "result") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return { ...resetGame(current), lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.gameNumber) };
    }

    const targetId = "playerId" in action && action.playerId ? action.playerId : action.actorId;
    const target = current.players.find((player) => player.id === targetId);
    const canControlTarget = targetId === action.actorId || (isHost && current.debugMode && target?.isDummy);
    if (!target || !canControlTarget) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
    if (action.type === "submit-associations") {
      if (current.phase !== "clue" || current.associations[targetId]) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      const clues = normalizeAssociationWords(action.clues, current.associationWordCount);
      if (!clues) throw new Error("NIGOICHI_INVALID_CLUE");
      const next = { ...current, associations: { ...current.associations, [targetId]: clues } };
      return allNigoichiAssociationsSubmitted(next) ? { ...next, phase: "guess" as const, phaseStartedAt: Date.now() } : next;
    }
    if (action.type === "submit-timeout-associations") {
      if (current.phase !== "clue" || current.associations[targetId]) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      const clues = normalizeNigoichiTimeoutAssociations(action.clues, current.associationWordCount);
      const next = { ...current, associations: { ...current.associations, [targetId]: clues } };
      return allNigoichiAssociationsSubmitted(next) ? { ...next, phase: "guess" as const, phaseStartedAt: Date.now() } : next;
    }
    if (action.type === "submit-guess") {
      if (current.phase !== "guess" || current.guesses[targetId] !== undefined) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!isValidNigoichiGuess(current, targetId, action.number)) throw new Error("NIGOICHI_INVALID_GUESS");
      const next = { ...current, guesses: { ...current.guesses, [targetId]: action.number } };
      return allNigoichiGuessesSubmitted(next) ? finishNigoichiRound(next) : next;
    }
    if (!isHost || !current.debugMode) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-associations" && current.phase === "clue") {
      const associations = { ...current.associations };
      current.players.forEach((player, playerIndex) => {
        if (associations[player.id]) return;
        associations[player.id] = Array.from({ length: current.associationWordCount }, (_, clueIndex) => `テスト連想${playerIndex + 1}-${clueIndex + 1}`);
      });
      return { ...current, phase: "guess", phaseStartedAt: Date.now(), associations };
    }
    if (action.type === "debug-fill-guesses" && current.phase === "guess" && current.missingNumber !== null) {
      const guesses = { ...current.guesses };
      current.players.forEach((player) => { guesses[player.id] ??= current.missingNumber!; });
      return finishNigoichiRound({ ...current, guesses });
    }
    return current;
  }, { actorId: action.actorId, action: debugActionLabels[action.type] }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await clearActiveRoom(action.actorId, normalizedCode);
    throw error;
  });
  const completedStartDraw = startDrawRef.value;
  if (action.type === "start-game" && completedStartDraw) {
    await rememberGeneralGameWordHistory({
      game: "nigoichi",
      playerIds: room.players.filter((player) => !player.isDummy).map((player) => player.id),
      words: room.words,
      resetHistory: completedStartDraw.resetHistory,
      now: completedStartDraw.now,
    }).catch(() => undefined);
  }
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  if (action.type === "remove-waiting-player") await clearActiveRoom(action.targetPlayerId, room.code);
  if (removedDebugPlayerIds.size > 0) {
    await Promise.all(
      [...removedDebugPlayerIds].map((playerId) => clearActiveRoom(playerId, room.code)),
    );
  }
  return room;
}

export async function listJoinableNigoichiRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredRoom, loadRoom: loadStoredNigoichiRoom });
  const rooms = page.rooms
    .filter((room): room is NigoichiRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && nigoichiRoomHasSpace(room)))
    .map(nigoichiRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredNigoichiRoom(code: string, actorId: string) {
  await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions);
}

export async function deleteHostedNigoichiRooms(_ownerId: string, authenticatedHostId: string) {
  return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions);
}

const dissolutionOptions = {
  gameId: "nigoichi" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "NIGOICHI_ROOM_FORBIDDEN", inProgress: "NIGOICHI_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredNigoichiRoom,
};
