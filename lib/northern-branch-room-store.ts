import { randomUUID } from "node:crypto";
import { applyNorthernAction, createNorthernGame } from "@/lib/northern-branch-game";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { redisCommand } from "@/lib/redis-store";
import { recordNorthernBranchGameResults } from "@/lib/player-stats-store";
import { recordNorthernBranchReplay } from "@/lib/game-replay-store";
import { deleteIndexedOnlineRoomStorage, dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import type {
  NorthernGameAction,
  NorthernRoom,
  NorthernRoomAction,
} from "@/lib/northern-branch-types";
import { normalizeNorthernRoom } from "@/lib/northern-branch-room-normalizer";
import { northernRoomChoice, sanitizeNorthernRoom } from "@/lib/northern-branch-room-presentation";
import { expireNorthernRoomTurn, isNorthernTurnExpired } from "@/lib/northern-branch-room-domain";

export { sanitizeNorthernRoom };

const roomKeyPrefix = "northern-branch:room:";
const roomIndexKey = "northern-branch:rooms";
const playerActiveRoomKeyPrefix = "northern-branch:player-active-room:";
const maximumPlayers = onlineRoomPlayerLimits.northernBranch;

function isGameAction(value: unknown): value is NorthernGameAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<NorthernGameAction>;
  if (action.type === "end-turn") return true;
  if (action.type === "take-resource") return typeof action.cardId === "string";
  if (action.type === "produce") return typeof action.offerId === "string";
  if (action.type === "use-building") return typeof action.buildingId === "string";
  return action.type === "buy" && typeof action.offerId === "string" && Array.isArray(action.paymentIndexes)
    && action.paymentIndexes.every((index) => typeof index === "number" && Number.isInteger(index));
}

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}


async function mutateStoredRoom(code: string, mutate: (room: NorthernRoom) => NorthernRoom) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredNorthernRoom, mutate, normalize: normalizeNorthernRoom, activeRoomKeys: (room) => room.players.filter((player) => !player.isDummy).map((player) => playerActiveRoomKey(player.id)), errors: { notFound: "NORTHERN_ROOM_NOT_FOUND", invalid: "INVALID_NORTHERN_ROOM", conflict: "NORTHERN_ROOM_CONFLICT" }, realtimeGame: "northern-branch", afterSave: (room) => Promise.all([recordNorthernBranchGameResults(room), recordNorthernBranchReplay(room)]) });
}

async function clearActiveRoom(playerId: string, code: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code);
}

export async function loadStoredNorthernRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeNorthernRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await deleteIndexedOnlineRoomStorage({ roomCode: room.code, roomKey: roomKey(room.code), roomIndexKey, playerActiveRoomKeys: room.players.map((player) => playerActiveRoomKey(player.id)) });
      return null;
    }
    await schedulePostResponseWork("northern-branch-result-persistence", () => Promise.all([recordNorthernBranchGameResults(room), recordNorthernBranchReplay(room)]));
    return room;
  } catch {
    return null;
  }
}

function parseStoredNorthernRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeNorthernRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadNorthernPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadStoredNorthernRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredNorthernRoom(value: unknown, actorId: string) {
  const room = normalizeNorthernRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_NORTHERN_ROOM");
  const created: NorthernRoom = {
    ...room,
    revision: 0,
    gameNumber: 1,
    phase: "lobby",
    debugMode: false,
    debugReplayEnabled: false,
    turnStartedAt: null,
    game: null,
    notice: "参加者を待っています。",
    updatedAt: Date.now(),
  };
  const activeRoom = await loadNorthernPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "northern-branch", conflictError: "NORTHERN_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, activeRoomKeys: (room) => room.players.filter((player) => !player.isDummy).map((player) => playerActiveRoomKey(player.id)), conflictError: "NORTHERN_ROOM_CONFLICT" });
    return created;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
    throw error;
  }
}

