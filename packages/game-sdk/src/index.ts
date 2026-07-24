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
  isDummy?: boolean;
};

export type GameSdkOnlineRoomPhase = "lobby" | "playing" | "result";

/** Platform-owned room fields shared by every online-room game package. */
export type GameSdkOnlineRoomState<TSettings> = GameSdkStoredRoom & {
  phase: GameSdkOnlineRoomPhase | string;
  hostPlayerId: string;
  players: GameSdkRoomPlayer[];
  settings: TSettings;
};

export type GameSdkSettingValue = string | number | boolean;
export type GameSdkSettingPlatformRole =
  | "time-limit"
  | "maximum-players"
  | "round-count";
export type GameSdkSettingOption = {
  value: string | number;
  label: Record<GameSdkLocale, string>;
};

export type GameSdkSettingDefinition = {
  key: string;
  label: Record<GameSdkLocale, string>;
  type: "boolean" | "number" | "select" | "text";
  defaultValue: GameSdkSettingValue;
  platformRole?: GameSdkSettingPlatformRole;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  options?: readonly (string | number | GameSdkSettingOption)[];
  unit?: Record<GameSdkLocale, string>;
  help?: Record<GameSdkLocale, string>;
};

export const DEFAULT_GAME_SDK_TIME_LIMIT_SETTING = {
  key: "timeLimitSeconds",
  label: {
    ja: "1手の制限時間",
    en: "Turn time limit",
  },
  type: "select",
  defaultValue: 60,
  platformRole: "time-limit",
  options: [0, 30, 60, 90, 120],
  unit: {
    ja: "秒",
    en: "s",
  },
} as const satisfies GameSdkSettingDefinition;

type ParseGameSdkSettingDefinitionsOptions = {
  requireTimeLimit?: boolean;
  legacyTimeLimitFallback?: boolean;
};

function localizedSettingText(
  value: unknown,
  field: string,
): Record<GameSdkLocale, string> {
  const candidate = value && typeof value === "object"
    ? value as Partial<Record<GameSdkLocale, unknown>>
    : {};
  if (
    typeof candidate.ja !== "string"
    || !candidate.ja.trim()
    || typeof candidate.en !== "string"
    || !candidate.en.trim()
  ) {
    throw new Error(`Game SDK setting ${field} requires ja/en text.`);
  }
  return {
    ja: candidate.ja.trim().slice(0, 120),
    en: candidate.en.trim().slice(0, 120),
  };
}

export function gameSdkSettingOptionValue(
  option: string | number | GameSdkSettingOption,
) {
  return typeof option === "object" ? option.value : option;
}

