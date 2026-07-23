import { redisCommand } from "@/lib/redis-store";
import { recordHodoaiGameResults } from "@/lib/player-stats-store";
import { recordHodoaiReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { randomUUID } from "node:crypto";
import { deleteIndexedOnlineRoomStorage, dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { appendGameDebugLog } from "@/lib/game-debug-log";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { canLeaveOnlineRoomLobby, canRemoveOnlineRoomDebugPlayer, isOnlineRoomDebugPlayer, onlineRoomActorAccess } from "@/lib/online-room-access";
import { nextOnlineRoomDebugParticipantName, removeOnlineRoomDebugParticipants } from "@/lib/online-room-debug-participants";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { normalizeHodoaiRoom } from "@/lib/hodoai-room-normalizer";
import { hodoaiRoomChoice, sanitizeHodoaiRoom } from "@/lib/hodoai-room-presentation";
import { beginGame, completeClueRound, reconcileProgress, scoreRound } from "@/lib/hodoai-room-domain";
import { recordPlayerActivity, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import {
  canAssignHodoaiSorter,
  canReorderHodoaiCards,
  hodoaiTechnicalPlayerLimit,
  isValidHodoaiClue,
  normalizeHodoaiClue,
  normalizeHodoaiConfig,
  hodoaiRuntimeScoring,
  type HodoaiPlayer,
  type HodoaiRoom,
  type HodoaiRoomAction,
} from "@/lib/hodoai-talk";

const roomKeyPrefix = "hodoai:room:";
const roomIndexKey = "hodoai:rooms";
const playerActiveRoomKeyPrefix = "hodoai:player-active-room:";

const hodoaiDebugActionLabels: Record<HodoaiRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "confirm-lobby-return": "ロビー復帰を確認",
  "remove-waiting-player": "復帰待ち参加者を退出",
  "recover-player": "通常の持ち時間に復帰",
  "update-config": "部屋設定を変更",
  "set-sorter": "並べ替え役を変更",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "start-game": "ゲームを開始",
  "submit-clue": "ヒントを提出",
  "submit-clues": "ヒントをまとめて提出",
  "submit-timeout-clues": "時間切れ時の入力済みヒントを提出",
  reorder: "ヒントの順番を変更",
  "score-round": "最終並びを採点",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-fill-clues": "未提出ヒントを自動入力",
  "debug-sort": "正解順に並べ替え",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-remove-player": "ダミープレイヤーを削除",
};

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}



type HodoaiDebugEvent = { actorId?: string; action: string };

async function mutateStoredRoom(code: string, mutate: (room: HodoaiRoom) => HodoaiRoom, debugEvent?: HodoaiDebugEvent) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredHodoaiRoom, mutate, normalize: normalizeHodoaiRoom, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), errors: { notFound: "HODOAI_ROOM_NOT_FOUND", invalid: "INVALID_HODOAI_ROOM", conflict: "HODOAI_ROOM_CONFLICT" }, prepare: (current, changed, { revision, timestamp }) => {
    const actorName = debugEvent?.actorId
      ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
      : "システム";
    return changed.debugMode && debugEvent
      ? {
          ...changed,
          debugLog: appendGameDebugLog(changed.debugLog, {
            timestamp,
            actorName,
            action: debugEvent.action,
            phaseBefore: current.phase,
            phaseAfter: changed.phase,
            revision,
          }),
        }
      : changed;
  }, realtimeGame: "hodoai", afterSave: (room) => Promise.all([recordHodoaiGameResults(room), recordHodoaiReplay(room)]) });
}

async function clearActiveRoom(playerId: string, code: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code);
}

export { sanitizeHodoaiRoom };

export async function loadStoredHodoaiRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeHodoaiRoom(JSON.parse(raw));
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

function parseStoredHodoaiRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeHodoaiRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadAndReconcileHodoaiRoom(code: string) {
  const room = await loadStoredHodoaiRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await schedulePostResponseWork("hodoai-result-persistence", () => Promise.all([recordHodoaiGameResults(room), recordHodoaiReplay(room)]));
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress, { action: "時間切れ処理" });
}

export async function loadHodoaiPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadAndReconcileHodoaiRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredHodoaiRoom(value: unknown, actorId: string) {
  const room = normalizeHodoaiRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_HODOAI_ROOM");
  const created = { ...room, ...hodoaiRuntimeScoring(), revision: 0, gameNumber: 1, phase: "lobby" as const, cards: [], values: {}, clues: {}, clueHistory: [], order: [], history: [], debugLog: [], totalPoints: 0, updatedAt: Date.now() };
  const activeRoom = await loadHodoaiPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "hodoai", conflictError: "HODOAI_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), conflictError: "HODOAI_ROOM_CONFLICT" });
    return created;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
    throw error;
  }
}

