import { redisCommand, redisPipeline } from "@/lib/redis-store";
import { createHmac } from "node:crypto";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import {
  emitObservabilityEvent,
  observabilityErrorCode,
  observabilityRef,
} from "@/lib/observability";
import type {
  GameReplayGameType,
  GameReplayListResponse,
  GameReplaySummary,
  TahoiyaReplayDetail,
} from "@/lib/game-replay-types";
import { resolveGameReplayPolicy } from "@/lib/game-replay-policy";

type StoredTahoiyaReplay = {
  schemaVersion: 1;
  id: string;
  gameType: "tahoiya";
  finishedAt: number;
  expiresAt: number;
  round: number;
  word: string;
  reading?: string;
  realDefinition: string;
  resultText: string;
  players: { id: string; name: string }[];
  definitions: { id: string; text: string; authorId: string | null; isReal: boolean }[];
  votes: Record<string, string>;
  scores: Record<string, number>;
};

type StoredGameReplay = StoredTahoiyaReplay;

const replayKeyPrefix = "game-replay:v1:";
const playerIndexKeyPrefix = "player-replays:v1:";
const playerFavoritesKeyPrefix = "player-replay-favorites:v1:";
const replayFavoritersKeyPrefix = "game-replay-favoriters:v1:";
const maximumPlayerIndexSize = 500;

function replayKey(id: string) {
  return `${replayKeyPrefix}${id}`;
}

function playerIndexKey(playerId: string) {
  return `${playerIndexKeyPrefix}${playerId}`;
}

function playerFavoritesKey(playerId: string) {
  return `${playerFavoritesKeyPrefix}${playerId}`;
}

function replayFavoritersKey(id: string) {
  return `${replayFavoritersKeyPrefix}${id}`;
}

function replayId(eventId: string) {
  const secret = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET || "game-fields-local-replay-v1";
  const digest = createHmac("sha256", secret).update(`replay:${eventId}`).digest("base64url").slice(0, 24);
  return `replay_${digest}`;
}

function cleanText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function parseStoredReplay(value: unknown): StoredGameReplay | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredTahoiyaReplay>;
    if (
      parsed.schemaVersion !== 1
      || parsed.gameType !== "tahoiya"
      || typeof parsed.id !== "string"
      || typeof parsed.finishedAt !== "number"
      || typeof parsed.expiresAt !== "number"
      || !Array.isArray(parsed.players)
      || !Array.isArray(parsed.definitions)
    ) return null;
    return parsed as StoredTahoiyaReplay;
  } catch {
    return null;
  }
}

function isParticipant(replay: StoredGameReplay, playerId: string) {
  return replay.players.some((player) => player.id === playerId);
}

function replaySummary(replay: StoredGameReplay, playerId: string, favorite: boolean): GameReplaySummary {
  const score = replay.scores[playerId] ?? 0;
  return {
    id: replay.id,
    gameType: replay.gameType,
    finishedAt: replay.finishedAt,
    expiresAt: replay.expiresAt,
    favorite,
    title: replay.word,
    resultLabel: `${score}点`,
    playerCount: replay.players.length,
    round: replay.round,
  };
}

function tahoiyaRoundScores(room: TahoiyaRoom) {
  const scores = Object.fromEntries(room.players.map((player) => [player.id, 0]));
  for (const [voterId, optionId] of Object.entries(room.votes)) {
    const option = room.options.find((item) => item.id === optionId);
    if (option?.isReal) scores[voterId] = (scores[voterId] ?? 0) + 2;
    else if (option?.authorId) scores[option.authorId] = (scores[option.authorId] ?? 0) + 1;
  }
  return scores;
}

