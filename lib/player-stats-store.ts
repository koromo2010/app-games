import { redisCommand } from "@/lib/redis-store";
import type { HodoaiRoom } from "@/lib/hodoai-talk";
import type { KotobaSenpukuRoom } from "@/lib/kotoba-senpuku";
import type { NorthernRoom } from "@/lib/northern-branch-types";
import type { NigoichiRoom } from "@/lib/nigoichi";
import type { CodeInterceptRoom } from "@/lib/code-intercept";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { calculateTahoiyaRoundScores } from "@/lib/tahoiya-scoring";
import type { WordWolfRoom } from "@/lib/wordwolf-room-store";
import { calculateGameRatingChanges, initialGameRating } from "@/lib/game-rating";
import { emitObservabilityEvent, observabilityErrorCode, observabilityRef, type ObservabilityFields } from "@/lib/observability";
import { isPostgresConfigured } from "@/lib/postgres-store";
import {
  loadPostgresPlayerResults,
  loadPostgresPlayerRatingStates,
  loadPostgresRatingStates,
  savePostgresPlayerResults,
} from "@/lib/player-stats-postgres-store";
import { mergePlayerGameResults } from "@/lib/player-stats-history";
import { buildPlayedGameRatings } from "@/lib/player-rating-visibility";

export type PlayerStatsGameType = "wordwolf" | "tahoiya" | "northern-branch" | "hodoai" | "kotoba-senpuku" | "nigoichi" | "code-intercept";

export type PlayerGameResult = {
  schemaVersion: 1;
  id: string;
  gameType: PlayerStatsGameType;
  roomCode: string;
  roomCreatedAt: number;
  gameNumber: number;
  finishedAt: number;
  playerId: string;
  playerName: string;
  won: boolean;
  draw?: boolean;
  resultLabel: string;
  playerCount: number;
  role?: "village" | "wolf" | "no-wolf" | "answerer" | "writer" | "merchant" | "cooperator" | "infiltrator";
  details?: Record<string, string | number | boolean | null>;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingChange?: number;
};

export type PlayerStatsSummary = { played: number; wins: number; draws: number; losses: number; winRate: number };
export type PlayerStatsResponse = { today: PlayerStatsSummary; month: PlayerStatsSummary; total: PlayerStatsSummary; recent: PlayerGameResult[]; ratings: Partial<Record<PlayerStatsGameType, number>> };
export type PlayerStatsGameFilter = "all" | PlayerStatsGameType;

const playerResultsKeyPrefix = "player-results:";
const resultEventKeyPrefix = "game-result-event:";
const playerRatingKey = (gameType: PlayerStatsGameType) => `player-rating:v1:${gameType}`;
const playerRatingGamesKey = (gameType: PlayerStatsGameType) => `player-rating-games:v1:${gameType}`;
const ratingEventKey = (eventId: string) => `rating-event:v1:${eventId}`;

type RatingOutcome = { playerId: string; won: boolean; performanceScore?: number };
type RecordedRating = { before: number; after: number; change: number };

