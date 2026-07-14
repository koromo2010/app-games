import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  type TopicDictionarySource,
  type TopicPairDistance,
} from "@/lib/wordwolf";
import type { ClueLogVisibility, ClueMode, GameMode } from "@/lib/wordwolf-game-types";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { normalizeHodoaiConfig } from "@/lib/hodoai-talk";
import { normalizeKotobaSenpukuConfig } from "@/lib/kotoba-senpuku";
import { redisCommand } from "@/lib/redis-store";

export type RoomDefaultsGame = "wordwolf" | "tahoiya" | "hodoai-talk" | "kotoba-senpuku";

export type StoredWordWolfRoomDefaults = {
  gameMode: GameMode;
  clueLogVisibility: ClueLogVisibility;
  clueMode: ClueMode;
  randomizeTurnOrder: boolean;
  roundsTotal: number;
  turnTimeLimitSeconds: number;
  wolfCount: number;
  topicDictionarySource: TopicDictionarySource;
  topicPairDistance: TopicPairDistance;
  topicHint: string;
};

export type StoredTahoiyaRoomDefaults = {
  playMode: "single-answerer" | "all-vote";
  topicDifficulty: "standard" | "extreme";
  answererMode: "manual" | "random";
  showRealDefinitionToWriters: boolean;
  actionTimeLimitSeconds: number;
};

export type StoredHodoaiRoomDefaults = {
  roundsTotal: number;
  cardsPerPlayer: number;
  clueTimeLimitSeconds: number;
  arrangeTimeLimitSeconds: number;
};

export type StoredKotobaSenpukuRoomDefaults = {
  roundsTotal: number;
  secretTimeLimitSeconds: number;
  turnTimeLimitSeconds: number;
  continuousScan: boolean;
  allowWordGuess: boolean;
  randomFirstTurn: boolean;
};

export type StoredRoomDefaults = StoredWordWolfRoomDefaults | StoredTahoiyaRoomDefaults | StoredHodoaiRoomDefaults | StoredKotobaSenpukuRoomDefaults;

const roomDefaultsKeyPrefix = "room-defaults:";
const lobbyRounds = [1, 2, 3, 4];

function roomDefaultsKey(game: RoomDefaultsGame, playerId: string) {
  return `${roomDefaultsKeyPrefix}${game}:${playerId}`;
}

function normalizeGame(value: unknown): RoomDefaultsGame | null {
  return value === "wordwolf" || value === "tahoiya" || value === "hodoai-talk" || value === "kotoba-senpuku" ? value : null;
}

function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

function normalizeClueMode(value: unknown): ClueMode {
  return value === "simultaneous" ? "simultaneous" : "turn";
}

function normalizeRoundsTotal(value: unknown) {
  const round = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 3;
  return lobbyRounds.includes(round) ? round : 3;
}

function normalizeWolfCount(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(20, count));
}

function normalizeWordWolfDefaults(value: unknown): StoredWordWolfRoomDefaults {
  const parsed = value && typeof value === "object" ? value as Partial<StoredWordWolfRoomDefaults> : {};
  return {
    gameMode: normalizeGameMode(parsed.gameMode),
    clueLogVisibility: parsed.clueLogVisibility === "result" ? "result" : "always",
    clueMode: normalizeClueMode(parsed.clueMode),
    randomizeTurnOrder: typeof parsed.randomizeTurnOrder === "boolean" ? parsed.randomizeTurnOrder : true,
    roundsTotal: normalizeRoundsTotal(parsed.roundsTotal),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    wolfCount: normalizeWolfCount(parsed.wolfCount),
    topicDictionarySource: normalizeTopicDictionarySource(parsed.topicDictionarySource),
    topicPairDistance: normalizeTopicPairDistance(parsed.topicPairDistance),
    topicHint: typeof parsed.topicHint === "string" ? parsed.topicHint.slice(0, 80) : "",
  };
}

function normalizeTahoiyaDefaults(value: unknown): StoredTahoiyaRoomDefaults {
  const parsed = value && typeof value === "object" ? value as Partial<StoredTahoiyaRoomDefaults> : {};
  const playMode = parsed.playMode === "all-vote" ? "all-vote" : "single-answerer";
  return {
    playMode,
    topicDifficulty: parsed.topicDifficulty === "extreme" ? "extreme" : "standard",
    answererMode: parsed.answererMode === "manual" ? "manual" : "random",
    showRealDefinitionToWriters: playMode === "single-answerer" && parsed.showRealDefinitionToWriters !== false,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
  };
}

function normalizeHodoaiDefaults(value: unknown): StoredHodoaiRoomDefaults {
  const config = normalizeHodoaiConfig(value);
  return {
    roundsTotal: config.roundsTotal,
    cardsPerPlayer: config.cardsPerPlayer,
    clueTimeLimitSeconds: config.clueTimeLimitSeconds,
    arrangeTimeLimitSeconds: config.arrangeTimeLimitSeconds,
  };
}

function normalizeKotobaSenpukuDefaults(value: unknown): StoredKotobaSenpukuRoomDefaults {
  const config = normalizeKotobaSenpukuConfig(value);
  return {
    roundsTotal: config.roundsTotal,
    secretTimeLimitSeconds: config.secretTimeLimitSeconds,
    turnTimeLimitSeconds: config.turnTimeLimitSeconds,
    continuousScan: config.continuousScan,
    allowWordGuess: config.allowWordGuess,
    randomFirstTurn: config.randomFirstTurn,
  };
}

export function normalizeStoredRoomDefaults(game: RoomDefaultsGame, value: unknown): StoredRoomDefaults {
  if (game === "wordwolf") return normalizeWordWolfDefaults(value);
  if (game === "tahoiya") return normalizeTahoiyaDefaults(value);
  if (game === "hodoai-talk") return normalizeHodoaiDefaults(value);
  return normalizeKotobaSenpukuDefaults(value);
}

export async function loadStoredRoomDefaults(gameInput: unknown, playerIdInput: unknown) {
  const game = normalizeGame(gameInput);
  const playerId = typeof playerIdInput === "string" ? playerIdInput.trim() : "";
  if (!game || !playerId) return null;

  const raw = await redisCommand<string | null>(["GET", roomDefaultsKey(game, playerId)]);
  if (!raw) return null;

  try {
    return normalizeStoredRoomDefaults(game, JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredRoomDefaults(gameInput: unknown, playerIdInput: unknown, defaultsInput: unknown) {
  const game = normalizeGame(gameInput);
  const playerId = typeof playerIdInput === "string" ? playerIdInput.trim() : "";
  if (!game || !playerId) throw new Error("INVALID_ROOM_DEFAULTS");

  const defaults = normalizeStoredRoomDefaults(game, defaultsInput);
  await redisCommand<"OK">(["SET", roomDefaultsKey(game, playerId), JSON.stringify(defaults)]);
  return defaults;
}
