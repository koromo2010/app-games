import { randomUUID } from "node:crypto";
import {
  areValidCodeInterceptClues,
  clueGiverForRound,
  codeInterceptDefaults,
  codeInterceptMinimumPlayers,
  codeInterceptPlayerLimit,
  codeInterceptRoomHasSpace,
  codeInterceptTeamIds,
  codeInterceptTeamsAreStartable,
  finishCodeInterceptRound,
  isCodeInterceptTeamId,
  isValidCodeInterceptAnswer,
  nextBalancedTeam,
  normalizeCodeInterceptPlayerCapacity,
  otherCodeInterceptTeam,
  sanitizeCodeInterceptRoomForPlayer,
  shuffledCode,
  teamPlayers,
  type CodeInterceptPhase,
  type CodeInterceptPlayer,
  type CodeInterceptRoom,
  type CodeInterceptRoomAction,
  type CodeInterceptRoomChoice,
  type CodeInterceptRoundLog,
  type CodeInterceptTeam,
  type CodeInterceptTeamId,
} from "@/lib/code-intercept";
import { appendGameDebugLog, normalizeGameDebugLog } from "@/lib/game-debug-log";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { recordCodeInterceptReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { loadOnlineRoomValues, scanOnlineRoomCodes } from "@/lib/online-room-list";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { claimPlayerActiveRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { recordCodeInterceptGameResults } from "@/lib/player-stats-store";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { redisCommand } from "@/lib/redis-store";
import { listLocalWordWolfWords } from "@/lib/wordwolf";

const roomKeyPrefix = "code-intercept:room:";
const roomIndexKey = "code-intercept:rooms";
const playerActiveRoomKeyPrefix = "code-intercept:player-active-room:";

const debugActionLabels: Record<CodeInterceptRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "set-team": "所属チームを変更",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "set-config": "ゲーム設定を変更",
  "start-game": "ゲームを開始",
  "submit-clues": "暗号ヒントを提出",
  "submit-ally-answer": "味方暗号を回答",
  "submit-intercept-answer": "敵暗号の傍受回答を提出",
  "next-round": "次ラウンドへ進行",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-fill-clues": "未提出ヒントを自動入力",
  "debug-fill-answers": "未提出回答を自動入力",
};

function roomKey(code: string) { return `${roomKeyPrefix}${code.trim().toUpperCase()}`; }
function playerActiveRoomKey(playerId: string) { return `${playerActiveRoomKeyPrefix}${playerId}`; }

function isPhase(value: unknown): value is CodeInterceptPhase {
  return value === "lobby" || value === "clue" || value === "answer" || value === "round-result" || value === "game-result";
}

function normalizePlayers(value: unknown): CodeInterceptPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const player = item as Partial<CodeInterceptPlayer>;
    const id = typeof player.id === "string" ? player.id.trim().slice(0, 120) : "";
    const name = typeof player.name === "string" ? player.name.trim().slice(0, 20) : "";
    if (!id || !name) return [];
    return [{
      id,
      name,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      teamId: isCodeInterceptTeamId(player.teamId) ? player.teamId : "red",
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
      shareNameAllowed: player.shareNameAllowed === true,
    }];
  }).slice(0, codeInterceptPlayerLimit);
}

function normalizeTeams(value: unknown): CodeInterceptTeam[] {
  const source = Array.isArray(value) ? value as Partial<CodeInterceptTeam>[] : [];
  return codeInterceptTeamIds.map((id) => {
    const stored = source.find((team) => team?.id === id);
    return {
      id,
      name: id === "red" ? "赤チーム" : "青チーム",
      points: typeof stored?.points === "number" && Number.isInteger(stored.points) ? Math.max(0, stored.points) : codeInterceptDefaults.initialPoints,
      secretWords: Array.isArray(stored?.secretWords)
        ? stored.secretWords.filter((word): word is string => typeof word === "string").map((word) => word.trim().slice(0, 80)).filter(Boolean).slice(0, codeInterceptDefaults.cardCount)
        : [],
    };
  });
}

