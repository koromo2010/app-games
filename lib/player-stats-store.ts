import { redisCommand } from "@/lib/redis-store";
import type { HodoaiRoom } from "@/lib/hodoai-talk";
import type { KotobaSenpukuRoom } from "@/lib/kotoba-senpuku";
import type { NorthernRoom } from "@/lib/northern-branch-types";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import type { WordWolfRoom } from "@/lib/wordwolf-room-store";
import { calculateGameRatingChanges, initialGameRating } from "@/lib/game-rating";
import { emitObservabilityEvent, observabilityErrorCode, observabilityRef, type ObservabilityFields } from "@/lib/observability";

export type PlayerStatsGameType = "wordwolf" | "tahoiya" | "northern-branch" | "hodoai" | "kotoba-senpuku";

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
  resultLabel: string;
  playerCount: number;
  role?: "village" | "wolf" | "no-wolf" | "answerer" | "writer" | "merchant" | "cooperator" | "infiltrator";
  details?: Record<string, string | number | boolean | null>;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingChange?: number;
};

export type PlayerStatsSummary = { played: number; wins: number; losses: number; winRate: number };
export type PlayerStatsResponse = { today: PlayerStatsSummary; month: PlayerStatsSummary; total: PlayerStatsSummary; recent: PlayerGameResult[]; ratings: Partial<Record<PlayerStatsGameType, number>> };
export type PlayerStatsGameFilter = "all" | PlayerStatsGameType;

const playerResultsKeyPrefix = "player-results:";
const resultEventKeyPrefix = "game-result-event:";
const playerRatingKey = (gameType: PlayerStatsGameType) => `player-rating:v1:${gameType}`;
const playerRatingGamesKey = (gameType: PlayerStatsGameType) => `player-rating-games:v1:${gameType}`;
const ratingEventKey = (eventId: string) => `rating-event:v1:${eventId}`;

type RatingOutcome = { playerId: string; won: boolean };
type RecordedRating = { before: number; after: number; change: number };

async function recordGameRatings(gameType: PlayerStatsGameType, eventId: string, outcomes: RatingOutcome[], cooperative = false) {
  const ids = outcomes.map((item) => item.playerId);
  const [stored, storedGames] = await Promise.all([
    redisCommand<Array<string | null>>(["HMGET", playerRatingKey(gameType), ...ids]),
    redisCommand<Array<string | null>>(["HMGET", playerRatingGamesKey(gameType), ...ids]),
  ]);
  const realPlayers = outcomes.map((item, index) => ({ ...item, rating: Number(stored[index]) || initialGameRating, gamesPlayed: Number(storedGames[index]) || 0 }));
  const hasWinner = realPlayers.some((item) => item.won); const hasLoser = realPlayers.some((item) => !item.won);
  const calculationPlayers = cooperative && (!hasWinner || !hasLoser)
    ? [...realPlayers, { playerId: "__system__", rating: initialGameRating, won: !hasWinner }]
    : realPlayers;
  const changes = calculateGameRatingChanges(calculationPlayers).filter((item) => item.playerId !== "__system__");
  const applied = await redisCommand<number[]>([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1])==1 then return {} end; local out={}; for i=3,#ARGV,2 do if redis.call('HEXISTS',KEYS[2],ARGV[i])==0 then redis.call('HSET',KEYS[2],ARGV[i],ARGV[2]) end; table.insert(out,redis.call('HINCRBY',KEYS[2],ARGV[i],ARGV[i+1])); redis.call('HINCRBY',KEYS[3],ARGV[i],1); end; redis.call('SET',KEYS[1],'1'); return out",
    "3", ratingEventKey(eventId), playerRatingKey(gameType), playerRatingGamesKey(gameType), eventId, String(initialGameRating),
    ...changes.flatMap((change) => [change.playerId, String(change.change)]),
  ]);
  const finalRatings = applied.length === changes.length ? applied : await redisCommand<Array<string | null>>(["HMGET", playerRatingKey(gameType), ...ids]).then((values) => values.map((value) => Number(value) || initialGameRating));
  return new Map(changes.map((change, index) => [change.playerId, { before: finalRatings[index] - change.change, after: finalRatings[index], change: change.change } satisfies RecordedRating]));
}
const playerResultsKey = (playerId: string) => `${playerResultsKeyPrefix}${playerId}`;
const resultEventKey = (resultId: string) => `${resultEventKeyPrefix}${resultId}`;

