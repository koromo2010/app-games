import { randomUUID } from "node:crypto";
import { appendGameDebugLog, normalizeGameDebugLog } from "@/lib/game-debug-log";
import { recordNigoichiReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import {
  allNigoichiAssociationsSubmitted,
  allNigoichiGuessesSubmitted,
  areValidNigoichiAssociations,
  correctNigoichiConfig,
  dealNigoichiRound,
  finishNigoichiRound,
  isValidNigoichiGuess,
  isValidNigoichiConfig,
  nigoichiMaximumAssociationWordsForPlayers,
  nigoichiMinimumPlayers,
  nigoichiPlayerLimit,
  nigoichiRoomHasSpace,
  normalizeNigoichiPlayerCapacity,
  sanitizeNigoichiRoomForPlayer,
  type NigoichiHand,
  type NigoichiPhase,
  type NigoichiPlayer,
  type NigoichiRoom,
  type NigoichiRoomAction,
  type NigoichiRoomChoice,
  type NigoichiRoundLog,
  type NigoichiRoundScoreResult,
  type NigoichiWordDifficulty,
} from "@/lib/nigoichi";
import { claimPlayerActiveRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { recordNigoichiGameResults } from "@/lib/player-stats-store";
import { loadOnlineRoomValues, scanOnlineRoomCodes } from "@/lib/online-room-list";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { redisCommand } from "@/lib/redis-store";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { listLocalWordWolfWords, listLocalWordWolfWordsByDifficulty } from "@/lib/wordwolf";

const roomKeyPrefix = "nigoichi:room:";
const roomIndexKey = "nigoichi:rooms";
const playerActiveRoomKeyPrefix = "nigoichi:player-active-room:";

const debugActionLabels: Record<NigoichiRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "set-config": "ゲーム設定を変更",
  "start-game": "ゲームを開始",
  "submit-associations": "連想語を提出",
  "submit-guess": "余り番号を予想",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-fill-associations": "未提出の連想語を自動入力",
  "debug-fill-guesses": "未提出の予想を自動入力",
};

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

function isPhase(value: unknown): value is NigoichiPhase {
  return value === "lobby" || value === "clue" || value === "guess" || value === "result";
}

function normalizeWordDifficulty(value: unknown): NigoichiWordDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

function normalizePlayers(value: unknown): NigoichiPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const player = item as Partial<NigoichiPlayer>;
    if (typeof player.id !== "string" || typeof player.name !== "string") return [];
    const id = player.id.trim().slice(0, 120);
    const name = player.name.trim().slice(0, 20);
    if (!id || !name) return [];
    return [{
      id,
      name,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
      shareNameAllowed: player.shareNameAllowed === true,
    }];
  }).slice(0, nigoichiPlayerLimit);
}

function normalizeNumberRecord(value: unknown, wordCount: number) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (!key || typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= wordCount) return [];
    return [[key.slice(0, 120), item]];
  }));
}

function normalizeTotalScores(value: unknown, players: NigoichiPlayer[]) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(players.map((player) => {
    const score = source[player.id];
    return [player.id, typeof score === "number" && Number.isInteger(score) ? score : 0];
  }));
}

function normalizeRoundScore(value: unknown, playerId: string): NigoichiRoundScoreResult | null {
  if (!value || typeof value !== "object") return null;
  const score = value as Partial<NigoichiRoundScoreResult>;
  if (score.playerId !== playerId
    || typeof score.isCorrect !== "boolean"
    || !Number.isInteger(score.correctBonus)
    || !Number.isInteger(score.receivedWrongVotes)
    || !Number.isInteger(score.roundScore)
    || !Number.isInteger(score.totalScoreAfterRound)) return null;
  return {
    playerId,
    isCorrect: score.isCorrect,
    correctBonus: score.correctBonus as number,
    receivedWrongVotes: score.receivedWrongVotes as number,
    roundScore: score.roundScore as number,
    totalScoreAfterRound: score.totalScoreAfterRound as number,
  };
}

