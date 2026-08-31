import { loadStoredCodeInterceptRoom } from "./code-intercept-room-store.ts";
import { loadStoredDaifugoRoom } from "./daifugo-room-store.ts";
import { loadAndReconcileHodoaiRoom } from "./hodoai-room-store.ts";
import { loadAndReconcileKotobaSenpukuRoom } from "./kotoba-senpuku-room-store.ts";
import { loadStoredNigoichiRoom } from "./nigoichi-room-store.ts";
import { loadStoredNorthernRoom } from "./northern-branch-room-store.ts";
import {
  normalizeOnlineRoomRealtimeGame,
  type OnlineRoomRealtimeGame,
} from "./online-room-realtime-protocol.ts";
import {
  localizeOnlineRoomSpectatorSnapshot,
  presentOnlineRoomForSpectator,
  type OnlineRoomSpectatorSnapshot,
} from "./online-room-spectator.ts";
import type { AppLocale } from "./app-locale.ts";
import { loadAndReconcileStoredTahoiyaRoom } from "./tahoiya-room-store.ts";
import { loadStoredWordWolfRoom } from "./wordwolf-room-store.ts";
import { approvedGameSdkRegistration } from "./game-sdk-server-registry.ts";
import { loadApprovedGameSdkRuntimeRegistration } from "./game-sdk-runtime-catalog.ts";
import { createRedisGameSdkPlatformRoomStore } from "./game-sdk-platform-room-store.ts";

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
  roomInstanceId?: string;
  gameTitle?: string;
  [key: string]: unknown;
};

type Loader = (code: string) => Promise<unknown | null>;

const loaders: Partial<Record<OnlineRoomRealtimeGame, Loader>> = {
  wordwolf: loadStoredWordWolfRoom,
  tahoiya: loadAndReconcileStoredTahoiyaRoom,
  hodoai: loadAndReconcileHodoaiRoom,
  "kotoba-senpuku": loadAndReconcileKotobaSenpukuRoom,
  nigoichi: loadStoredNigoichiRoom,
  "northern-branch": loadStoredNorthernRoom,
  "code-intercept": loadStoredCodeInterceptRoom,
  daifugo: loadStoredDaifugoRoom,
};

export function parseOnlineRoomSpectatorGame(value: unknown): OnlineRoomRealtimeGame | null {
  return normalizeOnlineRoomRealtimeGame(value);
}

export async function loadOnlineRoomForSpectator(
  game: OnlineRoomRealtimeGame,
  code: string,
): Promise<SpectatorSourceRoom | null> {
  if (game.startsWith("sdk:")) {
    const gameId = game.slice(4);
    const registration = approvedGameSdkRegistration(gameId)
      ?? await loadApprovedGameSdkRuntimeRegistration(gameId);
    if (!registration?.supportsSpectators) return null;
    const record = await createRedisGameSdkPlatformRoomStore<{
      code: string;
      revision: number;
      phase: string;
      hostPlayerId: string;
      players: Array<{
        id: string;
        displayName: string;
        connected: boolean;
      }>;
      timer?: {
        durationSeconds: number;
        deadlineAt: number | null;
      };
      standardResult?: {
        winnerIds: string[];
        rankings: Array<{
          participantId: string;
          rank: number;
          score: number;
        }>;
        reason: string;
      };
    }>(gameId).load(code);
    if (!record) return null;
    return {
      code: record.code,
      contentLocale: undefined,
      hostId: record.hostPlayerId,
      passphrase: "",
      phase: record.phase,
      players: record.room.players,
      gameTitle: registration.title,
      timer: record.room.timer,
      standardResult: record.room.standardResult,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      roomInstanceId: record.creationRequestId,
    } satisfies SpectatorSourceRoom;
  }
  const loader = loaders[game];
  return loader ? await loader(code) as SpectatorSourceRoom | null : null;
}

export function onlineRoomSpectatorSnapshot(game: OnlineRoomRealtimeGame, room: SpectatorSourceRoom, locale: AppLocale = "ja") {
  if (game.startsWith("sdk:")) {
    const timer = room.timer && typeof room.timer === "object"
      ? room.timer as { durationSeconds?: unknown; deadlineAt?: unknown }
      : null;
    const result = room.standardResult && typeof room.standardResult === "object"
      ? room.standardResult as {
          rankings?: Array<{ participantId?: unknown; rank?: unknown; score?: unknown }>;
          reason?: unknown;
        }
      : null;
    const rankingByPlayer = new Map(
      (Array.isArray(result?.rankings) ? result.rankings : [])
        .filter((ranking): ranking is {
          participantId: string;
          rank: number;
          score: number;
        } => (
          typeof ranking.participantId === "string"
          && typeof ranking.rank === "number"
          && typeof ranking.score === "number"
        ))
        .map((ranking) => [ranking.participantId, ranking]),
    );
    return localizeOnlineRoomSpectatorSnapshot({
      game,
      gameTitle: room.gameTitle ?? "SDKゲーム",
      code: room.code,
      phase: room.phase,
      phaseLabel: room.phase === "lobby"
        ? "ロビー"
        : room.phase === "result"
          ? "結果"
          : "対戦中",
      revision: room.revision,
      updatedAt: room.updatedAt,
      players: room.players.map((player, index) => {
        const ranking = rankingByPlayer.get(player.id);
        return {
          seatId: `P${index + 1}`,
          label: `PLAYER ${index + 1}`,
          isHost: player.id === room.hostId,
          ...(ranking ? {
            status: `${ranking.rank}位`,
            metric: `${ranking.score}点`,
          } : {}),
        };
      }),
      facts: [
        ...(typeof timer?.durationSeconds === "number" ? [{
          label: "制限時間",
          value: timer.durationSeconds === 0
            ? "なし"
            : `${timer.durationSeconds}秒`,
        }] : []),
        ...(room.phase === "result" && typeof result?.reason === "string" ? [{
          label: "終了理由",
          value: result.reason.slice(0, 120),
        }] : []),
      ],
    } satisfies OnlineRoomSpectatorSnapshot, locale);
  }
  return localizeOnlineRoomSpectatorSnapshot(presentOnlineRoomForSpectator(game, room), locale);
}