function emptySummary(): PlayerStatsSummary { return { played: 0, wins: 0, losses: 0, winRate: 0 }; }
function summarize(results: PlayerGameResult[]): PlayerStatsSummary {
  const played = results.length;
  const wins = results.filter((result) => result.won).length;
  return { played, wins, losses: played - wins, winRate: played > 0 ? Math.round((wins / played) * 1000) / 10 : 0 };
}
function startOfToday() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); }
function startOfMonth() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
function isPlayerStatsGameType(value: unknown): value is PlayerStatsGameType { return value === "wordwolf" || value === "tahoiya" || value === "northern-branch" || value === "hodoai" || value === "kotoba-senpuku"; }

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
  const points = Object.fromEntries(room.players.map((player) => [player.id, 0]));
  for (const [voterId, optionId] of Object.entries(room.votes)) {
    const option = room.options.find((item) => item.id === optionId);
    if (option?.isReal) points[voterId] = (points[voterId] ?? 0) + 2;
    else if (option?.authorId) points[option.authorId] = (points[option.authorId] ?? 0) + 1;
  }
  return points;
}

export async function recordTahoiyaRoundResults(room: TahoiyaRoom) {
  if (room.phase !== "result" || room.debugMode) return 0;
  const points = tahoiyaRoundPoints(room);
  const best = Math.max(0, ...Object.values(points));
  const eventId = `tahoiya:${room.code}:${room.createdAt}:${room.round}`;
  return observeStatsRecord({ game: "tahoiya", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), round: room.round, playerCount: room.players.length }, async () => {
    const ratings = await recordGameRatings("tahoiya", eventId, room.players.map((player) => ({ playerId: player.id, won: (points[player.id] ?? 0) === best })));
    return recordPlayerResults(room.players.map((player) => {
      const won = (points[player.id] ?? 0) === best;
      const rating = ratings.get(player.id);
      return { schemaVersion: 1, id: `tahoiya:${room.code}:${room.createdAt}:${room.round}:${player.id}`, gameType: "tahoiya", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.round, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: player.id === room.answererId ? "answerer" : "writer", won, resultLabel: won ? "ラウンド1位" : `${points[player.id] ?? 0}点`, playerCount: room.players.length, details: { roundPoints: points[player.id] ?? 0, word: room.word }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function recordHodoaiGameResults(room: HodoaiRoom) {
  if (room.phase !== "result" || room.round < room.roundsTotal || room.debugMode) return 0;
  const maxPoints = room.roundsTotal * 3;
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
    const ratings = await recordGameRatings("northern-branch", eventId, realPlayers.map((player) => ({ playerId: player.id, won: player.id === room.game?.winnerId })));
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
  const best = Math.max(0, ...realPlayers.map((player) => room.totalScores[player.id] ?? 0));
  const eventId = `kotoba-senpuku:${room.code}:${room.createdAt}:${room.gameNumber}`;
  return observeStatsRecord({ game: "kotoba-senpuku", operation: "record-results", roomRef: observabilityRef("room", room.code), eventRef: observabilityRef("event", eventId), gameNumber: room.gameNumber, playerCount: realPlayers.length }, async () => {
    const ratings = await recordGameRatings("kotoba-senpuku", eventId, realPlayers.map((player) => ({ playerId: player.id, won: (room.totalScores[player.id] ?? 0) === best })));
    return recordPlayerResults(realPlayers.map((player) => {
    const points = room.totalScores[player.id] ?? 0;
    const won = points === best;
    const rating = ratings.get(player.id);
    return { schemaVersion: 1, id: `${eventId}:${player.id}`, gameType: "kotoba-senpuku", roomCode: room.code, roomCreatedAt: room.createdAt, gameNumber: room.gameNumber, finishedAt: room.updatedAt || Date.now(), playerId: player.id, playerName: player.name, role: "infiltrator", won, resultLabel: won ? "総合1位" : `${points}点`, playerCount: realPlayers.length, details: { points }, ratingBefore: rating?.before, ratingAfter: rating?.after, ratingChange: rating?.change } satisfies PlayerGameResult;
    }));
  });
}

export async function getPlayerStats(playerId: string, gameFilter: PlayerStatsGameFilter = "all"): Promise<PlayerStatsResponse> {
  const gameTypes: PlayerStatsGameType[] = ["wordwolf", "tahoiya", "northern-branch", "hodoai", "kotoba-senpuku"];
  const [rawResults, ...storedRatings] = await Promise.all([
    redisCommand<string[]>(["ZREVRANGE", playerResultsKey(playerId), 0, 199]),
    ...gameTypes.map((gameType) => redisCommand<string | null>(["HGET", playerRatingKey(gameType), playerId])),
  ]);
  const results = rawResults.map(parseResult).filter((result): result is PlayerGameResult => Boolean(result));
  const filteredResults = gameFilter === "all" ? results : results.filter((result) => result.gameType === gameFilter);
  const todayStart = startOfToday(); const monthStart = startOfMonth();
  return { today: summarize(filteredResults.filter((result) => result.finishedAt >= todayStart)), month: summarize(filteredResults.filter((result) => result.finishedAt >= monthStart)), total: filteredResults.length > 0 ? summarize(filteredResults) : emptySummary(), recent: filteredResults.slice(0, 10), ratings: Object.fromEntries(gameTypes.map((gameType, index) => [gameType, Number(storedRatings[index]) || initialGameRating])) };
}
