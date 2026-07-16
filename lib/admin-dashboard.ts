import type { AdminIssue } from "@/lib/admin-observability-store";
import type { GameOperation } from "@/lib/game-operations";
import type { WebVitalSummary } from "@/lib/web-vitals";

export type AdminGameActivity = {
  gameId: string;
  title: string;
  waitingRooms: number;
  playingRooms: number;
  finishedRooms: number;
  playerCount: number;
};

export type AdminDashboardSnapshot = {
  generatedAt: number;
  responseTimeMs: number;
  deployment: {
    commit: string | null;
    environment: string;
    region: string | null;
  };
  services: {
    redis: "healthy" | "unavailable" | "not-configured";
    roomUpdates: "healthy" | "degraded";
  };
  onlinePlayers: number;
  rooms: {
    total: number;
    waiting: number;
    playing: number;
    finished: number;
  };
  games: AdminGameActivity[];
  issues: {
    errors24h: number;
    warnings24h: number;
    recent: AdminIssue[];
  };
  webVitals: {
    sampleCount24h: number;
    summaries: WebVitalSummary[];
  };
  gameOperations: GameOperation[];
};
