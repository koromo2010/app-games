import type {
  GameSdkRoomSnapshot,
  GameSdkSettingDefinition,
  GameSdkSettingValue,
} from "@game-fields/game-sdk";
import type { VisibleGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import type { createGameSdkHttpClientRuntime } from "@game-fields/game-sdk/client-runtime";

export type CommonView = {
  phase: string;
  players: Array<{
    seat: number;
    displayName: string;
    connected: boolean;
    isHost: boolean;
    isSelf: boolean;
    isDummy: boolean;
    reducedTime: boolean;
  }>;
  settings: Record<string, GameSdkSettingValue>;
  pendingLobbyReturnSeats: number[];
  minimumPlayers: number;
  maximumPlayers: number;
  isHost: boolean;
  permissions: {
    canStartGame: boolean;
    canEditRoomSettings: boolean;
    canAbort: boolean;
    canDebug: boolean;
    canDebugActAsDummy?: boolean;
    canDebugAutoProgress?: boolean;
  };
  timer?: {
    durationSeconds: number;
    startedAt: number | null;
    deadlineAt: number | null;
    turnSequence: number;
    ownerSeat?: number | null;
  };
  standardResult?: {
    winnerSeats: number[];
    rankings: Array<{
      seat: number;
      displayName: string;
      rank: number;
      score: number;
      isSelf: boolean;
    }>;
    reason: string;
    presentation?: {
      reason: { ja: string; en: string };
      highlights?: Array<{ ja: string; en: string }>;
      playLog?: Array<{ ja: string; en: string }>;
    };
  };
};

export type PackageRoomView = {
  common: CommonView;
  app: unknown;
};

export type PackageRoom = GameSdkRoomSnapshot<PackageRoomView>;
export type SafeCommand = { type: string; [key: string]: unknown };
export type DebugViewer = "self" | "spectator" | number;
export type DebugAutoProgressTarget = "step" | "phase" | "result";

/**
 * Shape returned by `wrapGameSdkDebugCommand` (lib/game-sdk-debug-control-target.ts,
 * unchanged) when the active DEBUG viewer is acting as a dummy seat: the
 * original command gets wrapped one level deeper instead of being sent as-is.
 * Declared here so `use-game-sdk-command-runner.ts`'s `wrapDebugCommand`
 * option can express its true return type instead of erasing it to `TCommand`.
 */
export type DebugWrappedCommand<TCommand extends SafeCommand = SafeCommand> = {
  type: "room/debug-act-as-dummy";
  seat: number;
  command: TCommand;
};

/** Concrete runtime type used throughout the split GameSdkFrame modules. */
export type GameSdkFrameRuntime = ReturnType<typeof createGameSdkHttpClientRuntime<
  { settings?: Record<string, GameSdkSettingValue>; app: Record<string, never> },
  SafeCommand,
  PackageRoomView
>>;

export type GameSdkFrameProps = {
  backHref: string;
  creatorSlug?: string;
  endpoint?: string;
  gameId: string;
  packageRevision: string;
  runtimeId: string;
  runtimeUrl: string;
  title: string;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  rules: readonly string[];
  moduleProfile: VisibleGameSdkModuleProfile;
  supportsReplay: boolean;
  supportsSpectators: boolean;
  usesLlm: boolean;
  /** Candidate package Preview keeps state in its Preview session only. */
  previewOnly?: boolean;
};
