import { randomUUID } from "node:crypto";
import { applyNorthernAction, createNorthernGame, northernRules } from "@/lib/northern-branch-game";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { redisCommand } from "@/lib/redis-store";
import { recordNorthernBranchGameResults } from "@/lib/player-stats-store";
import { recordNorthernBranchReplay } from "@/lib/game-replay-store";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimPlayerActiveRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadOnlineRoomValues, scanOnlineRoomCodes } from "@/lib/online-room-list";
import type {
  NorthernGameState,
  NorthernGameAction,
  NorthernRoom,
  NorthernRoomAction,
  NorthernRoomChoice,
  NorthernRoomPhase,
  NorthernRoomPlayer,
} from "@/lib/northern-branch-types";

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

function isPhase(value: unknown): value is NorthernRoomPhase {
  return value === "lobby" || value === "playing" || value === "finished";
}

function normalizePlayers(value: unknown): NorthernRoomPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((player): player is NorthernRoomPlayer => Boolean(player?.id && player?.name))
    .slice(0, maximumPlayers)
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 20),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
    }));
}

function normalizeGame(value: unknown, playerIds: Set<string>): NorthernGameState | null {
  if (!value || typeof value !== "object") return null;
  const game = value as NorthernGameState;
  if (!Array.isArray(game.players) || game.players.length < 2) return null;
  if (game.players.some((player) => !playerIds.has(player.id))) return null;
  if (!Array.isArray(game.offers) || !Array.isArray(game.offerDeck) || !Array.isArray(game.discard) || !Array.isArray(game.log)) return null;
  const storedRules = game.rules && typeof game.rules === "object" ? game.rules : northernRules;
  return {
    ...game,
    rules: {
      handLimit: Number.isInteger(storedRules.handLimit) ? Math.max(3, Math.min(12, storedRules.handLimit)) : northernRules.handLimit,
      victoryPoints: Number.isInteger(storedRules.victoryPoints) ? Math.max(5, Math.min(30, storedRules.victoryPoints)) : northernRules.victoryPoints,
      marketSize: Number.isInteger(storedRules.marketSize) ? Math.max(3, Math.min(10, storedRules.marketSize)) : northernRules.marketSize,
    },
  };
}

function normalizeRoom(value: unknown): NorthernRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<NorthernRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const phase = isPhase(parsed.phase) ? parsed.phase : "lobby";
  const game = phase === "lobby" ? null : normalizeGame(parsed.game, new Set(players.map((player) => player.id)));
  if (phase !== "lobby" && !game) return null;
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase,
    players,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    game,
    notice: typeof parsed.notice === "string" ? parsed.notice.slice(0, 160) : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

async function compareAndSetRoom(expectedRevision: number, room: NorthernRoom) {
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1",
    roomKey(room.code),
    String(expectedRevision),
    JSON.stringify(room),
    String(multiplayerRoomTtlSeconds),
  ]);
}

async function mutateStoredRoom(code: string, mutate: (room: NorthernRoom) => NorthernRoom) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredNorthernRoom(code);
    if (!current) throw new Error("NORTHERN_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const next = normalizeRoom({ ...changed, revision: current.revision + 1, updatedAt: Date.now() });
    if (!next) throw new Error("INVALID_NORTHERN_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordNorthernBranchGameResults(next), recordNorthernBranchReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("NORTHERN_ROOM_NOT_FOUND");
  }
  throw new Error("NORTHERN_ROOM_CONFLICT");
}

function makeChoice(room: NorthernRoom): NorthernRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "不明",
    playerCount: room.players.length,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

async function saveActiveRooms(room: NorthernRoom) {
  await Promise.all(room.players.filter((player) => !player.isDummy).map((player) => (
    redisCommand<"OK">(["SET", playerActiveRoomKey(player.id), room.code, ...multiplayerRoomExpiryArgs()])
  )));
}

async function clearActiveRoom(playerId: string, code: string) {
  const saved = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (saved?.trim().toUpperCase() === code.trim().toUpperCase()) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
  }
}

export function sanitizeNorthernRoom(room: NorthernRoom, playerId: string): NorthernRoom {
  const canSeeAllHands = room.debugMode && playerId === room.hostId;
  const game = room.game ? {
    ...room.game,
    offerDeck: [],
    discard: [],
    players: room.game.players.map((player) => ({
      ...player,
      handCount: player.hand.length,
      hand: player.id === playerId || canSeeAllHands ? player.hand : [],
    })),
  } : null;
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", game };
}