function normalizeRoundScores(value: unknown, players: NigoichiPlayer[]) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(players.flatMap((player) => {
    const score = normalizeRoundScore(source[player.id], player.id);
    return score ? [[player.id, score]] : [];
  }));
}

function normalizeRoundHistory(value: unknown): NigoichiRoundLog[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): NigoichiRoundLog[] => {
    if (!item || typeof item !== "object") return [];
    const round = item as Partial<NigoichiRoundLog>;
    if (typeof round.roundId !== "string"
      || !Number.isInteger(round.gameNumber)
      || !Number.isInteger(round.playerCount)
      || !Number.isInteger(round.unassignedCardNumber)
      || !Array.isArray(round.votes)
      || !Array.isArray(round.scores)) return [];
    const votes = round.votes.flatMap((vote) => {
      if (!vote || typeof vote !== "object") return [];
      const parsedVote = vote as { playerId?: unknown; selectedCardNumber?: unknown };
      if (typeof parsedVote.playerId !== "string") return [];
      const selectedCardNumber = parsedVote.selectedCardNumber;
      if (selectedCardNumber !== null && !Number.isInteger(selectedCardNumber)) return [];
      return [{ playerId: parsedVote.playerId.slice(0, 120), selectedCardNumber: selectedCardNumber as number | null }];
    });
    const scores = round.scores.flatMap((score) => {
      if (!score || typeof score !== "object" || typeof (score as { playerId?: unknown }).playerId !== "string") return [];
      const playerId = (score as { playerId: string }).playerId.slice(0, 120);
      const normalized = normalizeRoundScore(score, playerId);
      return normalized ? [normalized] : [];
    });
    if (votes.length !== round.votes.length || scores.length !== round.scores.length) return [];
    return [{
      roundId: round.roundId.slice(0, 160),
      gameNumber: round.gameNumber as number,
      playerCount: round.playerCount as number,
      unassignedCardNumber: round.unassignedCardNumber as number,
      votes,
      scores,
    }];
  });
}

function normalizeHands(value: unknown, playerIds: Set<string>, wordCount: number, cardsPerPlayer: number): Record<string, NigoichiHand> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([playerId, item]) => {
    if (!playerIds.has(playerId) || !Array.isArray(item) || item.length !== cardsPerPlayer) return [];
    if (!item.every((number) => Number.isInteger(number) && (number as number) >= 0 && (number as number) < wordCount)) return [];
    if (new Set(item).size !== item.length) return [];
    return [[playerId, item as number[]]];
  }));
}

function normalizeAssociationWords(value: unknown, associationWordCount: number) {
  if (!Array.isArray(value)) return null;
  const clues = value.flatMap((item): string[] => {
    const raw = typeof item === "string"
      ? item
      : item && typeof item === "object" && typeof (item as { clue?: unknown }).clue === "string"
        ? (item as { clue: string }).clue
        : "";
    const clue = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    return clue ? [clue] : [];
  });
  return areValidNigoichiAssociations(clues, associationWordCount) ? clues : null;
}

function normalizeAssociations(
  value: unknown,
  legacyClues: unknown,
  hands: Record<string, NigoichiHand>,
  associationWordCount: number,
) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacy = legacyClues && typeof legacyClues === "object" ? legacyClues as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(hands).flatMap(([playerId]) => {
    const clues = normalizeAssociationWords(source[playerId], associationWordCount);
    if (clues) return [[playerId, clues]];
    const legacyValue = legacy[playerId];
    const migrated = normalizeAssociationWords(typeof legacyValue === "string" ? [legacyValue] : legacyValue, associationWordCount);
    return migrated
      ? [[playerId, migrated]]
      : [];
  }));
}