async function recordGameRatings(gameType: PlayerStatsGameType, eventId: string, outcomes: RatingOutcome[], cooperative = false) {
  const ids = outcomes.map((item) => item.playerId);
  const [stored, storedGames] = await Promise.all([
    redisCommand<Array<string | null>>(["HMGET", playerRatingKey(gameType), ...ids]),
    redisCommand<Array<string | null>>(["HMGET", playerRatingGamesKey(gameType), ...ids]),
  ]);
  const needsPostgresFallback = isPostgresConfigured() && stored.some((value) => !Number(value));
  const postgresStates = needsPostgresFallback
    ? await loadPostgresRatingStates(gameType, ids).catch(() => new Map())
    : new Map();
  const realPlayers = outcomes.map((item, index) => ({
    ...item,
    rating: Number(stored[index]) || postgresStates.get(item.playerId)?.rating || initialGameRating,
    gamesPlayed: Number(storedGames[index]) || postgresStates.get(item.playerId)?.gamesPlayed || 0,
  }));
  const changes = cooperative
    ? realPlayers.map((player) => calculateGameRatingChanges([
      { playerId: player.playerId, rating: player.rating, gamesPlayed: player.gamesPlayed, performanceScore: player.won ? 1 : 0 },
      { playerId: "__system__", rating: initialGameRating, performanceScore: player.won ? 0 : 1 },
    ])[0])
    : calculateGameRatingChanges(realPlayers.map((player) => ({
      playerId: player.playerId,
      rating: player.rating,
      gamesPlayed: player.gamesPlayed,
      performanceScore: player.performanceScore ?? (player.won ? 1 : 0),
    })));
  const applied = await redisCommand<number[]>([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1])==1 then return {} end; local out={}; for i=2,#ARGV,4 do if redis.call('HEXISTS',KEYS[2],ARGV[i])==0 then redis.call('HSET',KEYS[2],ARGV[i],ARGV[i+1]) end; if redis.call('HEXISTS',KEYS[3],ARGV[i])==0 then redis.call('HSET',KEYS[3],ARGV[i],ARGV[i+2]) end; table.insert(out,redis.call('HINCRBY',KEYS[2],ARGV[i],ARGV[i+3])); redis.call('HINCRBY',KEYS[3],ARGV[i],1); end; redis.call('SET',KEYS[1],'1'); return out",
    "3", ratingEventKey(eventId), playerRatingKey(gameType), playerRatingGamesKey(gameType), eventId,
    ...changes.flatMap((change) => {
      const player = realPlayers.find((item) => item.playerId === change.playerId)!;
      return [change.playerId, String(player.rating), String(player.gamesPlayed), String(change.change)];
    }),
  ]);
  const finalRatings = applied.length === changes.length ? applied : await redisCommand<Array<string | null>>(["HMGET", playerRatingKey(gameType), ...ids]).then((values) => values.map((value) => Number(value) || initialGameRating));
  return new Map(changes.map((change, index) => [change.playerId, { before: finalRatings[index] - change.change, after: finalRatings[index], change: change.change } satisfies RecordedRating]));
}
const playerResultsKey = (playerId: string) => `${playerResultsKeyPrefix}${playerId}`;
const resultEventKey = (resultId: string) => `${resultEventKeyPrefix}${resultId}`;

function emptySummary(): PlayerStatsSummary { return { played: 0, wins: 0, draws: 0, losses: 0, winRate: 0 }; }
function summarize(results: PlayerGameResult[]): PlayerStatsSummary {
  const played = results.length;
  const wins = results.filter((result) => result.won).length;
  const draws = results.filter((result) => result.draw === true).length;
  return { played, wins, draws, losses: played - wins - draws, winRate: played > 0 ? Math.round((wins / played) * 1000) / 10 : 0 };
}
function startOfToday() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); }
function startOfMonth() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
function isPlayerStatsGameType(value: unknown): value is PlayerStatsGameType { return value === "wordwolf" || value === "tahoiya" || value === "northern-branch" || value === "hodoai" || value === "kotoba-senpuku" || value === "nigoichi" || value === "code-intercept"; }

function parseResult(value: unknown): PlayerGameResult | null {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlayerGameResult>;
    if (parsed.schemaVersion !== 1 || !isPlayerStatsGameType(parsed.gameType) || typeof parsed.id !== "string" || typeof parsed.playerId !== "string" || typeof parsed.finishedAt !== "number" || typeof parsed.won !== "boolean") return null;
    return { ...parsed, resultLabel: typeof parsed.resultLabel === "string" ? parsed.resultLabel : parsed.won ? "勝利" : "敗北" } as PlayerGameResult;
  } catch { return null; }
}

export function normalizePlayerStatsGameFilter(value: unknown): PlayerStatsGameFilter { return value === "all" || isPlayerStatsGameType(value) ? value : "all"; }