export async function applyStoredNorthernAction(code: string, action: NorthernRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  if (action.type === "join-room") {
    const activeRoom = await loadNorthernPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: code, currentRoom: activeRoom, gameId: "northern-branch", conflictError: "NORTHERN_PLAYER_ALREADY_ACTIVE" });
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("NORTHERN_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("NORTHERN_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
      if (current.players.length >= maximumPlayers) throw new Error("NORTHERN_ROOM_FULL");
      const players = [...current.players, action.player];
      return { ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, action.actorId), notice: `${action.player.name}さんが参加しました。` };
    }

    const { isHost: actorIsHost, isMember: actorIsMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId, { excludeDummy: true });
    if (!actorIsMember) throw new Error("NORTHERN_ROOM_FORBIDDEN");

    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!actorIsHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.targetPlayerId), notice: "復帰待ちの参加者を退出扱いにしました。" };
    }

    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost: actorIsHost, isMember: actorIsMember }, current.phase)) throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId), notice: "参加者が退出しました。" };
    }
    if (action.type === "expire-turn") {
      if (current.turnStartedAt !== action.turnStartedAt || !isNorthernTurnExpired(current)) throw new Error("NORTHERN_ROOM_CONFLICT");
      return expireNorthernRoomTurn(current);
    }
    if (isNorthernTurnExpired(current)) return expireNorthernRoomTurn(current);
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return {
        ...current,
        debugMode: action.enabled,
        debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false,
        players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy),
      };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, turnTimeLimitSeconds: normalizeCommonTimeLimit(action.turnTimeLimitSeconds) };
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      if (current.players.length >= maximumPlayers) throw new Error("NORTHERN_ROOM_FULL");
      const dummyNumber = current.players.filter((player) => player.isDummy).length + 1;
      const colors = ["#38bdf8", "#a78bfa", "#f472b6"];
      return {
        ...current,
        players: [...current.players, {
          id: `dummy-${randomUUID()}`,
          name: `ダミー${dummyNumber}`,
          joinedAt: Date.now(),
          avatarColor: colors[(dummyNumber - 1) % colors.length],
          isDummy: true,
        }],
      };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("NORTHERN_PLAYERS_NOT_RETURNED");
      if (current.players.length < 2) throw new Error("NORTHERN_NOT_ENOUGH_PLAYERS");
      const game = createNorthernGame(current.players.map((player) => ({ id: player.id, name: player.name })));
      const now = Date.now();
      return { ...current, phase: "playing", lobbyReturn: undefined, gameStartedAt: now, game, turnStartedAt: now, notice: "ゲームを開始しました。最初の手番です。" };
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "finished") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.gameNumber), gameStartedAt: null, debugReplayEnabled: false, game: null, turnStartedAt: null, notice: "同じ部屋で次のゲームを準備できます。" };
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.gameNumber), gameStartedAt: null, debugReplayEnabled: false, game: null, turnStartedAt: null, notice: "ゲームを中断し、ゲーム開始前へ戻りました。" };
    }
    if (action.type === "game-action") {
      if (!current.game || current.phase !== "playing") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      if (!isGameAction(action.action)) throw new Error("NORTHERN_ACTION_INVALID:操作内容が不正です。");
      const activePlayer = current.game.players[current.game.activePlayerIndex];
      if (!activePlayer) throw new Error("INVALID_NORTHERN_ROOM");
      const debugHostControl = current.debugMode && actorIsHost;
      if (action.actorId !== activePlayer.id && !debugHostControl) throw new Error("NORTHERN_NOT_YOUR_TURN");
      const outcome = applyNorthernAction(current.game, action.action);
      if (!outcome.ok) throw new Error(`NORTHERN_ACTION_INVALID:${outcome.notice}`);
      const turnChanged = outcome.state.activePlayerIndex !== current.game.activePlayerIndex || outcome.state.turn !== current.game.turn;
      return {
        ...current,
        game: outcome.state,
        phase: outcome.state.status === "finished" ? "finished" : "playing",
        turnStartedAt: outcome.state.status === "finished" ? null : turnChanged ? Date.now() : current.turnStartedAt,
        notice: outcome.notice,
      };
    }
    return current;
  }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), code);
    throw error;
  });
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  if (action.type === "remove-waiting-player") await clearActiveRoom(action.targetPlayerId, room.code);
  return room;
}

export async function listJoinableNorthernRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredNorthernRoom, loadRoom: loadStoredNorthernRoom });
  const rooms = page.rooms
    .filter((room): room is NorthernRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && room.players.length < maximumPlayers))
    .map(northernRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredNorthernRoom(code: string, actorId: string) {
  await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions);
}

export async function deleteHostedNorthernRooms(_ownerId: string, authenticatedHostId: string) {
  return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions);
}

const dissolutionOptions = {
  gameId: "northern-branch" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "NORTHERN_ROOM_FORBIDDEN", inProgress: "NORTHERN_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredNorthernRoom,
};

export const northernRoomMaximumPlayers = maximumPlayers;