function normalizeRoom(value: unknown): NigoichiRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<NigoichiRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const players = normalizePlayers(parsed.players);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const playerCapacity = normalizeNigoichiPlayerCapacity(parsed.playerCapacity, players.length);
  const legacy = parsed as Partial<NigoichiRoom> & { clues?: unknown };
  const requestedAssociationWordCount = typeof parsed.associationWordCount === "number" ? parsed.associationWordCount : 1;
  const requestedCardsPerPlayer = typeof parsed.cardsPerPlayer === "number" ? parsed.cardsPerPlayer : 2;
  const config = correctNigoichiConfig(players.length, requestedCardsPerPlayer, requestedAssociationWordCount);
  const wordDifficulty = normalizeWordDifficulty(parsed.wordDifficulty);
  const words = Array.isArray(parsed.words)
    ? parsed.words.filter((word): word is string => typeof word === "string").map((word) => word.trim().slice(0, 80)).filter(Boolean).slice(0, 21)
    : [];
  const playerIds = new Set(players.map((player) => player.id));
  const hands = normalizeHands(parsed.hands, playerIds, words.length, config.cardsPerPlayer);
  const missingNumber = typeof parsed.missingNumber === "number" && Number.isInteger(parsed.missingNumber) && parsed.missingNumber >= 0 && parsed.missingNumber < words.length
    ? parsed.missingNumber
    : null;
  const normalizedRoom: NigoichiRoom = {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId.slice(0, 120) : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    players,
    playerCapacity,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    cardsPerPlayer: config.cardsPerPlayer,
    associationWordCount: config.associationWordCount,
    wordDifficulty,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    words,
    hands,
    associations: normalizeAssociations(parsed.associations, legacy.clues, hands, config.associationWordCount),
    guesses: normalizeNumberRecord(parsed.guesses, words.length),
    missingNumber,
    totalScores: normalizeTotalScores(parsed.totalScores, players),
    roundScores: normalizeRoundScores(parsed.roundScores, players),
    roundHistory: normalizeRoundHistory(parsed.roundHistory),
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
  const needsLegacyScoreMigration = normalizedRoom.phase === "result"
    && normalizedRoom.missingNumber !== null
    && Object.keys(normalizedRoom.roundScores).length !== players.length
    && parsed.totalScores === undefined
    && parsed.roundScores === undefined;
  return needsLegacyScoreMigration ? finishNigoichiRound(normalizedRoom) : normalizedRoom;
}

function beginGame(room: NigoichiRoom) {
  const preferredWords = listLocalWordWolfWordsByDifficulty(room.wordDifficulty);
  const preferredKeys = new Set(preferredWords.map((word) => word.trim().toLocaleLowerCase("ja-JP")));
  const wordPool = [...preferredWords, ...listLocalWordWolfWords().filter((word) => !preferredKeys.has(word.trim().toLocaleLowerCase("ja-JP")))];
  const dealt = dealNigoichiRound(room.players, wordPool, room.cardsPerPlayer);
  return {
    ...room,
    phase: "clue" as const,
    words: dealt.words,
    hands: dealt.hands,
    associations: {},
    guesses: {},
    missingNumber: dealt.missingNumber,
    roundScores: {},
  };
}

function withPlayersAndCorrectedConfig(room: NigoichiRoom, players: NigoichiPlayer[]) {
  const config = correctNigoichiConfig(players.length, room.cardsPerPlayer, room.associationWordCount);
  const totalScores = Object.fromEntries(players.map((player) => [player.id, room.totalScores[player.id] ?? 0]));
  return { ...room, players, totalScores, cardsPerPlayer: config.cardsPerPlayer, associationWordCount: config.associationWordCount };
}

function resetGame(room: NigoichiRoom) {
  return {
    ...room,
    gameNumber: room.gameNumber + 1,
    phase: "lobby" as const,
    debugReplayEnabled: false,
    words: [],
    hands: {},
    associations: {},
    guesses: {},
    missingNumber: null,
    roundScores: {},
  };
}