function tahoiyaDetail(replay: StoredTahoiyaReplay, playerId: string, favorite: boolean): TahoiyaReplayDetail {
  const playerNames = new Map(replay.players.map((player) => [player.id, player.name]));
  const votesByDefinition = new Map<string, string[]>();
  for (const [voterId, definitionId] of Object.entries(replay.votes)) {
    const voters = votesByDefinition.get(definitionId) ?? [];
    voters.push(playerNames.get(voterId) ?? "Unknown");
    votesByDefinition.set(definitionId, voters);
  }
  return {
    ...replaySummary(replay, playerId, favorite),
    gameType: "tahoiya",
    reading: replay.reading,
    realDefinition: replay.realDefinition,
    resultText: replay.resultText,
    definitions: replay.definitions.map((definition) => {
      const voterNames = votesByDefinition.get(definition.id) ?? [];
      return {
        id: definition.id,
        text: definition.text,
        isReal: definition.isReal,
        authorName: definition.authorId ? playerNames.get(definition.authorId) ?? "Unknown" : null,
        isMine: definition.authorId === playerId,
        voteCount: voterNames.length,
        voterNames,
      };
    }),
    scores: replay.players
      .map((player) => ({ playerName: player.name, points: replay.scores[player.id] ?? 0, isViewer: player.id === playerId }))
      .sort((left, right) => right.points - left.points),
    viewerVoteDefinitionId: replay.votes[playerId],
  };
}

export async function recordTahoiyaReplay(room: TahoiyaRoom) {
  if (room.phase !== "result" || room.debugMode || !room.word || room.options.length === 0) return false;
  const eventId = `tahoiya:${room.code}:${room.createdAt}:${room.round}`;
  const id = replayId(eventId);
  if (!id) return false;
  const policy = resolveGameReplayPolicy();
  const finishedAt = room.updatedAt || Date.now();
  const expiresAt = finishedAt + policy.retentionDays * 24 * 60 * 60 * 1000;
  const remainingSeconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  const roundScores = tahoiyaRoundScores(room);
  const replay: StoredTahoiyaReplay = {
    schemaVersion: 1,
    id,
    gameType: "tahoiya",
    finishedAt,
    expiresAt,
    round: room.round,
    word: cleanText(room.word, 120),
    reading: cleanText(room.reading, 160) || undefined,
    realDefinition: cleanText(room.realDefinition, 1200),
    resultText: cleanText(room.resultText, 2000),
    players: room.players.map((player) => ({ id: player.id, name: cleanText(player.name, 40) || "Unknown" })),
    definitions: room.options.map((option) => ({
      id: cleanText(option.id, 100),
      text: cleanText(option.text, 1200),
      authorId: option.authorId,
      isReal: option.isReal,
    })),
    votes: Object.fromEntries(Object.entries(room.votes).filter(([playerId, optionId]) => playerId && optionId)),
    scores: Object.fromEntries(room.players.map((player) => [player.id, Math.max(0, Math.floor(roundScores[player.id] ?? 0))])),
  };

  try {
    const created = await redisCommand<"OK" | null>(["SET", replayKey(id), JSON.stringify(replay), "NX", "EX", String(remainingSeconds)]);
    await redisPipeline(room.players.flatMap((player) => [
      ["ZADD", playerIndexKey(player.id), String(finishedAt), id],
      ["ZREMRANGEBYRANK", playerIndexKey(player.id), "0", String(-(maximumPlayerIndexSize + 1))],
    ]));
    if (created === "OK") {
      emitObservabilityEvent("info", "replay.record", {
        game: "tahoiya",
        operation: "record-replay",
        roomRef: observabilityRef("room", room.code),
        eventRef: observabilityRef("event", id),
        round: room.round,
        playerCount: room.players.length,
        affectedCount: 1,
        outcome: "success",
      });
    }
    return created === "OK";
  } catch (error) {
    emitObservabilityEvent("error", "replay.record", {
      game: "tahoiya",
      operation: "record-replay",
      roomRef: observabilityRef("room", room.code),
      eventRef: observabilityRef("event", id),
      round: room.round,
      outcome: "failed",
      errorCode: observabilityErrorCode(error),
    });
    return false;
  }
}

async function loadPlayerFavoriteIds(playerId: string) {
  const ids = await redisCommand<string[]>(["SMEMBERS", playerFavoritesKey(playerId)]);
  return new Set(Array.isArray(ids) ? ids : []);
}

