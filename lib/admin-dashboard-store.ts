import registry from "@/config/game-registry.json";
import { loadAdminIssues } from "@/lib/admin-observability-store";
import type { AdminDashboardCore, AdminDashboardDetails, AdminDashboardSnapshot, AdminGameActivity } from "@/lib/admin-dashboard";
import { loadGameOperations } from "@/lib/game-operations-store";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { summarizeWebVitals } from "@/lib/web-vitals";
import { loadWebVitalSamples } from "@/lib/web-vitals-store";
import { loadAdminStorageUsage, type StorageUsageSnapshot } from "@/lib/storage-capacity-monitor";

type GenericRoom = {
  phase?: unknown;
  updatedAt?: unknown;
  players?: unknown;
};

const roomDefinitions = [
  { gameId: "wordwolf", indexKey: "wordwolf:rooms", roomPrefix: "wordwolf:room:" },
  { gameId: "tahoiya", indexKey: "tahoiya:rooms", roomPrefix: "tahoiya:room:" },
  { gameId: "northern-branch", indexKey: "northern-branch:rooms", roomPrefix: "northern-branch:room:" },
  { gameId: "hodoai", indexKey: "hodoai:rooms", roomPrefix: "hodoai:room:" },
  { gameId: "kotoba-senpuku", indexKey: "kotoba-senpuku:rooms", roomPrefix: "kotoba-senpuku:room:" },
  { gameId: "nigoichi", indexKey: "nigoichi:rooms", roomPrefix: "nigoichi:room:" },
  { gameId: "code-intercept", indexKey: "code-intercept:rooms", roomPrefix: "code-intercept:room:" },
] as const;

function parseRoom(raw: string | null): GenericRoom | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value as GenericRoom : null;
  } catch {
    return null;
  }
}

function roomState(phase: string) {
  if (phase === "lobby") return "waiting" as const;
  if (/result|finish/i.test(phase)) return "finished" as const;
  return "playing" as const;
}

function realPlayerIds(room: GenericRoom) {
  if (!Array.isArray(room.players)) return [];
  return room.players.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const player = value as { id?: unknown; isDummy?: unknown };
    return typeof player.id === "string" && player.isDummy !== true ? [player.id] : [];
  });
}

async function loadGameActivity(definition: typeof roomDefinitions[number]) {
  const title = registry.find((game) => game.id === definition.gameId)?.title ?? definition.gameId;
  const empty: AdminGameActivity & { playerIds: string[] } = { gameId: definition.gameId, title, waitingRooms: 0, playingRooms: 0, finishedRooms: 0, playerCount: 0, playerIds: [] };
  try {
    const codes = await redisCommand<string[]>(["SMEMBERS", definition.indexKey]);
    if (!codes.length) return empty;
    const values = await redisCommand<(string | null)[]>(["MGET", ...codes.map((code) => `${definition.roomPrefix}${code}`)]);
    const rooms = values.map(parseRoom).filter((room): room is GenericRoom => Boolean(
      room
      && typeof room.updatedAt === "number"
      && !isMultiplayerRoomExpired(room.updatedAt)
    ));
    const playerIds = rooms.flatMap(realPlayerIds);
    const result = { ...empty, playerIds, playerCount: new Set(playerIds).size };
    for (const room of rooms) {
      const state = roomState(typeof room.phase === "string" ? room.phase : "unknown");
      if (state === "waiting") result.waitingRooms += 1;
      else if (state === "finished") result.finishedRooms += 1;
      else result.playingRooms += 1;
    }
    return result;
  } catch {
    return empty;
  }
}

export async function loadAdminDashboardCore(): Promise<AdminDashboardCore> {
  const startedAt = Date.now();
  let redisStatus: AdminDashboardSnapshot["services"]["redis"] = getRedisConfig() ? "healthy" : "not-configured";
  if (getRedisConfig()) {
    try {
      await redisCommand<number>(["DBSIZE"]);
    } catch {
      redisStatus = "unavailable";
    }
  }

  const [activityWithIds, gameOperations] = await Promise.all([
    redisStatus === "healthy" ? Promise.all(roomDefinitions.map(loadGameActivity)) : Promise.resolve([]),
    loadGameOperations({ fresh: true }),
  ]);
  const onlinePlayerIds = new Set(activityWithIds.flatMap((game) => game.playerIds));
  const games = activityWithIds.map((game) => ({
    gameId: game.gameId,
    title: game.title,
    waitingRooms: game.waitingRooms,
    playingRooms: game.playingRooms,
    finishedRooms: game.finishedRooms,
    playerCount: game.playerCount,
  }));
  const rooms = games.reduce((total, game) => ({
    waiting: total.waiting + game.waitingRooms,
    playing: total.playing + game.playingRooms,
    finished: total.finished + game.finishedRooms,
  }), { waiting: 0, playing: 0, finished: 0 });

  return {
    generatedAt: Date.now(),
    responseTimeMs: Date.now() - startedAt,
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      region: process.env.VERCEL_REGION ?? null,
    },
    services: {
      redis: redisStatus,
      roomUpdates: redisStatus === "healthy" ? "healthy" : "degraded",
    },
    onlinePlayers: onlinePlayerIds.size,
    rooms: { ...rooms, total: rooms.waiting + rooms.playing + rooms.finished },
    games,
    gameOperations,
  };
}

export async function loadAdminDashboardDetails(): Promise<AdminDashboardDetails> {
  const redisAvailable = Boolean(getRedisConfig());
  const [issues, samples, storage] = await Promise.all([
    redisAvailable ? loadAdminIssues(100).catch(() => []) : Promise.resolve([]),
    redisAvailable ? loadWebVitalSamples(1_000).catch(() => []) : Promise.resolve([]),
    loadAdminStorageUsage().catch((): StorageUsageSnapshot => ({ checkedAt: Date.now(), threshold: 80, results: [], unavailable: ["Neon Postgres", "Upstash Redis", "Vercel Blob"] })),
  ]);
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1_000;
  const recentIssues = issues.filter((issue) => issue.occurredAt >= cutoff24h);
  const recentSamples = samples.filter((sample) => sample.occurredAt >= cutoff24h);
  return {
    issues: {
      errors24h: recentIssues.filter((issue) => issue.level === "error").length,
      warnings24h: recentIssues.filter((issue) => issue.level === "warn").length,
      recent: issues.slice(0, 12),
    },
    webVitals: { sampleCount24h: recentSamples.length, summaries: summarizeWebVitals(recentSamples) },
    storage,
  };
}

export async function loadAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const [core, details] = await Promise.all([loadAdminDashboardCore(), loadAdminDashboardDetails()]);
  return { ...core, ...details };
}