async function recordPlayerResults(results: PlayerGameResult[]) {
  let recorded = 0;
  for (const result of results) {
    const created = await redisCommand<number>([
      "EVAL",
      "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('ZADD',KEYS[2],ARGV[1],ARGV[2]); redis.call('SET',KEYS[1],'1'); return 1",
      "2", resultEventKey(result.id), playerResultsKey(result.playerId), String(result.finishedAt), JSON.stringify(result),
    ]);
    recorded += created === 1 ? 1 : 0;
  }
  if (isPostgresConfigured()) {
    const postgresRecorded = await savePostgresPlayerResults(results);
    return Math.max(recorded, postgresRecorded);
  }
  return recorded;
}

async function observeStatsRecord(fields: ObservabilityFields, record: () => Promise<number>) {
  try {
    const recorded = await record();
    if (recorded > 0) {
      emitObservabilityEvent("info", "stats.record", { ...fields, affectedCount: recorded, outcome: "success" });
    }
    return recorded;
  } catch (error) {
    emitObservabilityEvent("error", "stats.record", { ...fields, outcome: "failed", errorCode: observabilityErrorCode(error) });
    throw error;
  }
}

function wolfIds(room: WordWolfRoom) { return Array.isArray(room.wolfIds) && room.wolfIds.length > 0 ? room.wolfIds : room.wolfId ? [room.wolfId] : []; }
function didWordWolfPlayerWin(room: WordWolfRoom, playerId: string) {
  if (room.winner === "players") return room.accusedId ? playerId !== room.accusedId : true;
  if (room.winner === "village") return !wolfIds(room).includes(playerId);
  return wolfIds(room).includes(playerId);
}