async function compareAndSetRoom(expectedRevision: number, room: NigoichiRoom) {
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

type DebugEvent = { actorId?: string; action: string };

async function mutateStoredRoom(code: string, mutate: (room: NigoichiRoom) => NigoichiRoom, debugEvent?: DebugEvent) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredNigoichiRoom(code);
    if (!current) throw new Error("NIGOICHI_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const revision = current.revision + 1;
    const timestamp = Date.now();
    const actorName = debugEvent?.actorId
      ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
      : "システム";
    const withLog = changed.debugMode && debugEvent
      ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action: debugEvent.action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
      : changed;
    const next = normalizeRoom({ ...withLog, revision, updatedAt: timestamp });
    if (!next) throw new Error("INVALID_NIGOICHI_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordNigoichiGameResults(next), recordNigoichiReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("NIGOICHI_ROOM_NOT_FOUND");
  }
  throw new Error("NIGOICHI_ROOM_CONFLICT");
}

function makeChoice(room: NigoichiRoom): NigoichiRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    playerCapacity: room.playerCapacity,
    hasPassphrase: Boolean(room.passphrase),
    cardsPerPlayer: room.cardsPerPlayer,
    associationWordCount: room.associationWordCount,
    wordDifficulty: room.wordDifficulty,
    updatedAt: room.updatedAt,
  };
}

async function saveActiveRooms(room: NigoichiRoom) {
  await Promise.all(room.players.filter((player) => !player.isDummy).map((player) => redisCommand<"OK">([
    "SET", playerActiveRoomKey(player.id), room.code, ...multiplayerRoomExpiryArgs(),
  ])));
}

async function clearActiveRoom(playerId: string, code: string) {
  await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code);
}

export function sanitizeNigoichiRoom(room: NigoichiRoom, playerId: string) {
  return sanitizeNigoichiRoomForPlayer(room, playerId);
}

export async function loadStoredNigoichiRoom(code: string) {
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
  } catch {
    return null;
  }
}

function parseStoredRoom(raw: string | null) {
  if (!raw) return null;
  try { return normalizeRoom(JSON.parse(raw)); } catch { return null; }
}

export async function loadNigoichiPlayerActiveRoom(playerId: string) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedId)]);
  if (!code) return null;
  const room = await loadStoredNigoichiRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedId)]);
    return null;
  }
  return room;
}

