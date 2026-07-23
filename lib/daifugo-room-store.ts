import { canPassDaifugoTurn, chooseDaifugoCpuPlay, daifugoPlayError } from "@/lib/daifugo";
import { type DaifugoRoom, type DaifugoRoomAction, daifugoMaximumPlayers, daifugoRoomChoice, sanitizeDaifugoRoom } from "@/lib/daifugo-room";
import { beginDaifugoRoomGame, expireDaifugoTurn, passDaifugoRoomTurn, playDaifugoRoomCards, resetDaifugoRoom, updateDaifugoRoomConfig } from "@/lib/daifugo-room-domain";
import { normalizeDaifugoRoom } from "@/lib/daifugo-room-normalizer";
import { appendGameDebugLog } from "@/lib/game-debug-log";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import {
  applyOnlineRoomDebugParticipantCommand,
} from "@/lib/online-room-debug-participants";
import { createPlatformOnlineRoomStoreRuntime } from "@/lib/online-room-store-runtime";
import type { ActiveRoomClaim } from "@/lib/player-active-room";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { recordDaifugoGameResults } from "@/lib/player-stats-store";
import { recordDaifugoReplay } from "@/lib/game-replay-store";

export { sanitizeDaifugoRoom };

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

function roomHasSpace(room: DaifugoRoom) { return room.players.length < room.playerCapacity && room.players.length < daifugoMaximumPlayers; }

type DebugEvent = { actorId?: string; action: string };

const roomRuntime = createPlatformOnlineRoomStoreRuntime({
  gameId: "daifugo",
  normalize: normalizeDaifugoRoom,
  isJoinable: (room) => room.phase === "lobby" && roomHasSpace(room),
  toChoice: daifugoRoomChoice,
  errors: {
    notFound: "DAIFUGO_ROOM_NOT_FOUND",
    invalid: "INVALID_DAIFUGO_ROOM",
    conflict: "DAIFUGO_ROOM_CONFLICT",
    playerActive: "DAIFUGO_PLAYER_ALREADY_ACTIVE",
    forbidden: "DAIFUGO_ROOM_FORBIDDEN",
    inProgress: "DAIFUGO_ROOM_IN_PROGRESS",
  },
  afterSave: (room) => Promise.all([
    recordDaifugoGameResults(room),
    recordDaifugoReplay(room),
  ]),
});

async function mutateStoredRoom(code: string, mutate: (room: DaifugoRoom) => DaifugoRoom, debugEvent?: DebugEvent) {
  return roomRuntime.mutate(code, mutate, {
    prepare: (current, changed, { revision, timestamp }) => {
      const actorName = debugEvent?.actorId
        ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
        : "システム";
      return changed.debugMode && debugEvent
        ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action: debugEvent.action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
        : changed;
    },
  });
}

export async function loadStoredDaifugoRoom(code: string) {
  return roomRuntime.load(code);
}

export async function loadDaifugoPlayerActiveRoom(playerId: string) {
  return roomRuntime.loadActive(playerId);
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
  return roomRuntime.create(created, actorId);
}

export async function applyStoredDaifugoAction(code: string, action: DaifugoRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const removedDebugPlayerIds = new Set<string>();
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    claim = await roomRuntime.claim(action.actorId, normalizedCode);
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
    if (action.type === "join-room" && claim === "claimed") {
      await roomRuntime.release(action.actorId, normalizedCode);
    }
    throw error;
  });
  if (action.type === "leave-room") await roomRuntime.release(action.actorId, room.code);
  if (action.type === "remove-waiting-player") {
    await roomRuntime.release(action.targetPlayerId, room.code);
  }
  if (removedDebugPlayerIds.size > 0) {
    await roomRuntime.releaseMany(
      removedDebugPlayerIds,
      room.code,
    );
  }
  return room;
}

export async function listJoinableDaifugoRooms(cursor?: unknown) {
  return roomRuntime.list(cursor);
}

export async function deleteStoredDaifugoRoom(code: string, actorId: string) {
  await roomRuntime.dissolve(code, actorId);
}

export async function deleteHostedDaifugoRooms(
  _ownerId: string,
  authenticatedHostId: string,
) {
  return roomRuntime.dissolveHosted(authenticatedHostId);
}
