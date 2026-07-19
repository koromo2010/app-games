import { randomUUID } from "node:crypto";
import {
  isValidKotobaSenpukuWord,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  minimumKotobaSenpukuWordLength,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoomAction,
} from "@/lib/kotoba-senpuku";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { recordKotobaSenpukuGameResults } from "@/lib/player-stats-store";
import { recordKotobaSenpukuReplay } from "@/lib/game-replay-store";
import { redisCommand } from "@/lib/redis-store";
import { recordPlayerActivity, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import { dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, saveOnlineRoomPlayerIndexes, type ActiveRoomClaim } from "@/lib/player-active-room";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { addLog, beginBattle, beginRound, fillMissingSecrets, finishRound, performChallenge, performScan, reconcileProgress } from "@/lib/kotoba-senpuku-room-domain";
import { normalizeKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-normalizer";
import { kotobaSenpukuRoomChoice, sanitizeKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-presentation";

export { sanitizeKotobaSenpukuRoom };

const roomKeyPrefix = "kotoba-senpuku:room:";
const roomIndexKey = "kotoba-senpuku:rooms";
const playerActiveRoomKeyPrefix = "kotoba-senpuku:player-active-room:";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}


async function mutateStoredRoom(code: string, mutate: (room: KotobaSenpukuRoom) => KotobaSenpukuRoom) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredKotobaSenpukuRoom, mutate, normalize: normalizeKotobaSenpukuRoom, errors: { notFound: "KOTOBA_SENPUKU_ROOM_NOT_FOUND", invalid: "INVALID_KOTOBA_SENPUKU_ROOM", conflict: "KOTOBA_SENPUKU_ROOM_CONFLICT" }, realtimeGame: "kotoba-senpuku", afterSave: (room) => Promise.all([recordKotobaSenpukuGameResults(room), recordKotobaSenpukuReplay(room)]) });
}

async function saveActiveRooms(room: KotobaSenpukuRoom) {
  await saveOnlineRoomPlayerIndexes(room.code, room.players.filter((player) => !player.isDummy).map((player) => player.id), playerActiveRoomKey);
}

async function clearActiveRoom(playerId: string, code: string) {
  const saved = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (saved?.trim().toUpperCase() === code.trim().toUpperCase()) await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
}

export async function loadStoredKotobaSenpukuRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeKotobaSenpukuRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
      return null;
    }
    return room;
  } catch {
    return null;
  }
}

function parseStoredKotobaSenpukuRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeKotobaSenpukuRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadAndReconcileKotobaSenpukuRoom(code: string) {
  const room = await loadStoredKotobaSenpukuRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await schedulePostResponseWork("kotoba-senpuku-result-persistence", () => Promise.all([recordKotobaSenpukuGameResults(room), recordKotobaSenpukuReplay(room)]));
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress);
}

export async function loadKotobaSenpukuPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadAndReconcileKotobaSenpukuRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredKotobaSenpukuRoom(value: unknown, actorId: string) {
  const room = normalizeKotobaSenpukuRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_KOTOBA_SENPUKU_ROOM");
  const created = { ...room, revision: 0, gameNumber: 1, phase: "lobby" as const, debugMode: false, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], history: [], log: ["参加者を待っています。"], phaseStartedAt: null, updatedAt: Date.now() };
  const activeRoom = await loadKotobaSenpukuPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "kotoba-senpuku", conflictError: "KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, conflictError: "KOTOBA_SENPUKU_ROOM_CONFLICT" });
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
    throw error;
  }
}

