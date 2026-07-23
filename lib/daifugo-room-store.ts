import { canPassDaifugoTurn, chooseDaifugoCpuPlay, daifugoPlayError } from "@/lib/daifugo";
import { type DaifugoRoom, type DaifugoRoomAction, daifugoMaximumPlayers, daifugoRoomChoice, sanitizeDaifugoRoom } from "@/lib/daifugo-room";
import { beginDaifugoRoomGame, expireDaifugoTurn, passDaifugoRoomTurn, playDaifugoRoomCards, resetDaifugoRoom, updateDaifugoRoomConfig } from "@/lib/daifugo-room-domain";
import { normalizeDaifugoRoom } from "@/lib/daifugo-room-normalizer";
import { appendGameDebugLog } from "@/lib/game-debug-log";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import {
  applyOnlineRoomDebugParticipantCommand,
  onlineRoomNonDebugPlayerActiveRoomKeys,
  releaseOnlineRoomDebugParticipantActiveRooms,
} from "@/lib/online-room-debug-participants";
import { dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { redisCommand } from "@/lib/redis-store";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { recordDaifugoGameResults } from "@/lib/player-stats-store";
import { recordDaifugoReplay } from "@/lib/game-replay-store";

export { sanitizeDaifugoRoom };

const roomKeyPrefix = "daifugo:room:";
const roomIndexKey = "daifugo:rooms";
const playerActiveRoomKeyPrefix = "daifugo:player-active-room:";

const debugActionLabels: Record<DaifugoRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "confirm-lobby-return": "ロビー復帰を確認",
  "remove-waiting-player": "復帰待ち参加者を退出",
  "set-config": "ゲーム設定を変更",
  "start-game": "ゲームを開始",
  "expire-turn": "時間切れで手番を進行",
  "play-cards": "カードを出す",
  pass: "パス",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-remove-player": "ダミープレイヤーを削除",
};

function roomKey(code: string) { return `${roomKeyPrefix}${code.trim().toUpperCase()}`; }
function playerActiveRoomKey(playerId: string) { return `${playerActiveRoomKeyPrefix}${playerId}`; }
function roomHasSpace(room: DaifugoRoom) { return room.players.length < room.playerCapacity && room.players.length < daifugoMaximumPlayers; }

type DebugEvent = { actorId?: string; action: string };

async function mutateStoredRoom(code: string, mutate: (room: DaifugoRoom) => DaifugoRoom, debugEvent?: DebugEvent) {
  return mutateOnlineRoomWithRetry({
    code,
    roomKey,
    loadRoom: loadStoredDaifugoRoom,
    mutate,
    normalize: normalizeDaifugoRoom,
    activeRoomKeys: (room) => onlineRoomNonDebugPlayerActiveRoomKeys(room.players, playerActiveRoomKey),
    errors: { notFound: "DAIFUGO_ROOM_NOT_FOUND", invalid: "INVALID_DAIFUGO_ROOM", conflict: "DAIFUGO_ROOM_CONFLICT" },
    prepare: (current, changed, { revision, timestamp }) => {
      const actorName = debugEvent?.actorId
        ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
        : "システム";
      return changed.debugMode && debugEvent
        ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action: debugEvent.action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
        : changed;
    },
    realtimeGame: "daifugo",
    afterSave: (room) => Promise.all([recordDaifugoGameResults(room), recordDaifugoReplay(room)]),
  });
}

async function clearActiveRoom(playerId: string, code: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code);
}

export async function loadStoredDaifugoRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeDaifugoRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
      return null;
    }
    return room;
  } catch { return null; }
}

function parseStoredRoom(raw: string | null) {
  if (!raw) return null;
  try { return normalizeDaifugoRoom(JSON.parse(raw)); } catch { return null; }
}

export async function loadDaifugoPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadStoredDaifugoRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function reconcileDaifugoDebugDummyTurn(room: DaifugoRoom, authenticatedPlayerId: string) {
  if (!room.debugMode || room.hostId !== authenticatedPlayerId || room.phase !== "playing" || !room.game || room.game.status !== "playing") return room;
  const currentPlayerId = room.game.currentPlayerId;
  if (!currentPlayerId) return room;
  const currentPlayer = room.players.find((player) => player.id === currentPlayerId);
  if (!currentPlayer?.isDummy) return room;
  const cards = chooseDaifugoCpuPlay(room.game, currentPlayerId);
  if (cards) {
    return applyStoredDaifugoAction(room.code, {
      type: "play-cards",
      actorId: authenticatedPlayerId,
      playerId: currentPlayerId,
      cardIds: cards.map((card) => card.id),
    });
  }
  if (canPassDaifugoTurn(room.game, currentPlayerId)) {
    return applyStoredDaifugoAction(room.code, {
      type: "pass",
      actorId: authenticatedPlayerId,
      playerId: currentPlayerId,
    });
  }
  return room;
}