function normalizeNumberArrayRecord(value: unknown, cardCount: number, codeLength: number) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const answer = source[teamId];
    return isValidCodeInterceptAnswer(answer, cardCount, codeLength) ? [[teamId, [...answer]]] : [];
  })) as Partial<Record<CodeInterceptTeamId, number[]>>;
}

function normalizeClueRecord(value: unknown, codeLength: number) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const clues = source[teamId];
    return areValidCodeInterceptClues(clues, codeLength)
      ? [[teamId, clues.map((clue) => clue.trim().slice(0, 40))]]
      : [];
  })) as Partial<Record<CodeInterceptTeamId, string[]>>;
}

function normalizeStringRecord(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => typeof source[teamId] === "string" && source[teamId]
    ? [[teamId, (source[teamId] as string).slice(0, 120)]]
    : [])) as Partial<Record<CodeInterceptTeamId, string>>;
}

function normalizeRoundHistory(value: unknown): CodeInterceptRoundLog[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CodeInterceptRoundLog => Boolean(
    item && typeof item === "object" && Number.isInteger((item as CodeInterceptRoundLog).roundNumber) && Array.isArray((item as CodeInterceptRoundLog).teams),
  )).slice(-100);
}

function normalizeRoom(value: unknown): CodeInterceptRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<CodeInterceptRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const players = normalizePlayers(parsed.players);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const cardCount = codeInterceptDefaults.cardCount;
  const codeLength = codeInterceptDefaults.codeLength;
  const winner = parsed.winner === "red" || parsed.winner === "blue" || parsed.winner === "draw" ? parsed.winner : null;
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId.slice(0, 120) : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    players,
    playerCapacity: normalizeCodeInterceptPlayerCapacity(parsed.playerCapacity, players.length),
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    roundNumber: typeof parsed.roundNumber === "number" ? Math.max(1, Math.floor(parsed.roundNumber)) : 1,
    cardCount,
    codeLength,
    initialPoints: codeInterceptDefaults.initialPoints,
    miscommunicationDamage: codeInterceptDefaults.miscommunicationDamage,
    interceptionDamage: codeInterceptDefaults.interceptionDamage,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    teams: normalizeTeams(parsed.teams),
    clueGiverIds: normalizeStringRecord(parsed.clueGiverIds),
    secretCodes: normalizeNumberArrayRecord(parsed.secretCodes, cardCount, codeLength),
    clues: normalizeClueRecord(parsed.clues, codeLength),
    allyAnswers: normalizeNumberArrayRecord(parsed.allyAnswers, cardCount, codeLength),
    interceptAnswers: normalizeNumberArrayRecord(parsed.interceptAnswers, cardCount, codeLength),
    roundHistory: normalizeRoundHistory(parsed.roundHistory),
    winner,
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function dealSecretWords() {
  const pool = [...new Set(listLocalWordWolfWords().map((word) => word.trim()).filter(Boolean))];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  const needed = codeInterceptDefaults.cardCount * 2;
  if (pool.length < needed) throw new Error("CODE_INTERCEPT_WORDS_UNAVAILABLE");
  return { red: pool.slice(0, codeInterceptDefaults.cardCount), blue: pool.slice(codeInterceptDefaults.cardCount, needed) };
}

function beginRound(room: CodeInterceptRoom, roundNumber: number) {
  const now = Date.now();
  return {
    ...room,
    phase: "clue" as const,
    roundNumber,
    clueGiverIds: Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, clueGiverForRound(room.players, teamId, roundNumber)])),
    secretCodes: Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, shuffledCode(room.cardCount, room.codeLength)])),
    clues: {},
    allyAnswers: {},
    interceptAnswers: {},
    winner: null,
    phaseStartedAt: now,
  };
}

function beginGame(room: CodeInterceptRoom) {
  const words = dealSecretWords();
  const teams = codeInterceptTeamIds.map((id) => ({ id, name: id === "red" ? "赤チーム" : "青チーム", points: room.initialPoints, secretWords: words[id] }));
  return beginRound({ ...room, teams, roundHistory: [], winner: null }, 1);
}