export async function loadStoredNorthernRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
      return null;
    }
    await Promise.all([recordNorthernBranchGameResults(room), recordNorthernBranchReplay(room)]);
    return room;
  } catch {
    return null;
  }
}

function parseStoredNorthernRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadNorthernPlayerActiveRoom(playerId: string) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedId)]);
  if (!code) return null;
  const room = await loadStoredNorthernRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedId)]);
    return null;
  }
  return room;
}

export async function createStoredNorthernRoom(value: unknown, actorId: string) {
  const room = normalizeRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_NORTHERN_ROOM");
  const created: NorthernRoom = {
    ...room,
    revision: 0,
    gameNumber: 1,
    phase: "lobby",
    debugMode: false,
    debugReplayEnabled: false,
    game: null,
    notice: "参加者を待っています。",
    updatedAt: Date.now(),
  };
  const activeRoom = await loadNorthernPlayerActiveRoom(actorId);
  if (activeRoom && activeRoom.code !== created.code) {
    if (!canMoveFromOnlineRoom("northern-branch", activeRoom)) throw new Error("NORTHERN_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(actorId), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
  if (!claim) throw new Error("NORTHERN_PLAYER_ALREADY_ACTIVE");
  try {
    const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
    if (saved !== "OK") throw new Error("NORTHERN_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, created.code]);
    await saveActiveRooms(created);
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
    if (activeRoom && activeRoom.code !== code.trim().toUpperCase()) {
      if (!canMoveFromOnlineRoom("northern-branch", activeRoom)) throw new Error("NORTHERN_PLAYER_ALREADY_ACTIVE");
      await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), activeRoom.code);
    }
    claim = await claimPlayerActiveRoom(playerActiveRoomKey(action.actorId), code.trim().toUpperCase());
    if (!claim) throw new Error("NORTHERN_PLAYER_ALREADY_ACTIVE");
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("NORTHERN_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("NORTHERN_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (current.players.length >= maximumPlayers) throw new Error("NORTHERN_ROOM_FULL");
      return { ...current, players: [...current.players, action.player], notice: `${action.player.name}さんが参加しました。` };
    }

    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId && !player.isDummy);
    if (!actorIsMember) throw new Error("NORTHERN_ROOM_FORBIDDEN");

    if (action.type === "leave-room") {
      if (actorIsHost || current.phase !== "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId), notice: "参加者が退出しました。" };
    }
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
      if (current.players.length < 2) throw new Error("NORTHERN_NOT_ENOUGH_PLAYERS");
      const game = createNorthernGame(current.players.map((player) => ({ id: player.id, name: player.name })));
      return { ...current, phase: "playing", game, notice: "ゲームを開始しました。最初の手番です。" };
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "finished") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", debugReplayEnabled: false, game: null, notice: "同じ部屋で次のゲームを準備できます。" };
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("NORTHERN_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", debugReplayEnabled: false, game: null, notice: "ゲームを中断し、ゲーム開始前へ戻りました。" };
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
      return {
        ...current,
        game: outcome.state,
        phase: outcome.state.status === "finished" ? "finished" : "playing",
        notice: outcome.notice,
      };
    }
    return current;
  }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), code);
    throw error;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

export async function listJoinableNorthernRooms(cursor?: unknown) {
  const page = await scanOnlineRoomCodes(roomIndexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, roomKey);
  const parsedRooms = values.map(parseStoredNorthernRoom);
  const expiredCodes = page.codes.filter((_, index) => parsedRooms[index] && isMultiplayerRoomExpired(parsedRooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !parsedRooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(loadStoredNorthernRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  const rooms = parsedRooms
    .filter((room): room is NorthernRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && room.players.length < maximumPlayers))
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredNorthernRoom(code: string, actorId: string) {
  const room = await loadStoredNorthernRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("NORTHERN_ROOM_FORBIDDEN");
  if (!canDissolveOnlineRoom("northern-branch", room)) throw new Error("NORTHERN_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedNorthernRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredNorthernRoom(code)));
  const targets = rooms.filter((room): room is NorthernRoom => Boolean(room && room.hostId === authenticatedHostId));
  if (targets.some((room) => !canDissolveOnlineRoom("northern-branch", room))) throw new Error("NORTHERN_ROOM_IN_PROGRESS");
  await Promise.all(targets.map((room) => deleteStoredNorthernRoom(room.code, room.hostId)));
  return targets.length;
}

export const northernRoomMaximumPlayers = maximumPlayers;