export async function applyStoredHodoaiAction(code: string, action: HodoaiRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const removedDebugPlayerIds = new Set<string>();
  if (action.type === "join-room") {
    const activeRoom = await loadHodoaiPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: code, currentRoom: activeRoom, gameId: "hodoai", conflictError: "HODOAI_PLAYER_ALREADY_ACTIVE" });
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("HODOAI_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
      if ((current.players.length + 1) * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      const players = [...current.players, action.player];
      return { ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, action.actorId) };
    }

    const { isHost: actorIsHost, isMember: actorIsMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId);
    if (!actorIsMember) throw new Error("HODOAI_ROOM_FORBIDDEN");
    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!actorIsHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.targetPlayerId), sorterId: current.sorterId === action.targetPlayerId ? current.hostId : current.sorterId };
    }
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.gameNumber), gameStartedAt: null, debugReplayEnabled: false, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost: actorIsHost, isMember: actorIsMember }, current.phase)) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return {
        ...current,
        players: current.players.filter((player) => player.id !== action.actorId),
        sorterId: current.sorterId === action.actorId ? current.hostId : current.sorterId,
      };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      const config = normalizeHodoaiConfig({ ...action.config, debugMode: current.debugMode });
      if (current.players.length * config.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      return { ...current, ...config };
    }
    if (action.type === "set-sorter") {
      if (!canAssignHodoaiSorter(current, action.actorId, action.sorterId)) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, sorterId: action.sorterId };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      const cleanup = action.enabled
        ? null
        : removeOnlineRoomDebugParticipants(current.players, current.lobbyReturn);
      cleanup?.removedPlayerIds.forEach((playerId) => removedDebugPlayerIds.add(playerId));
      return {
        ...current,
        debugMode: action.enabled,
        debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false,
        debugLog: [],
        players: cleanup?.players ?? current.players,
        lobbyReturn: cleanup?.lobbyReturn ?? current.lobbyReturn,
        sorterId: cleanup?.removedPlayerIds.includes(current.sorterId)
          ? current.hostId
          : current.sorterId,
      };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("HODOAI_PLAYERS_NOT_RETURNED");
      if (current.players.length < 2 && !current.debugMode) throw new Error("HODOAI_NOT_ENOUGH_PLAYERS");
      if (current.players.length * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      return beginGame({ ...current, lobbyReturn: undefined, round: 1, history: [], clueHistory: [], totalPoints: 0 });
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
      if ((current.players.length + 1) * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      const dummyName = nextOnlineRoomDebugParticipantName(current.players);
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16", "#14b8a6"];
      const player: HodoaiPlayer = {
        id: `dummy-${randomUUID()}`,
        name: dummyName,
        joinedAt: Date.now(),
        avatarColor: colors[current.players.filter(isOnlineRoomDebugPlayer).length % colors.length],
        isDummy: true,
      };
      const players = [...current.players, player];
      return {
        ...current,
        players,
        lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, player.id),
      };
    }
    if (action.type === "debug-remove-player") {
      if (!canRemoveOnlineRoomDebugPlayer({
        actorId: action.actorId,
        debugMode: current.debugMode,
        hostId: current.hostId,
        phase: current.phase,
        players: current.players,
        targetPlayerId: action.targetPlayerId,
      })) throw new Error("HODOAI_ROOM_FORBIDDEN");
      const cleanup = removeOnlineRoomDebugParticipants(
        current.players,
        current.lobbyReturn,
        action.targetPlayerId,
      );
      cleanup.removedPlayerIds.forEach((playerId) => removedDebugPlayerIds.add(playerId));
      return {
        ...current,
        players: cleanup.players,
        lobbyReturn: cleanup.lobbyReturn,
        sorterId: cleanup.removedPlayerIds.includes(current.sorterId)
          ? current.hostId
          : current.sorterId,
      };
    }
    if (action.type === "submit-clue") {
      const card = current.cards.find((item) => item.id === action.cardId);
      if (current.phase !== "clue" || action.round !== current.round || card?.ownerId !== action.actorId || current.clues[action.cardId]) return current;
      const text = normalizeHodoaiClue(action.text);
      if (!isValidHodoaiClue(text)) throw new Error("HODOAI_INVALID_CLUE");
      return reconcileProgress(recordPlayerActivity({ ...current, clues: { ...current.clues, [action.cardId]: text } }, action.actorId));
    }
    if (action.type === "submit-clues") {
      if (current.phase !== "clue" || action.round !== current.round) return current;
      const missingCards = current.cards.filter((card) => card.ownerId === action.actorId && !current.clues[card.id]);
      const submittedIds = Object.keys(action.clues).sort();
      const expectedIds = missingCards.map((card) => card.id).sort();
      if (submittedIds.length !== expectedIds.length || expectedIds.some((id, index) => id !== submittedIds[index])) {
        throw new Error("HODOAI_INVALID_CLUE");
      }
      const clues = { ...current.clues };
      for (const card of missingCards) {
        const text = normalizeHodoaiClue(action.clues[card.id] ?? "");
        if (!isValidHodoaiClue(text)) throw new Error("HODOAI_INVALID_CLUE");
        clues[card.id] = text;
      }
      return reconcileProgress(recordPlayerActivity({ ...current, clues }, action.actorId));
    }
    if (action.type === "submit-timeout-clues") {
      if (current.phase !== "clue" || action.round !== current.round) return current;
      const missingCards = current.cards.filter((card) => card.ownerId === action.actorId && !current.clues[card.id]);
      const clues = { ...current.clues };
      for (const card of missingCards) {
        const text = normalizeHodoaiClue(action.clues[card.id] ?? "");
        if (isValidHodoaiClue(text)) clues[card.id] = text;
      }
      const stillMissing = missingCards.some((card) => !clues[card.id]);
      const next = { ...current, clues };
      return reconcileProgress(stillMissing ? next : recordPlayerActivity(next, action.actorId));
    }
    if (action.type === "reorder") {
      if (!canReorderHodoaiCards(current, action.actorId) || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      const expected = [...current.cards.map((card) => card.id)].sort();
      const proposed = [...new Set(action.order)].sort();
      if (expected.length !== proposed.length || expected.some((id, index) => id !== proposed[index])) return current;
      return recordPlayerActivity({ ...current, order: action.order }, action.actorId);
    }
    if (action.type === "score-round") {
      if (action.actorId !== current.sorterId || current.phase !== "arrange" || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return scoreRound(current);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.gameNumber), gameStartedAt: null, debugReplayEnabled: false, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null };
    }
    if (!actorIsHost || !current.debugMode || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-clues" && current.phase === "clue") {
      const labels = ["ほとんど当てはまらない", "ほんの少し", "やや控えめ", "ほどほど", "なかなか", "かなり", "とても", "最高クラス"];
      const clues = { ...current.clues };
      for (const card of current.cards) clues[card.id] ||= labels[Math.min(7, Math.floor((current.values[card.id] ?? 0) / 16))];
      return completeClueRound({ ...current, clues });
    }
    if (action.type === "debug-sort" && current.phase === "arrange") {
      return { ...current, order: [...current.cards].sort((left, right) => current.values[left.id] - current.values[right.id]).map((card) => card.id) };
    }
    return current;
  }, { actorId: action.actorId, action: hodoaiDebugActionLabels[action.type] }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), code);
    throw error;
  });
  // Active-room TTLs are refreshed atomically with the room CAS write.
  await schedulePostResponseWork("hodoai-result-persistence", () => Promise.all([recordHodoaiGameResults(room), recordHodoaiReplay(room)]));
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  if (action.type === "remove-waiting-player") await clearActiveRoom(action.targetPlayerId, room.code);
  if (removedDebugPlayerIds.size > 0) {
    await Promise.all(
      [...removedDebugPlayerIds].map((playerId) => clearActiveRoom(playerId, room.code)),
    );
  }
  return room;
}

export async function listJoinableHodoaiRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredHodoaiRoom, loadRoom: loadStoredHodoaiRoom });
  const rooms = page.rooms
    .filter((room): room is HodoaiRoom => Boolean(
      room
      && !isMultiplayerRoomExpired(room.updatedAt)
      && room.phase === "lobby"
      && room.players.length < hodoaiTechnicalPlayerLimit
      && (room.players.length + 1) * room.cardsPerPlayer <= 121
    ))
    .map(hodoaiRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredHodoaiRoom(code: string, actorId: string) {
  await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions);
}

export async function deleteHostedHodoaiRooms(_ownerId: string, authenticatedHostId: string) {
  return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions);
}

const dissolutionOptions = {
  gameId: "hodoai" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "HODOAI_ROOM_FORBIDDEN", inProgress: "HODOAI_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredHodoaiRoom,
};