function resetGame(room: CodeInterceptRoom) {
  return {
    ...room,
    gameNumber: room.gameNumber + 1,
    phase: "lobby" as const,
    roundNumber: 1,
    phaseStartedAt: null,
    debugReplayEnabled: false,
    teams: codeInterceptTeamIds.map((id) => ({ id, name: id === "red" ? "赤チーム" : "青チーム", points: room.initialPoints, secretWords: [] })),
    clueGiverIds: {},
    secretCodes: {},
    clues: {},
    allyAnswers: {},
    interceptAnswers: {},
    roundHistory: [],
    winner: null,
  };
}

function allCluesSubmitted(room: CodeInterceptRoom) {
  return codeInterceptTeamIds.every((teamId) => Boolean(room.clues[teamId]));
}

function allAnswersSubmitted(room: CodeInterceptRoom) {
  const alliesReady = codeInterceptTeamIds.every((teamId) => Boolean(room.allyAnswers[teamId]));
  const interceptionReady = room.roundNumber < codeInterceptDefaults.interceptionStartsAtRound
    || codeInterceptTeamIds.every((teamId) => Boolean(room.interceptAnswers[teamId]));
  return alliesReady && interceptionReady;
}

function targetPlayer(room: CodeInterceptRoom, actorId: string, playerId?: string) {
  const targetId = playerId || actorId;
  const target = room.players.find((player) => player.id === targetId);
  const actorIsHost = actorId === room.hostId;
  if (!target || (targetId !== actorId && !(actorIsHost && room.debugMode && target.isDummy))) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
  return target;
}

async function compareAndSetRoom(expectedRevision: number, room: CodeInterceptRoom) {
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1", roomKey(room.code), String(expectedRevision), JSON.stringify(room), String(multiplayerRoomTtlSeconds),
  ]);
}

async function mutateStoredRoom(code: string, mutate: (room: CodeInterceptRoom) => CodeInterceptRoom, actorId: string, action: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredCodeInterceptRoom(code);
    if (!current) throw new Error("CODE_INTERCEPT_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const revision = current.revision + 1;
    const timestamp = Date.now();
    const actorName = changed.players.find((player) => player.id === actorId)?.name ?? "システム";
    const withLog = changed.debugMode
      ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
      : changed;
    const next = normalizeRoom({ ...withLog, revision, updatedAt: timestamp });
    if (!next) throw new Error("INVALID_CODE_INTERCEPT_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordCodeInterceptGameResults(next), recordCodeInterceptReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("CODE_INTERCEPT_ROOM_NOT_FOUND");
  }
  throw new Error("CODE_INTERCEPT_ROOM_CONFLICT");
}

async function saveActiveRooms(room: CodeInterceptRoom) {
  await Promise.all(room.players.filter((player) => !player.isDummy).map((player) => redisCommand<"OK">([
    "SET", playerActiveRoomKey(player.id), room.code, ...multiplayerRoomExpiryArgs(),
  ])));
}

async function clearActiveRoom(playerId: string, code: string) { await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code); }

export function sanitizeCodeInterceptRoom(room: CodeInterceptRoom, playerId: string) {
  return sanitizeCodeInterceptRoomForPlayer(room, playerId);
}

export async function loadStoredCodeInterceptRoom(code: string) {
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
    return room;
  } catch { return null; }
}

export async function loadCodeInterceptPlayerActiveRoom(playerId: string) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedId)]);
  if (!code) return null;
  const room = await loadStoredCodeInterceptRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedId)]);
    return null;
  }
  return room;
}

