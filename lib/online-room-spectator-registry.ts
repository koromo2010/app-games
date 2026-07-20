import { loadStoredCodeInterceptRoom } from "./code-intercept-room-store.ts";
import { loadStoredDaifugoRoom } from "./daifugo-room-store.ts";
import { loadAndReconcileHodoaiRoom } from "./hodoai-room-store.ts";
import { loadAndReconcileKotobaSenpukuRoom } from "./kotoba-senpuku-room-store.ts";
import { loadStoredNigoichiRoom } from "./nigoichi-room-store.ts";
import { loadStoredNorthernRoom } from "./northern-branch-room-store.ts";
import { onlineRoomRealtimeGames, type OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { presentOnlineRoomForSpectator } from "./online-room-spectator.ts";
import { loadAndReconcileStoredTahoiyaRoom } from "./tahoiya-room-store.ts";
import { loadStoredWordWolfRoom } from "./wordwolf-room-store.ts";

export type SpectatorSourceRoom = {
  code: string;
  contentLocale?: unknown;
  hostId: string;
  passphrase: string;
  phase: string;
  players: Array<{ id: string; isDummy?: boolean; teamId?: string }>;
  revision: number;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
};

type Loader = (code: string) => Promise<unknown | null>;

const loaders: Record<OnlineRoomRealtimeGame, Loader> = {
  wordwolf: loadStoredWordWolfRoom,
  tahoiya: loadAndReconcileStoredTahoiyaRoom,
  hodoai: loadAndReconcileHodoaiRoom,
  "kotoba-senpuku": loadAndReconcileKotobaSenpukuRoom,
  nigoichi: loadStoredNigoichiRoom,
  "northern-branch": loadStoredNorthernRoom,
  "code-intercept": loadStoredCodeInterceptRoom,
  daifugo: loadStoredDaifugoRoom,
};

const gameSet = new Set<string>(onlineRoomRealtimeGames);

export function parseOnlineRoomSpectatorGame(value: unknown): OnlineRoomRealtimeGame | null {
  return typeof value === "string" && gameSet.has(value) ? value as OnlineRoomRealtimeGame : null;
}

export async function loadOnlineRoomForSpectator(game: OnlineRoomRealtimeGame, code: string) {
  return await loaders[game](code) as SpectatorSourceRoom | null;
}

export function onlineRoomSpectatorSnapshot(game: OnlineRoomRealtimeGame, room: SpectatorSourceRoom) {
  return presentOnlineRoomForSpectator(game, room);
}