export async function createStoredNigoichiRoom(value: unknown, actorId: string) {
  const room = normalizeRoom(value);
  if (!room || room.hostId !== actorId) throw new Error("INVALID_NIGOICHI_ROOM");
  const created: NigoichiRoom = {
    ...room,
    revision: 0,
    phase: "lobby",
    gameNumber: 1,
    debugMode: false,
    debugReplayEnabled: false,
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
  if (activeRoom && activeRoom.code !== created.code) {
    if (!canMoveFromOnlineRoom("nigoichi", activeRoom)) throw new Error("NIGOICHI_PLAYER_ALREADY_ACTIVE");
    await clearActiveRoom(actorId, activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
  if (!claim) throw new Error("NIGOICHI_PLAYER_ALREADY_ACTIVE");
  try {
    const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
    if (saved !== "OK") throw new Error("NIGOICHI_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, created.code]);
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await clearActiveRoom(actorId, created.code);
    throw error;
  }
}

export async function applyStoredNigoichiAction(code: string, action: NigoichiRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    const activeRoom = await loadNigoichiPlayerActiveRoom(action.actorId);
    if (activeRoom && activeRoom.code !== normalizedCode) {
      if (!canMoveFromOnlineRoom("nigoichi", activeRoom)) throw new Error("NIGOICHI_PLAYER_ALREADY_ACTIVE");
      await clearActiveRoom(action.actorId, activeRoom.code);
    }
    claim = await claimPlayerActiveRoom(playerActiveRoomKey(action.actorId), normalizedCode);
    if (!claim) throw new Error("NIGOICHI_PLAYER_ALREADY_ACTIVE");
  }
  const room = await mutateStoredRoom(normalizedCode, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("NIGOICHI_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (!nigoichiRoomHasSpace(current)) throw new Error("NIGOICHI_ROOM_FULL");
      return withPlayersAndCorrectedConfig(current, [...current.players, action.player]);
    }

    const isHost = action.actorId === current.hostId;
    const isMember = current.players.some((player) => player.id === action.actorId);
    if (!isMember) throw new Error("NIGOICHI_ROOM_FORBIDDEN");

    if (action.type === "abort-game") {
      if (!isHost || !current.debugMode || current.phase === "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", debugReplayEnabled: false, words: [], hands: {}, associations: {}, guesses: {}, missingNumber: null, roundScores: {} };
    }
    if (action.type === "leave-room") {
      if (isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return withPlayersAndCorrectedConfig(current, current.players.filter((player) => player.id !== action.actorId));
    }
    if (action.type === "set-debug") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return withPlayersAndCorrectedConfig({
        ...current,
        debugMode: action.enabled,
        debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false,
        debugLog: [],
      }, action.enabled ? current.players : current.players.filter((player) => !player.isDummy));
    }
    if (action.type === "set-debug-replay") {
      if (!isHost || !current.debugMode) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!Number.isInteger(action.associationWordCount)
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
      };
    }
    if (action.type === "debug-add-player") {
      if (!isHost || !current.debugMode || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!nigoichiRoomHasSpace(current)) throw new Error("NIGOICHI_ROOM_FULL");
      const number = current.players.filter((player) => player.isDummy).length + 1;
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16"];
      return withPlayersAndCorrectedConfig(current, [...current.players, { id: `dummy-${randomUUID()}`, name: `ダミー${number}`, joinedAt: Date.now(), avatarColor: colors[(number - 1) % colors.length], isDummy: true }]);
    }
    if (action.type === "start-game") {
      if (!isHost || current.phase !== "lobby") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      if (!current.debugMode && current.players.length < nigoichiMinimumPlayers) throw new Error("NIGOICHI_NOT_ENOUGH_PLAYERS");
      const validationPlayerCount = current.debugMode ? Math.max(nigoichiMinimumPlayers, current.players.length) : current.players.length;
      if (!isValidNigoichiConfig(validationPlayerCount, current.cardsPerPlayer, current.associationWordCount)) throw new Error("NIGOICHI_INVALID_CONFIG");
      return beginGame(current);
    }
    if (action.type === "reset-game") {
      if (!isHost || current.phase !== "result") throw new Error("NIGOICHI_ROOM_FORBIDDEN");
      return resetGame(current);
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
      return allNigoichiAssociationsSubmitted(next) ? { ...next, phase: "guess" as const } : next;
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
      return { ...current, phase: "guess", associations };
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
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

export async function listJoinableNigoichiRooms(cursor?: unknown) {
  const page = await scanOnlineRoomCodes(roomIndexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, roomKey);
  const parsedRooms = values.map(parseStoredRoom);
  const expiredCodes = page.codes.filter((_, index) => parsedRooms[index] && isMultiplayerRoomExpired(parsedRooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !parsedRooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(loadStoredNigoichiRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  const rooms = parsedRooms
    .filter((room): room is NigoichiRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt) && room.phase === "lobby" && nigoichiRoomHasSpace(room)))
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredNigoichiRoom(code: string, actorId: string) {
  const room = await loadStoredNigoichiRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("NIGOICHI_ROOM_FORBIDDEN");
  if (!canDissolveOnlineRoom("nigoichi", room)) throw new Error("NIGOICHI_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(room.code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedNigoichiRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map(loadStoredNigoichiRoom));
  const targets = rooms.filter((room): room is NigoichiRoom => Boolean(room && room.hostId === authenticatedHostId));
  if (targets.some((room) => !canDissolveOnlineRoom("nigoichi", room))) throw new Error("NIGOICHI_ROOM_IN_PROGRESS");
  await Promise.all(targets.map((room) => deleteStoredNigoichiRoom(room.code, authenticatedHostId)));
  return targets.length;
}