export async function createStoredCodeInterceptRoom(value: unknown, actorId: string) {
  const room = normalizeRoom(value);
  if (!room || room.hostId !== actorId) throw new Error("INVALID_CODE_INTERCEPT_ROOM");
  const created = resetGame({ ...room, revision: 0, gameNumber: 0, debugMode: false, debugLog: [], createdAt: Date.now(), updatedAt: Date.now() });
  const activeRoom = await loadCodeInterceptPlayerActiveRoom(actorId);
  if (activeRoom && activeRoom.code !== created.code) {
    if (!canMoveFromOnlineRoom("code-intercept", activeRoom)) throw new Error("CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE");
    await clearActiveRoom(actorId, activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
  if (!claim) throw new Error("CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE");
  try {
    const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
    if (saved !== "OK") throw new Error("CODE_INTERCEPT_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, created.code]);
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await clearActiveRoom(actorId, created.code);
    throw error;
  }
}

export async function applyStoredCodeInterceptAction(code: string, action: CodeInterceptRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    const activeRoom = await loadCodeInterceptPlayerActiveRoom(action.actorId);
    if (activeRoom && activeRoom.code !== normalizedCode) {
      if (!canMoveFromOnlineRoom("code-intercept", activeRoom)) throw new Error("CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE");
      await clearActiveRoom(action.actorId, activeRoom.code);
    }
    claim = await claimPlayerActiveRoom(playerActiveRoomKey(action.actorId), normalizedCode);
    if (!claim) throw new Error("CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE");
  }
  const room = await mutateStoredRoom(normalizedCode, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("CODE_INTERCEPT_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (!codeInterceptRoomHasSpace(current)) throw new Error("CODE_INTERCEPT_ROOM_FULL");
      return { ...current, players: [...current.players, { ...action.player, teamId: nextBalancedTeam(current.players) }] };
    }
    const isHost = current.hostId === action.actorId;
    const isMember = current.players.some((player) => player.id === action.actorId);
    if (!isMember) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
    if (action.type === "leave-room") {
      if (isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "set-team") {
      if (current.phase !== "lobby" || !isCodeInterceptTeamId(action.teamId)) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, players: current.players.map((player) => player.id === action.actorId ? { ...player, teamId: action.teamId } : player) };
    }
    if (action.type === "set-debug") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, debugMode: action.enabled, debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false, debugLog: [], players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy) };
    }
    if (action.type === "set-debug-replay") {
      if (!isHost || !current.debugMode) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, actionTimeLimitSeconds: normalizeCommonTimeLimit(action.actionTimeLimitSeconds) };
    }
    if (action.type === "debug-add-player") {
      if (!isHost || !current.debugMode || current.phase !== "lobby" || !codeInterceptRoomHasSpace(current)) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      const number = current.players.filter((player) => player.isDummy).length + 1;
      return { ...current, players: [...current.players, { id: `dummy-${randomUUID()}`, name: `ダミー${number}`, joinedAt: Date.now(), teamId: nextBalancedTeam(current.players), avatarColor: number % 2 ? "#f87171" : "#60a5fa", isDummy: true }] };
    }
    if (action.type === "start-game") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if ((!current.debugMode && current.players.length < codeInterceptMinimumPlayers) || !codeInterceptTeamsAreStartable(current)) throw new Error("CODE_INTERCEPT_NOT_ENOUGH_PLAYERS");
      return beginGame(current);
    }
    if (action.type === "abort-game") {
      if (!isHost || !current.debugMode || current.phase === "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return resetGame({ ...current, gameNumber: current.gameNumber - 1 });
    }
    if (action.type === "reset-game") {
      if (!isHost || current.phase !== "game-result") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return resetGame(current);
    }
    if (action.type === "next-round") {
      if (!isHost || current.phase !== "round-result") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return beginRound(current, current.roundNumber + 1);
    }
    if (action.type === "submit-clues") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "clue" || current.clueGiverIds[player.teamId] !== player.id || current.clues[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!areValidCodeInterceptClues(action.clues, current.codeLength)) throw new Error("CODE_INTERCEPT_INVALID_CLUE");
      const next = { ...current, clues: { ...current.clues, [player.teamId]: action.clues.map((clue) => clue.trim()) } };
      return allCluesSubmitted(next) ? { ...next, phase: "answer" as const, phaseStartedAt: Date.now() } : next;
    }
    if (action.type === "submit-ally-answer") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "answer" || current.clueGiverIds[player.teamId] === player.id || current.allyAnswers[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!isValidCodeInterceptAnswer(action.answer, current.cardCount, current.codeLength)) throw new Error("CODE_INTERCEPT_INVALID_ANSWER");
      const next = { ...current, allyAnswers: { ...current.allyAnswers, [player.teamId]: [...action.answer] } };
      return allAnswersSubmitted(next) ? finishCodeInterceptRound(next) : next;
    }
    if (action.type === "submit-intercept-answer") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "answer" || current.roundNumber < codeInterceptDefaults.interceptionStartsAtRound || current.interceptAnswers[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!isValidCodeInterceptAnswer(action.answer, current.cardCount, current.codeLength)) throw new Error("CODE_INTERCEPT_INVALID_ANSWER");
      const next = { ...current, interceptAnswers: { ...current.interceptAnswers, [player.teamId]: [...action.answer] } };
      return allAnswersSubmitted(next) ? finishCodeInterceptRound(next) : next;
    }
    if (!isHost || !current.debugMode) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-clues" && current.phase === "clue") {
      const clues = { ...current.clues };
      codeInterceptTeamIds.forEach((teamId) => { clues[teamId] ??= Array.from({ length: current.codeLength }, (_, index) => `テスト${teamId === "red" ? "赤" : "青"}${index + 1}`); });
      return { ...current, clues, phase: "answer", phaseStartedAt: Date.now() };
    }
    if (action.type === "debug-fill-answers" && current.phase === "answer") {
      const allyAnswers = { ...current.allyAnswers };
      const interceptAnswers = { ...current.interceptAnswers };
      codeInterceptTeamIds.forEach((teamId) => {
        allyAnswers[teamId] ??= [...(current.secretCodes[teamId] ?? [])];
        if (current.roundNumber >= codeInterceptDefaults.interceptionStartsAtRound) interceptAnswers[teamId] ??= [...(current.secretCodes[otherCodeInterceptTeam(teamId)] ?? [])];
      });
      return finishCodeInterceptRound({ ...current, allyAnswers, interceptAnswers });
    }
    return current;
  }, action.actorId, debugActionLabels[action.type]).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await clearActiveRoom(action.actorId, normalizedCode);
    throw error;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