export async function listPlayerGameReplays(
  playerId: string,
  gameType: GameReplayGameType | "all" = "all",
  limit = 30,
): Promise<GameReplayListResponse> {
  const policy = resolveGameReplayPolicy();
  const [recentIds, favoriteIds] = await Promise.all([
    redisCommand<string[]>(["ZREVRANGE", playerIndexKey(playerId), "0", "199"]),
    loadPlayerFavoriteIds(playerId),
  ]);
  const ids = [...new Set([...favoriteIds, ...(Array.isArray(recentIds) ? recentIds : [])])];
  if (ids.length === 0) return { replays: [], policy, favoriteCount: favoriteIds.size };
  const raw = await redisCommand<Array<string | null>>(["MGET", ...ids.map(replayKey)]);
  const staleIds: string[] = [];
  const now = Date.now();
  const replays = ids.flatMap((id, index) => {
    const replay = parseStoredReplay(raw[index]);
    if (!replay || !isParticipant(replay, playerId)) {
      staleIds.push(id);
      return [];
    }
    const favorite = favoriteIds.has(id);
    if (!favorite && replay.expiresAt <= now) {
      staleIds.push(id);
      return [];
    }
    if (gameType !== "all" && replay.gameType !== gameType) return [];
    return [replaySummary(replay, playerId, favorite)];
  }).sort((left, right) => right.finishedAt - left.finishedAt).slice(0, Math.max(1, Math.min(100, limit)));

  if (staleIds.length > 0) {
    await redisPipeline([
      ["ZREM", playerIndexKey(playerId), ...staleIds],
      ["SREM", playerFavoritesKey(playerId), ...staleIds],
    ]).catch(() => undefined);
  }
  return { replays, policy, favoriteCount: favoriteIds.size - staleIds.filter((id) => favoriteIds.has(id)).length };
}

export async function getPlayerGameReplay(playerId: string, id: string): Promise<TahoiyaReplayDetail | null> {
  const [raw, favorite] = await Promise.all([
    redisCommand<string | null>(["GET", replayKey(id)]),
    redisCommand<number>(["SISMEMBER", playerFavoritesKey(playerId), id]),
  ]);
  const replay = parseStoredReplay(raw);
  if (!replay || !isParticipant(replay, playerId)) return null;
  const isFavorite = favorite === 1;
  if (!isFavorite && replay.expiresAt <= Date.now()) return null;
  return tahoiyaDetail(replay, playerId, isFavorite);
}

export async function setPlayerGameReplayFavorite(playerId: string, id: string, favorite: boolean) {
  const [raw, currentFavorite] = await Promise.all([
    redisCommand<string | null>(["GET", replayKey(id)]),
    redisCommand<number>(["SISMEMBER", playerFavoritesKey(playerId), id]),
  ]);
  const replay = parseStoredReplay(raw);
  if (!replay || !isParticipant(replay, playerId)) throw new Error("GAME_REPLAY_NOT_FOUND");
  if (replay.expiresAt <= Date.now() && currentFavorite !== 1) throw new Error("GAME_REPLAY_NOT_FOUND");
  const policy = resolveGameReplayPolicy();

  if (favorite) {
    const result = await redisCommand<number>([
      "EVAL",
      "if redis.call('EXISTS',KEYS[3])==0 then return -2 end; if redis.call('SISMEMBER',KEYS[1],ARGV[1])==1 then return 0 end; if redis.call('SCARD',KEYS[1])>=tonumber(ARGV[2]) then return -1 end; redis.call('SADD',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],ARGV[3]); redis.call('PERSIST',KEYS[3]); return 1",
      "3", playerFavoritesKey(playerId), replayFavoritersKey(id), replayKey(id), id, String(policy.favoriteLimit), playerId,
    ]);
    if (result === -1) throw new Error("GAME_REPLAY_FAVORITE_LIMIT");
    if (result === -2) throw new Error("GAME_REPLAY_NOT_FOUND");
  } else {
    const remainingSeconds = Math.max(0, Math.ceil((replay.expiresAt - Date.now()) / 1000));
    await redisCommand<number>([
      "EVAL",
      "redis.call('SREM',KEYS[1],ARGV[1]); redis.call('SREM',KEYS[2],ARGV[2]); if redis.call('SCARD',KEYS[2])==0 then redis.call('DEL',KEYS[2]); if tonumber(ARGV[3])<=0 then redis.call('DEL',KEYS[3]) else redis.call('EXPIRE',KEYS[3],ARGV[3]) end end; return 1",
      "3", playerFavoritesKey(playerId), replayFavoritersKey(id), replayKey(id), id, playerId, String(remainingSeconds),
    ]);
  }

  return getPlayerGameReplay(playerId, id);
}