export async function applyStoredKotobaSenpukuAction(code: string, action: KotobaSenpukuRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  if (action.type === "join-room") {
    const activeRoom = await loadKotobaSenpukuPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: code, currentRoom: activeRoom, gameId: "kotoba-senpuku", conflictError: "KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE" });
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("KOTOBA_SENPUKU_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (current.players.length >= onlineRoomPlayerLimits.kotobaSenpuku) throw new Error("KOTOBA_SENPUKU_ROOM_FULL");
      return addLog({ ...current, players: [...current.players, action.player] }, `${action.player.name}さんが参加しました。`);
    }

    const { isHost: actorIsHost, isMember: actorIsMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId, { excludeDummy: true });
    if (!actorIsMember) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["ゲームを中断し、ゲーム開始前へ戻りました。"], phaseStartedAt: null };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost: actorIsHost, isMember: actorIsMember }, current.phase)) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, ...normalizeKotobaSenpukuConfig({ ...action.config, debugMode: current.debugMode }) };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, debugMode: action.enabled, debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false, players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy) };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.players.length >= onlineRoomPlayerLimits.kotobaSenpuku) throw new Error("KOTOBA_SENPUKU_ROOM_FULL");
      const dummyNumber = current.players.filter((player) => player.isDummy).length + 1;
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16", "#14b8a6", "#fb7185"];
      return { ...current, players: [...current.players, { id: `dummy-${randomUUID()}`, name: `ダミー${dummyNumber}`, joinedAt: Date.now(), avatarColor: colors[(dummyNumber - 1) % colors.length], isDummy: true }] };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.players.length < 2) throw new Error("KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS");
      return beginRound({ ...current, round: 1, history: [], totalScores: Object.fromEntries(current.players.map((player) => [player.id, 0])) }, 1);
    }
    if (action.type === "submit-secret") {
      if (current.phase !== "secret" || action.round !== current.round || current.secrets[action.actorId]) return current;
      const word = normalizeKotobaSenpukuWord(action.word);
      if (!isValidKotobaSenpukuWord(word)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      if ([...word].length < minimumKotobaSenpukuWordLength(current.players.length)) throw new Error("KOTOBA_SENPUKU_WORD_TOO_SHORT");
      return reconcileProgress(recordPlayerActivity({ ...current, secrets: { ...current.secrets, [action.actorId]: word }, submittedIds: [...new Set([...current.submittedIds, action.actorId])] }, action.actorId));
    }
    if (action.type === "debug-fill-secrets") {
      if (!actorIsHost || !current.debugMode || current.phase !== "secret" || action.round !== current.round) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginBattle(fillMissingSecrets(current));
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result" || action.round !== current.round || current.round >= current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginRound(current, current.round + 1);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result" || current.round < current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["同じ部屋で次のゲームを準備できます。"], phaseStartedAt: null };
    }

    const activePlayer = current.players[current.activePlayerIndex];
    const canControlTurn = activePlayer?.id === action.actorId || (current.debugMode && actorIsHost);
    if (current.phase !== "battle" || action.round !== current.round || !canControlTurn) throw new Error("KOTOBA_SENPUKU_NOT_YOUR_TURN");
    if (action.type === "scan-kana") {
      if (!kotobaSenpukuKana.includes(action.kana as (typeof kotobaSenpukuKana)[number]) || current.calledKana.includes(action.kana)) throw new Error("KOTOBA_SENPUKU_INVALID_KANA");
      return performScan(recordPlayerActivity(current, activePlayer.id), action.kana);
    }
    if (action.type === "challenge-word") {
      if (!current.allowWordGuess) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (!isValidKotobaSenpukuWord(action.guess)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      const target = current.players.find((player) => player.id === action.targetId);
      if (!target || target.id === activePlayer.id || current.exposedIds.includes(target.id)) throw new Error("KOTOBA_SENPUKU_INVALID_TARGET");
      return performChallenge(recordPlayerActivity(current, activePlayer.id), target.id, action.guess);
    }
    if (action.type === "debug-auto-turn") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      const candidate = current.players
        .filter((player) => player.id !== activePlayer.id && !current.exposedIds.includes(player.id))
        .flatMap((player) => [...(current.secrets[player.id] ?? "")].map(kotobaSenpukuKanaKey))
        .find((kana) => kotobaSenpukuKana.includes(kana as (typeof kotobaSenpukuKana)[number]) && !current.calledKana.includes(kana));
      const kana = candidate ?? kotobaSenpukuKana.find((item) => !current.calledKana.includes(item));
      return kana ? performScan(current, kana) : finishRound(current);
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

export async function listJoinableKotobaSenpukuRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredKotobaSenpukuRoom, loadRoom: loadStoredKotobaSenpukuRoom });
  const rooms = page.rooms
    .filter((room): room is KotobaSenpukuRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && room.players.length < onlineRoomPlayerLimits.kotobaSenpuku))
    .map(kotobaSenpukuRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredKotobaSenpukuRoom(code: string, actorId: string) {
  await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions);
}

export async function deleteHostedKotobaSenpukuRooms(_ownerId: string, authenticatedHostId: string) {
  return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions);
}

const dissolutionOptions = {
  gameId: "kotoba-senpuku" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "KOTOBA_SENPUKU_ROOM_FORBIDDEN", inProgress: "KOTOBA_SENPUKU_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredKotobaSenpukuRoom,
};
