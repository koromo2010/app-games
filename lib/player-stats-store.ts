import { redisCommand } from "@/lib/redis-store";
import type { WordWolfRoom } from "@/lib/wordwolf-room-store";

export type PlayerGameResult = {
  schemaVersion: 1;
  id: string;
  gameType: "wordwolf";
  roomCode: string;
  roomCreatedAt: number;
  gameNumber: number;
  finishedAt: number;
  playerId: string;
  playerName: string;
  role: "village" | "wolf" | "no-wolf";
  won: boolean;
  winner: "village" | "wolf" | "players";
  gameMode: WordWolfRoom["gameMode"];
  hadWolf: boolean;
  accusedId: string | null;
  playerCount: number;
  roundsTotal: number;
  topicDictionarySource: WordWolfRoom["topicDictionarySource"];
  topicPairDistance: WordWolfRoom["topicPairDistance"];
};

export type PlayerStatsSummary = {
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type PlayerStatsResponse = {
  today: PlayerStatsSummary;
  month: PlayerStatsSummary;
  total: PlayerStatsSummary;
  recent: PlayerGameResult[];
};

export type PlayerStatsGameFilter = "all" | PlayerGameResult["gameType"];

const playerResultsKeyPrefix = "player-results:";
const resultEventKeyPrefix = "game-result-event:";

function playerResultsKey(playerId: string) {
  return `${playerResultsKeyPrefix}${playerId}`;
}

function resultEventKey(resultId: string) {
  return `${resultEventKeyPrefix}${resultId}`;
}

function emptySummary(): PlayerStatsSummary {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
  };
}

function summarize(results: PlayerGameResult[]): PlayerStatsSummary {
  const played = results.length;
  const wins = results.filter((result) => result.won).length;
  return {
    played,
    wins,
    losses: played - wins,
    winRate: played > 0 ? Math.round((wins / played) * 1000) / 10 : 0,
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function parseResult(value: unknown): PlayerGameResult | null {
  if (!value || typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as Partial<PlayerGameResult>;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.gameType !== "wordwolf" ||
      typeof parsed.id !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.finishedAt !== "number" ||
      typeof parsed.won !== "boolean"
    ) {
      return null;
    }

    return parsed as PlayerGameResult;
  } catch {
    return null;
  }
}

export function normalizePlayerStatsGameFilter(value: unknown): PlayerStatsGameFilter {
  return value === "wordwolf" ? "wordwolf" : "all";
}

function didPlayerWin(room: WordWolfRoom, playerId: string) {
  if (room.winner === "players") {
    return room.accusedId ? playerId !== room.accusedId : true;
  }

  if (room.winner === "village") {
    return playerId !== room.wolfId;
  }

  return playerId === room.wolfId;
}

function playerRole(room: WordWolfRoom, playerId: string): PlayerGameResult["role"] {
  if (!room.wolfId) return "no-wolf";
  return playerId === room.wolfId ? "wolf" : "village";
}

export async function recordWordWolfGameResults(room: WordWolfRoom) {
  if (room.phase !== "result" || !room.winner) return 0;

  const winner = room.winner;
  const finishedAt = room.updatedAt || Date.now();
  const results: PlayerGameResult[] = room.players.map((player) => ({
    schemaVersion: 1,
    id: `wordwolf:${room.code}:${room.createdAt}:${room.gameNumber}:${player.id}`,
    gameType: "wordwolf",
    roomCode: room.code,
    roomCreatedAt: room.createdAt,
    gameNumber: room.gameNumber,
    finishedAt,
    playerId: player.id,
    playerName: player.name,
    role: playerRole(room, player.id),
    won: didPlayerWin(room, player.id),
    winner,
    gameMode: room.gameMode,
    hadWolf: Boolean(room.wolfId),
    accusedId: room.accusedId,
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    topicDictionarySource: room.topicDictionarySource,
    topicPairDistance: room.topicPairDistance,
  }));

  let recorded = 0;
  for (const result of results) {
    const created = await redisCommand<"OK" | null>([
      "SET",
      resultEventKey(result.id),
      "1",
      "NX",
    ]);
    if (created !== "OK") continue;

    await redisCommand<number>([
      "ZADD",
      playerResultsKey(result.playerId),
      result.finishedAt,
      JSON.stringify(result),
    ]);
    recorded += 1;
  }

  return recorded;
}

export async function getPlayerStats(
  playerId: string,
  gameFilter: PlayerStatsGameFilter = "all",
): Promise<PlayerStatsResponse> {
  const rawResults = await redisCommand<string[]>([
    "ZREVRANGE",
    playerResultsKey(playerId),
    0,
    199,
  ]);
  const results = rawResults
    .map(parseResult)
    .filter((result): result is PlayerGameResult => Boolean(result));
  const filteredResults =
    gameFilter === "all" ? results : results.filter((result) => result.gameType === gameFilter);
  const todayStart = startOfToday();
  const monthStart = startOfMonth();

  return {
    today: summarize(filteredResults.filter((result) => result.finishedAt >= todayStart)),
    month: summarize(filteredResults.filter((result) => result.finishedAt >= monthStart)),
    total: filteredResults.length > 0 ? summarize(filteredResults) : emptySummary(),
    recent: filteredResults.slice(0, 10),
  };
}