function settingValueMatchesType(
  value: unknown,
  type: GameSdkSettingDefinition["type"],
): value is GameSdkSettingValue {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "text") return typeof value === "string";
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function parseSettingOption(
  value: unknown,
  settingKey: string,
): string | number | GameSdkSettingOption {
  if (
    typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (!value || typeof value !== "object") {
    throw new Error(`Game SDK setting ${settingKey} has an invalid option.`);
  }
  const candidate = value as {
    value?: unknown;
    label?: unknown;
  };
  if (
    typeof candidate.value !== "string"
    && !(typeof candidate.value === "number" && Number.isFinite(candidate.value))
  ) {
    throw new Error(`Game SDK setting ${settingKey} has an invalid option value.`);
  }
  return {
    value: candidate.value,
    label: localizedSettingText(
      candidate.label,
      `${settingKey}.option.label`,
    ),
  };
}

function cloneDefaultTimeLimitSetting(): GameSdkSettingDefinition {
  return {
    ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING,
    label: { ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.label },
    options: [...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.options],
    unit: { ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.unit },
  };
}

export function parseGameSdkSettingDefinitions(
  value: unknown,
  options: ParseGameSdkSettingDefinitionsOptions = {},
): GameSdkSettingDefinition[] {
  if (
    options.legacyTimeLimitFallback
    && (!Array.isArray(value) || value.length === 0)
  ) {
    return [cloneDefaultTimeLimitSetting()];
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error("Game SDK settings must contain between 1 and 32 definitions.");
  }

  const keys = new Set<string>();
  const roles = new Set<GameSdkSettingPlatformRole>();
  const definitions = value.map((raw): GameSdkSettingDefinition => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Game SDK setting definition is invalid.");
    }
    const candidate = raw as Partial<GameSdkSettingDefinition>;
    const key = typeof candidate.key === "string" ? candidate.key.trim() : "";
    if (!/^[a-z][A-Za-z0-9]*$/.test(key) || keys.has(key)) {
      throw new Error("Game SDK setting keys must be unique camelCase identifiers.");
    }
    keys.add(key);
    const type = candidate.type;
    if (!type || !["boolean", "number", "select", "text"].includes(type)) {
      throw new Error(`Game SDK setting ${key} has an unsupported type.`);
    }
    if (!settingValueMatchesType(candidate.defaultValue, type)) {
      throw new Error(`Game SDK setting ${key} has an invalid defaultValue.`);
    }
    const platformRole = candidate.platformRole;
    if (
      platformRole
      && !["time-limit", "maximum-players", "round-count"].includes(platformRole)
    ) {
      throw new Error(`Game SDK setting ${key} has an unsupported platformRole.`);
    }
    if (platformRole && roles.has(platformRole)) {
      throw new Error(`Game SDK platformRole ${platformRole} must be unique.`);
    }
    if (platformRole) roles.add(platformRole);

    const minimum = candidate.minimum;
    const maximum = candidate.maximum;
    if (minimum !== undefined && !Number.isFinite(minimum)) {
      throw new Error(`Game SDK setting ${key} has an invalid minimum.`);
    }
    if (maximum !== undefined && !Number.isFinite(maximum)) {
      throw new Error(`Game SDK setting ${key} has an invalid maximum.`);
    }
    if (
      minimum !== undefined
      && maximum !== undefined
      && minimum > maximum
    ) {
      throw new Error(`Game SDK setting ${key} minimum exceeds maximum.`);
    }

    const parsedOptions = candidate.options === undefined
      ? undefined
      : (
          Array.isArray(candidate.options)
          && candidate.options.length > 0
          && candidate.options.length <= 64
        )
        ? candidate.options.map((option) => parseSettingOption(option, key))
        : (() => {
            throw new Error(`Game SDK setting ${key} has invalid options.`);
          })();
    if (type === "select" && !parsedOptions) {
      throw new Error(`Game SDK select setting ${key} requires options.`);
    }
    if (parsedOptions) {
      const optionValues = parsedOptions.map(gameSdkSettingOptionValue);
      const optionKeys = new Set(optionValues.map(
        (option) => `${typeof option}:${String(option)}`,
      ));
      if (optionKeys.size !== optionValues.length) {
        throw new Error(`Game SDK setting ${key} options must be unique.`);
      }
      const defaultKey = `${typeof candidate.defaultValue}:${String(candidate.defaultValue)}`;
      if (type === "select" && !optionKeys.has(defaultKey)) {
        throw new Error(`Game SDK setting ${key} options must include defaultValue.`);
      }
    }

    if (platformRole === "time-limit") {
      if (
        (type !== "number" && type !== "select")
        || typeof candidate.defaultValue !== "number"
        || !Number.isInteger(candidate.defaultValue)
        || candidate.defaultValue < 0
        || candidate.defaultValue > 3600
      ) {
        throw new Error("Game SDK time-limit must use integer seconds from 0 to 3600.");
      }
      if (
        (minimum !== undefined && (
          !Number.isInteger(minimum)
          || minimum < 0
          || minimum > 3600
        ))
        || (maximum !== undefined && (
          !Number.isInteger(maximum)
          || maximum < 0
          || maximum > 3600
        ))
      ) {
        throw new Error("Game SDK time-limit bounds must use integer seconds from 0 to 3600.");
      }
      for (const option of parsedOptions ?? []) {
        const optionValue = gameSdkSettingOptionValue(option);
        if (
          typeof optionValue !== "number"
          || !Number.isInteger(optionValue)
          || optionValue < 0
          || optionValue > 3600
        ) {
          throw new Error("Game SDK time-limit options must use integer seconds from 0 to 3600.");
        }
      }
    }
    if (
      (platformRole === "maximum-players" || platformRole === "round-count")
      && (
        (type !== "number" && type !== "select")
        || typeof candidate.defaultValue !== "number"
        || !Number.isInteger(candidate.defaultValue)
        || candidate.defaultValue < 1
      )
    ) {
      throw new Error(`Game SDK ${platformRole} must use a positive integer.`);
    }
    if (platformRole === "maximum-players" || platformRole === "round-count") {
      for (const option of parsedOptions ?? []) {
        const optionValue = gameSdkSettingOptionValue(option);
        if (
          typeof optionValue !== "number"
          || !Number.isInteger(optionValue)
          || optionValue < 1
        ) {
          throw new Error(`Game SDK ${platformRole} options must use positive integers.`);
        }
      }
    }
    if (
      typeof candidate.defaultValue === "number"
      && (
        (minimum !== undefined && candidate.defaultValue < minimum)
        || (maximum !== undefined && candidate.defaultValue > maximum)
      )
    ) {
      throw new Error(`Game SDK setting ${key} defaultValue is outside its bounds.`);
    }

    return {
      key,
      label: localizedSettingText(candidate.label, `${key}.label`),
      type,
      defaultValue: candidate.defaultValue,
      ...(platformRole ? { platformRole } : {}),
      ...(candidate.required === true ? { required: true } : {}),
      ...(minimum !== undefined ? { minimum } : {}),
      ...(maximum !== undefined ? { maximum } : {}),
      ...(parsedOptions ? { options: parsedOptions } : {}),
      ...(candidate.unit ? {
        unit: localizedSettingText(candidate.unit, `${key}.unit`),
      } : {}),
      ...(candidate.help ? {
        help: localizedSettingText(candidate.help, `${key}.help`),
      } : {}),
    };
  });

  const timeLimitCount = definitions.filter(
    (setting) => setting.platformRole === "time-limit",
  ).length;
  if (options.requireTimeLimit && timeLimitCount !== 1) {
    throw new Error("Game SDK online-room settings require one time-limit definition.");
  }
  if (options.legacyTimeLimitFallback && timeLimitCount === 0) {
    definitions.push(cloneDefaultTimeLimitSetting());
  }
  return definitions;
}

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
  rules?: readonly Readonly<Record<GameSdkLocale, string>>[];
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
  | { type: "room/rematch" }
  | { type: "room/confirm-lobby-return" }
  | { type: "room/expire-timer"; turnSequence: number }
  | { type: "room/recover-timeout" }
  | { type: "room/debug-add-dummy" }
  | { type: "room/debug-remove-dummy"; seat: number };

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
  parseGameSdkSettingDefinitions(manifest.settings, {
    requireTimeLimit: manifest.playMode === "online-room",
  });
  if (manifest.rules) {
    if (manifest.rules.length > 20) {
      throw new Error("Game SDK manifest rules cannot exceed 20 items.");
    }
    for (const [index, rule] of manifest.rules.entries()) {
      for (const locale of ["ja", "en"] satisfies GameSdkLocale[]) {
        if (
          typeof rule[locale] !== "string"
          || !rule[locale].trim()
          || rule[locale].length > 300
        ) {
          throw new Error(`Game SDK manifest rules[${index}].${locale} is invalid.`);
        }
      }
    }
  }
}

export function defineGameManifest<const TManifest extends GameSdkManifest>(manifest: TManifest) {
  assertGameManifest(manifest);
  return manifest;
}
