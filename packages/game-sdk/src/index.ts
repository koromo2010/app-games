export const GAME_SDK_VERSION = 1 as const;

export type GameSdkLocale = "ja" | "en";
export type GameSdkPlayMode = "online-room" | "local-pass-and-play";
export type GameSdkPhase = "entry" | "lobby" | "playing" | "result";
export type GameSdkViewerRole = "host" | "player" | "spectator" | "anonymous";

export type GameSdkRoomPlayer = {
  id: string;
  displayName: string;
  joinedAt: number;
  connected: boolean;
};

export type GameSdkOnlineRoomPhase = "lobby" | "playing" | "result";

/** Platform-owned room fields shared by every online-room game package. */
export type GameSdkOnlineRoomState<TSettings> = GameSdkStoredRoom & {
  phase: GameSdkOnlineRoomPhase | string;
  hostPlayerId: string;
  players: GameSdkRoomPlayer[];
  settings: TSettings;
};

export type GameSdkSettingDefinition = {
  key: string;
  label: Record<GameSdkLocale, string>;
  type: "boolean" | "number" | "select" | "text";
  required?: boolean;
  minimum?: number;
  maximum?: number;
  options?: readonly (string | number)[];
};

export type GameSdkManifest = {
  sdkVersion: typeof GAME_SDK_VERSION;
  id: string;
  title: Record<GameSdkLocale, string>;
  playMode: GameSdkPlayMode;
  minimumPlayers: number;
  maximumPlayers: number;
  supportsDebug: boolean;
  supportsSpectators: boolean;
  supportsReplay: boolean;
  supportsRating: boolean;
  usesLlm: boolean;
  settings?: readonly GameSdkSettingDefinition[];
};

/**
 * A viewer identity already resolved by the platform. Game packages may use it
 * to project a safe room view, but must never construct it from request JSON.
 */
export type GameSdkViewer = {
  playerId: string | null;
  role: GameSdkViewerRole;
  debugAccess: boolean;
};

/** A signed-in actor resolved from the platform session, not from a Command payload. */
export type GameSdkTrustedActor = {
  playerId: string;
  displayName: string;
  role: "host" | "player";
  debugAccess: boolean;
};

/** Minimum persistence shape understood by the SDK Runtime. */
export type GameSdkStoredRoom = {
  code: string;
  revision: number;
  phase: string;
};

/** The only room shape exposed across the client Runtime boundary. */
export type GameSdkRoomSnapshot<TRoomView> = {
  code: string;
  revision: number;
  phase: string;
  view: TRoomView;
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

export type GameSdkCommandEnvelope<TCommand extends { type: string }> = {
  expectedRevision: number;
  command: TCommand;
};

export type GameSdkCommandResult<TRoomView> = {
  room: GameSdkRoomSnapshot<TRoomView>;
  revision: number;
};

export type GameSdkRoomListItem = {
  code: string;
  phase: string;
  revision: number;
  playerCount: number;
  maximumPlayers: number;
  updatedAt: number;
};

export type GameSdkRoomListPage = {
  rooms: GameSdkRoomListItem[];
  nextCursor: string | null;
};

/** Commands whose authorization and state transition are identical across games. */
export type GameSdkRoomLifecycleCommand<TSettings> =
  | { type: "room/join" }
  | { type: "room/leave" }
  | { type: "room/update-settings"; settings: Partial<TSettings> }
  | { type: "room/abort" }
  | { type: "room/rematch" };

/**
 * Browser-facing Runtime injected by Game Fields. Actor identity is omitted on
 * purpose: the platform derives it from the signed HttpOnly session.
 */
export type GameSdkClientRuntime<TCreateInput, TCommand extends { type: string }, TRoomView> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readActiveRoom(): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  listRooms(cursor?: string | null): Promise<GameSdkRoomListPage>;
  sendCommand(
    code: string,
    envelope: GameSdkCommandEnvelope<TCommand>,
  ): Promise<GameSdkCommandResult<TRoomView>>;
  dissolveRoom(code: string): Promise<boolean>;
  dissolveHostedRooms(): Promise<number>;
  watchRoom(
    code: string,
    observer: {
      onRoom(room: GameSdkRoomSnapshot<TRoomView> | null): void;
      onError?(error: unknown): void;
      onStatus?(status: "connecting" | "connected" | "polling" | "closed"): void;
    },
  ): { close(): void };
};

export function assertGameManifest(manifest: GameSdkManifest): void {
  if (manifest.sdkVersion !== GAME_SDK_VERSION) {
    throw new Error(`Unsupported Game SDK version: ${String(manifest.sdkVersion)}`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error("Game SDK manifest id must use lowercase letters, digits, and hyphens.");
  }
  for (const locale of ["ja", "en"] satisfies GameSdkLocale[]) {
    if (typeof manifest.title[locale] !== "string" || manifest.title[locale].trim().length === 0) {
      throw new Error(`Game SDK manifest title.${locale} must not be empty.`);
    }
  }
  if (!Number.isInteger(manifest.minimumPlayers) || manifest.minimumPlayers < 1) {
    throw new Error("Game SDK manifest minimumPlayers must be a positive integer.");
  }
  if (!Number.isInteger(manifest.maximumPlayers) || manifest.maximumPlayers < manifest.minimumPlayers) {
    throw new Error("Game SDK manifest maximumPlayers must be an integer at least minimumPlayers.");
  }
  if (!(["online-room", "local-pass-and-play"] as const).includes(manifest.playMode)) {
    throw new Error("Game SDK manifest playMode is not supported.");
  }
  for (const field of [
    "supportsDebug",
    "supportsSpectators",
    "supportsReplay",
    "supportsRating",
    "usesLlm",
  ] as const) {
    if (typeof manifest[field] !== "boolean") {
      throw new Error(`Game SDK manifest ${field} must be boolean.`);
    }
  }
  const settingKeys = new Set<string>();
  for (const setting of manifest.settings ?? []) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(setting.key) || settingKeys.has(setting.key)) {
      throw new Error("Game SDK manifest setting keys must be unique camelCase identifiers.");
    }
    settingKeys.add(setting.key);
    if (!setting.label.ja.trim() || !setting.label.en.trim()) {
      throw new Error(`Game SDK manifest setting ${setting.key} requires ja/en labels.`);
    }
    if (setting.type === "select" && (!setting.options || setting.options.length === 0)) {
      throw new Error(`Game SDK manifest select setting ${setting.key} requires options.`);
    }
  }
}

export function defineGameManifest<const TManifest extends GameSdkManifest>(manifest: TManifest) {
  assertGameManifest(manifest);
  return manifest;
}
