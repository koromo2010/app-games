import type { AppLocale } from "./app-locale";

export type GameSdkPlayMode = "online-room" | "local-pass-and-play";
export type GameSdkPhase = "entry" | "lobby" | "playing" | "result";

export type GameSdkManifest = {
  id: string;
  title: Record<AppLocale, string>;
  playMode: GameSdkPlayMode;
  minimumPlayers: number;
  maximumPlayers: number;
  supportsDebug: boolean;
  supportsSpectators: boolean;
  supportsReplay: boolean;
  supportsRating: boolean;
  usesLlm: boolean;
};

export type GameSdkViewPermissions = {
  canStartGame: boolean;
  canEditRoomSettings: boolean;
  canAbort: boolean;
  canDebug: boolean;
  canSeeSecret: boolean;
};

export type GameSdkController<
  TState,
  TActions,
  TSession,
  TViewModel,
  TPermissions extends GameSdkViewPermissions = GameSdkViewPermissions,
> = {
  state: TState;
  actions: TActions;
  session: TSession;
  viewModel: TViewModel;
  permissions: TPermissions;
};

export type GameSdkCommand<TType extends string = string, TPayload = unknown> = {
  type: TType;
  payload?: TPayload;
};

export type GameSdkCommandResult<TRoom> = {
  room: TRoom;
  revision: number;
};

export function defineGameManifest<const TManifest extends GameSdkManifest>(manifest: TManifest) {
  return manifest;
}