function parseStoredRoom(raw: string | null) {
  if (!raw) return null;
  try { return normalizeRoom(JSON.parse(raw)); } catch { return null; }
}

function makeChoice(room: CodeInterceptRoom): CodeInterceptRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    playerCapacity: room.playerCapacity,
    hasPassphrase: Boolean(room.passphrase),
    redCount: teamPlayers(room, "red").length,
    blueCount: teamPlayers(room, "blue").length,
    updatedAt: room.updatedAt,
  };
}

export async function listJoinableCodeInterceptRooms(cursor?: unknown) {
  const page = await scanOnlineRoomCodes(roomIndexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, roomKey);
  const rooms = values.map(parseStoredRoom);
  const expiredCodes = page.codes.filter((_, index) => rooms[index] && isMultiplayerRoomExpired(rooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !rooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(loadStoredCodeInterceptRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return {
    rooms: rooms.filter((room): room is CodeInterceptRoom => Boolean(room && room.phase === "lobby" && !isMultiplayerRoomExpired(room.updatedAt) && codeInterceptRoomHasSpace(room))).map(makeChoice).sort((a, b) => b.updatedAt - a.updatedAt),
    nextCursor: page.nextCursor,
  };
}

export async function deleteStoredCodeInterceptRoom(code: string, actorId: string) {
  const room = await loadStoredCodeInterceptRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
  if (!canDissolveOnlineRoom("code-intercept", room)) throw new Error("CODE_INTERCEPT_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(room.code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedCodeInterceptRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map(loadStoredCodeInterceptRoom));
  const targets = rooms.filter((room): room is CodeInterceptRoom => Boolean(room && room.hostId === authenticatedHostId));
  if (targets.some((room) => !canDissolveOnlineRoom("code-intercept", room))) throw new Error("CODE_INTERCEPT_ROOM_IN_PROGRESS");
  await Promise.all(targets.map((room) => deleteStoredCodeInterceptRoom(room.code, authenticatedHostId)));
  return targets.length;
}