export async function createStoredDaifugoRoom(value: unknown, actorId: string) {
  const room = normalizeDaifugoRoom(value);
  if (!room || room.hostId !== actorId) throw new Error("INVALID_DAIFUGO_ROOM");
  const now = Date.now();
  const created: DaifugoRoom = {
    ...room,
    revision: 0,
    phase: "lobby",
    gameNumber: 1,
    gameStartedAt: null,
    phaseStartedAt: null,
    game: null,
    debugMode: false,
    debugReplayEnabled: false,
    debugLog: [],
    createdAt: now,
    updatedAt: now,
  };
  const activeRoom = await loadDaifugoPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "daifugo", conflictError: "DAIFUGO_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, activeRoomKeys: (room) => onlineRoomNonDebugPlayerActiveRoomKeys(room.players, playerActiveRoomKey), conflictError: "DAIFUGO_ROOM_CONFLICT" });
    return created;
  } catch (error) {
    if (claim === "claimed") await clearActiveRoom(actorId, created.code);
    throw error;
  }
}

export async function applyStoredDaifugoAction(code: string, action: DaifugoRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const removedDebugPlayerIds = new Set<string>();
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    const activeRoom = await loadDaifugoPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: normalizedCode, currentRoom: activeRoom, gameId: "daifugo", conflictError: "DAIFUGO_PLAYER_ALREADY_ACTIVE" });
  }
  const room = await mutateStoredRoom(normalizedCode, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("DAIFUGO_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
      if (!roomHasSpace(current)) throw new Error("DAIFUGO_ROOM_FULL");
      const players = [...current.players, action.player];
      return { ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, action.actorId) };
    }
    const { isHost, isMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId);
    if (!isMember) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!isHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.targetPlayerId) };
    }
    if (action.type === "abort-game") {
      if (!isHost || !current.debugMode || current.phase === "lobby") throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.gameNumber), gameStartedAt: null, phaseStartedAt: null, game: null, debugReplayEnabled: false };
    }
    if (action.type === "expire-turn") return expireDaifugoTurn(current, action.phaseStartedAt);
    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost, isMember }, current.phase)) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "set-debug"
      || action.type === "debug-add-player"
      || action.type === "debug-remove-player") {
      const result = applyOnlineRoomDebugParticipantCommand(
        current,
        action.actorId,
        action,
        {
          forbiddenError: "DAIFUGO_ROOM_FORBIDDEN",
          assertCanAdd: (room) => {
            if (!roomHasSpace(room)) throw new Error("DAIFUGO_ROOM_FULL");
          },
          createPlayer: (seed) => {
            const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16"];
            return {
              id: seed.id,
              name: seed.name,
              joinedAt: seed.joinedAt,
              avatarColor: colors[seed.debugParticipantIndex % colors.length],
              isDummy: true,
            };
          },
          afterModeChanged: (room) => ({ ...room, debugLog: [] }),
        },
      );
      result.removedPlayerIds.forEach((playerId) => (
        removedDebugPlayerIds.add(playerId)
      ));
      return result.room;
    }
    if (action.type === "set-debug-replay") {
      if (!isHost || !current.debugMode) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!isHost || current.phase !== "lobby") throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return updateDaifugoRoomConfig(current, action.playerCapacity, action.turnTimeLimitSeconds);
    }
    if (action.type === "start-game") {
      if (!isHost || current.phase !== "lobby") throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("DAIFUGO_PLAYERS_NOT_RETURNED");
      return beginDaifugoRoomGame({ ...current, lobbyReturn: undefined });
    }
    if (action.type === "reset-game") {
      if (!isHost || current.phase !== "result") throw new Error("DAIFUGO_ROOM_FORBIDDEN");
      return { ...resetDaifugoRoom(current), lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.gameNumber) };
    }
    const targetId = action.playerId || action.actorId;
    const target = current.players.find((player) => player.id === targetId);
    if (!target || (targetId !== action.actorId && !(isHost && current.debugMode && target.isDummy))) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
    if (!current.game || current.game.currentPlayerId !== targetId) throw new Error("DAIFUGO_ROOM_FORBIDDEN");
    if (action.type === "play-cards") {
      if (daifugoPlayError(current.game, targetId, action.cardIds)) throw new Error("DAIFUGO_INVALID_PLAY");
      return playDaifugoRoomCards(current, targetId, action.cardIds);
    }
    if (!canPassDaifugoTurn(current.game, targetId)) throw new Error("DAIFUGO_INVALID_PLAY");
    return passDaifugoRoomTurn(current, targetId);
  }, { actorId: action.actorId, action: debugActionLabels[action.type] }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await clearActiveRoom(action.actorId, normalizedCode);
    throw error;
  });
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  if (action.type === "remove-waiting-player") await clearActiveRoom(action.targetPlayerId, room.code);
  if (removedDebugPlayerIds.size > 0) {
    await releaseOnlineRoomDebugParticipantActiveRooms(
      removedDebugPlayerIds,
      room.code,
      playerActiveRoomKey,
    );
  }
  return room;
}

export async function listJoinableDaifugoRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredRoom, loadRoom: loadStoredDaifugoRoom });
  const rooms = page.rooms
    .filter((room): room is DaifugoRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && roomHasSpace(room)))
    .map(daifugoRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredDaifugoRoom(code: string, actorId: string) { await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions); }
export async function deleteHostedDaifugoRooms(_ownerId: string, authenticatedHostId: string) { return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions); }

const dissolutionOptions = {
  gameId: "daifugo" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "DAIFUGO_ROOM_FORBIDDEN", inProgress: "DAIFUGO_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredDaifugoRoom,
};