export async function recordWordWolfGameResults(room: WordWolfRoom) {
  if (room.phase !== "result" || !room.winner || room.debugMode) return 0;
  const eventId = `wordwolf:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "wordwolf", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: room.players.length }, async () => {
    const ratingByPlayer = await recordGameRatings("wordwolf", eventId, room.players.map((player) => ({ playerId: player.id, won: didWordWolfPlayerWin(room, player.id) })));
    return recordPlayerResults(room.players.map((player) => {
      const role = wolfIds(room).length === 0 ? "no-wolf" : wolfIds(room).includes(player.id) ? "wolf" : "village";
      const won = didWordWolfPlayerWin(room, player.id);
      const rating = ratingByPlayer.get(player.id);
      return { schemaVersion: 1, id: `wordwolf:${room.code}:${room.createdAt}:${room.gameNumber}:${player.id}`, gameType: "wordwolf", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role, won, resultLabel: won ? "勝利" : "敗北", playerCount: room.players.length, details: { gameMode: room.gameMode, winner: room.winner }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

function tahoiyaRoundPoints(room: TahoiyaRoom) {
  return calculateTahoiyaRoundScores(room);
}

export async function recordTahoiyaRoundResults(room: TahoiyaRoom) {
  if (room.phase !== "result" || room.debugMode) return 0;
  const points = tahoiyaRoundPoints(room);
  const best = Math.max(0, ...Object.values(points));
  const eventId = `tahoiya:${room.code}:${room.createdAt}:${room.round}`;
  return observeStatsRecord({ game: "tahoiya", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), round: room.round, playerCount: room.players.length }, async () => {
    const ratings = await recordGameRatings("tahoiya", eventId, room.players.map((player) => ({ playerId: player.id, won: (points[player.id] ?? 0) === best, performanceScore: points[player.id] ?? 0 })));
    return recordPlayerResults(room.players.map((player) => {
      const won = (points[player.id] ?? 0) === best;
      const rating = ratings.get(player.id);
      return { schemaVersion: 1, id: `tahoiya:${room.code}:${room.createdAt}:${room.round}:${player.id}`, gameType: "tahoiya", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.round, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: player.id === room.answererId ? "answerer" : "writer", won, resultLabel: won ? "ラウンド1位" : `${points[player.id] ?? 0}点`, playerCount: room.players.length, details: { roundPoints: points[player.id] ?? 0, word: room.word }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function recordHodoaiGameResults(room: HodoaiRoom) {
  if (room.phase !== "result" || room.round < room.roundsTotal || room.debugMode) return 0;
  const maxPoints = 3;
  const won = maxPoints > 0 && room.totalPoints / maxPoints >= 0.5;
  const realPlayers = room.players.filter((player) => !player.isDummy);
  const eventId = `hodoai:${room.code}:${room.createdAt}:${room.gameNumber ?? 1}`;
  return observeStatsRecord({ game: "hodoai", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber ?? 1, playerCount: realPlayers.length }, async () => {
    const ratings = await recordGameRatings("hodoai", eventId, realPlayers.map((player) => ({ playerId: player.id, won })), true);
    return recordPlayerResults(realPlayers.map((player) => { const rating = ratings.get(player.id); return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "hodoai", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber ?? 1, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: "cooperator", won, resultLabel: `${room.totalPoints}/${maxPoints}点`, playerCount: realPlayers.length, details: { points: room.totalPoints, maxPoints }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult; }));
  });
}

export async function recordNorthernBranchGameResults(room: NorthernRoom) {
  if (room.phase !== "finished" || !room.game?.winnerId || room.debugMode) return 0;
  const realPlayers = room.players.filter((player) => !player.isDummy);
  const eventId = `northern-branch:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "northern-branch", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: realPlayers.length }, async () => {
    const ratings = await recordGameRatings("northern-branch", eventId, realPlayers.map((player) => ({ playerId: player.id, won: player.id === room.game?.winnerId, performanceScore: room.game?.players.find((item) => item.id === player.id)?.points ?? 0 })));
    return recordPlayerResults(realPlayers.map((player) => {
    const gamePlayer = room.game?.players.find((item) => item.id === player.id);
    const won = player.id === room.game?.winnerId;
    const rating = ratings.get(player.id);
    return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "northern-branch", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: "merchant", won, resultLabel: won ? "勝利" : `${gamePlayer?.points ?? 0}点`, playerCount: realPlayers.length, details: { points: gamePlayer?.points ?? 0 }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function recordKotobaSenpukuGameResults(room: KotobaSenpukuRoom) {
  if (room.phase !== "result" || room.round < room.roundsTotal || room.debugMode) return 0;
  const realPlayers = room.players.filter((player) => !player.isDummy);
  const winnerIds = room.history.at(-1)?.winnerIds ?? (room.history.at(-1)?.winnerId ? [room.history.at(-1)!.winnerId!] : []);
  const eventId = `kotoba-senpuku:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "kotoba-senpuku", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: realPlayers.length }, async () => {
    const ratings = await recordGameRatings("kotoba-senpuku", eventId, realPlayers.map((player) => ({ playerId: player.id, won: winnerIds.includes(player.id), performanceScore: room.totalScores[player.id] ?? 0 })));
    return recordPlayerResults(realPlayers.map((player) => {
    const points = room.totalScores[player.id] ?? 0;
    const won = winnerIds.includes(player.id);
    const rating = ratings.get(player.id);
    return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "kotoba-senpuku", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: "infiltrator", won, resultLabel: won ? "最後まで生存" : "脱落", playerCount: realPlayers.length, details: { points }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function recordNigoichiGameResults(room: NigoichiRoom) {
  if (room.phase !== "result" || room.missingNumber === null || room.debugMode) return 0;
  const players = room.players.filter((player) => !player.isDummy);
  const eventId = `nigoichi:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "nigoichi", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: players.length }, async () => {
    const outcomes = players.map((player) => ({ playerId: player.id, won: room.guesses[player.id] === room.missingNumber, performanceScore: room.roundScores[player.id]?.roundScore ?? 0 }));
    const ratings = await recordGameRatings("nigoichi", eventId, outcomes);
    return recordPlayerResults(players.map((player) => {
      const won = room.guesses[player.id] === room.missingNumber;
      const score = room.roundScores[player.id];
      const rating = ratings.get(player.id);
      return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "nigoichi", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, won, resultLabel: score ? `${score.roundScore >= 0 ? "+" : ""}${score.roundScore}点（累計${score.totalScoreAfterRound}点）` : won ? "余り番号を正解" : "不正解", playerCount: players.length, details: { guess: room.guesses[player.id] ?? -1, missingNumber: room.missingNumber, cardsPerPlayer: room.cardsPerPlayer, associationWordCount: room.associationWordCount, totalCards: room.words.length, wordDifficulty: room.wordDifficulty, correctBonus: score?.correctBonus ?? 0, receivedWrongVotes: score?.receivedWrongVotes ?? 0, roundScore: score?.roundScore ?? 0, totalScoreAfterRound: score?.totalScoreAfterRound ?? room.totalScores[player.id] ?? 0 }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function recordCodeInterceptGameResults(room: CodeInterceptRoom) {
  if (room.phase !== "game-result" || !room.winner || room.debugMode) return 0;
  const players = room.players.filter((player) => !player.isDummy);
  const eventId = `code-intercept:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "code-intercept", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: players.length }, async () => {
    const outcomes = players.map((player) => {
      const team = room.teams.find((item) => item.id === player.teamId);
      const won = room.winner !== "draw" && room.winner === player.teamId;
      return { playerId: player.id, won, performanceScore: room.winner === "draw" ? 0 : team?.points ?? 0 };
    });
    const ratings = await recordGameRatings("code-intercept", eventId, outcomes);
    return recordPlayerResults(players.map((player) => {
      const team = room.teams.find((item) => item.id === player.teamId);
      const won = room.winner !== "draw" && room.winner === player.teamId;
      const rating = ratings.get(player.id);
      const resultLabel = room.winner === "draw" ? "引き分け" : won ? "チーム勝利" : "チーム敗北";
      return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "code-intercept", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, won, draw: room.winner === "draw", resultLabel: `${resultLabel}・残り${team?.points ?? 0}点`, playerCount: players.length, details: { team: player.teamId, remainingPoints: team?.points ?? 0, rounds: room.roundNumber, draw: room.winner === "draw" }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function getPlayerStats(playerId: string, gameFilter: PlayerStatsGameFilter = "all"): Promise<PlayerStatsResponse> {
  const gameTypes: PlayerStatsGameType[] = ["wordwolf", "tahoiya", "northern-branch", "hodoai", "kotoba-senpuku", "nigoichi", "code-intercept"];
  const postgresEnabled = isPostgresConfigured();
  const [postgresResults, postgresRatingStates, rawResults, ...storedRatings] = await Promise.all([
    postgresEnabled ? loadPostgresPlayerResults(playerId, 200).catch(() => []) : Promise.resolve([]),
    postgresEnabled ? loadPostgresPlayerRatingStates(playerId).catch(() => new Map()) : Promise.resolve(new Map()),
    redisCommand<string[]>(["ZREVRANGE", playerResultsKey(playerId), 0, 199]).catch((error) => {
      if (postgresEnabled) return [];
      throw error;
    }),
    ...gameTypes.map((gameType) => redisCommand<string | null>(["HGET", playerRatingKey(gameType), playerId]).catch((error) => {
      if (postgresEnabled) return null;
      throw error;
    })),
  ]);
  const redisResults = rawResults.map(parseResult).filter((result): result is PlayerGameResult => Boolean(result));
  const results = mergePlayerGameResults(postgresResults, redisResults);
  if (postgresEnabled) {
    const postgresIds = new Set(postgresResults.map((result) => result.id));
    const legacyResults = redisResults.filter((result) => !postgresIds.has(result.id));
    if (legacyResults.length > 0) await savePostgresPlayerResults(legacyResults).catch(() => undefined);
  }
  const filteredResults = gameFilter === "all" ? results : results.filter((result) => result.gameType === gameFilter);
  const todayStart = startOfToday(); const monthStart = startOfMonth();
  const ratings = buildPlayedGameRatings({ gameTypes, results, storedRatings, postgresStates: postgresRatingStates, initialRating: initialGameRating });
  return { today: summarize(filteredResults.filter((result) => result.finishedAt >= todayStart)), month: summarize(filteredResults.filter((result) => result.finishedAt >= monthStart)), total: filteredResults.length > 0 ? summarize(filteredResults) : emptySummary(), recent: filteredResults.slice(0, 10), ratings };
}
