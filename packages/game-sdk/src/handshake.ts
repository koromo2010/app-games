export const GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL = "game-fields-sdk" as const;
export const GAME_FIELDS_SDK_HANDSHAKE_VERSION = 1 as const;

export const GAME_FIELDS_SDK_CAPABILITIES = [
  "oauth2-pkce",
  "creator-environments",
  "starter-download",
  "mock-publish",
  "game-package-publish",
  "formal-room-preview",
  "hash-pinned-promotion",
  "submission-upload",
  "persistent-rooms",
  "room-realtime",
  "common-shell",
] as const;

export type GameSdkCapability = typeof GAME_FIELDS_SDK_CAPABILITIES[number];
export type GameSdkEnvironment = "development" | "production";
export type GameSdkHandshakeSurface = "creator-portal" | "game-runtime";
export type GameSdkHandshakeClientKind =
  | "ai-agent"
  | "starter-cli"
  | "browser-runtime"
  | "platform";

export type GameSdkHandshakeRequest = {
  protocol: typeof GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL;
  handshakeVersion: number;
  client: {
    kind: GameSdkHandshakeClientKind;
    name?: string;
    version?: string;
  };
  expected: {
    environment: GameSdkEnvironment;
    platformVersion: string;
    sdkPackageVersion: string;
    sdkContractVersion: number;
  };
  requiredCapabilities: readonly GameSdkCapability[];
};

export type GameSdkHandshakeDescriptor = {
  protocol: typeof GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL;
  handshakeVersion: typeof GAME_FIELDS_SDK_HANDSHAKE_VERSION;
  surface: GameSdkHandshakeSurface;
  environment: GameSdkEnvironment;
  release: {
    platformVersion: string;
    sdkPackageVersion: string;
    sdkContractVersion: number;
    supportedSdkContractVersions: readonly number[];
    roomSchemaVersion: number;
  };
  capabilities: readonly GameSdkCapability[];
  endpoints: {
    portal: string;
    handshake: string;
    mcp?: string;
    runtime?: string;
  };
};

export type GameSdkHandshakeProblemCode =
  | "INVALID_REQUEST"
  | "PROTOCOL_MISMATCH"
  | "HANDSHAKE_VERSION_UNSUPPORTED"
  | "ENVIRONMENT_MISMATCH"
  | "PLATFORM_VERSION_MISMATCH"
  | "SDK_PACKAGE_VERSION_MISMATCH"
  | "SDK_CONTRACT_UNSUPPORTED"
  | "CAPABILITY_UNAVAILABLE";

export type GameSdkHandshakeProblem = {
  code: GameSdkHandshakeProblemCode;
  field: string;
  expected?: string | number;
  actual?: string | number;
};

export type GameSdkHandshakeResult = GameSdkHandshakeDescriptor & {
  accepted: boolean;
  problems: readonly GameSdkHandshakeProblem[];
};

const CLIENT_KINDS = new Set<GameSdkHandshakeClientKind>([
  "ai-agent",
  "starter-cli",
  "browser-runtime",
  "platform",
]);
const ENVIRONMENTS = new Set<GameSdkEnvironment>(["development", "production"]);
const CAPABILITIES = new Set<GameSdkCapability>(GAME_FIELDS_SDK_CAPABILITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function problem(
  code: GameSdkHandshakeProblemCode,
  field: string,
  expected?: string | number,
  actual?: string | number,
): GameSdkHandshakeProblem {
  return {
    code,
    field,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  };
}

function readRequest(value: unknown): {
  request: GameSdkHandshakeRequest | null;
  problems: GameSdkHandshakeProblem[];
} {
  if (!isRecord(value) || !isRecord(value.client) || !isRecord(value.expected)) {
    return {
      request: null,
      problems: [problem("INVALID_REQUEST", "request")],
    };
  }
  const requiredCapabilities = Array.isArray(value.requiredCapabilities)
    ? value.requiredCapabilities
    : null;
  const valid = value.protocol === GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL
    && Number.isInteger(value.handshakeVersion)
    && typeof value.client.kind === "string"
    && CLIENT_KINDS.has(value.client.kind as GameSdkHandshakeClientKind)
    && typeof value.expected.environment === "string"
    && ENVIRONMENTS.has(value.expected.environment as GameSdkEnvironment)
    && typeof value.expected.platformVersion === "string"
    && value.expected.platformVersion.length > 0
    && typeof value.expected.sdkPackageVersion === "string"
    && value.expected.sdkPackageVersion.length > 0
    && Number.isInteger(value.expected.sdkContractVersion)
    && Number(value.expected.sdkContractVersion) > 0
    && requiredCapabilities !== null
    && requiredCapabilities.every((capability) => (
      typeof capability === "string"
      && CAPABILITIES.has(capability as GameSdkCapability)
    ));
  if (!valid) {
    const code = value.protocol === GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL
      ? "INVALID_REQUEST"
      : "PROTOCOL_MISMATCH";
    return {
      request: null,
      problems: [problem(
        code,
        value.protocol === GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL ? "request" : "protocol",
        GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
        typeof value.protocol === "string" ? value.protocol : undefined,
      )],
    };
  }
  return {
    request: value as unknown as GameSdkHandshakeRequest,
    problems: [],
  };
}

/**
 * Negotiates the SDK control-plane or Runtime boundary without creating a
 * session. Authentication remains the transport's responsibility.
 */
export function negotiateGameSdkHandshake(
  value: unknown,
  descriptor: GameSdkHandshakeDescriptor,
): GameSdkHandshakeResult {
  const parsed = readRequest(value);
  const problems = [...parsed.problems];
  const request = parsed.request;
  if (request) {
    if (request.handshakeVersion !== descriptor.handshakeVersion) {
      problems.push(problem(
        "HANDSHAKE_VERSION_UNSUPPORTED",
        "handshakeVersion",
        descriptor.handshakeVersion,
        request.handshakeVersion,
      ));
    }
    if (request.expected.environment !== descriptor.environment) {
      problems.push(problem(
        "ENVIRONMENT_MISMATCH",
        "expected.environment",
        descriptor.environment,
        request.expected.environment,
      ));
    }
    if (request.expected.platformVersion !== descriptor.release.platformVersion) {
      problems.push(problem(
        "PLATFORM_VERSION_MISMATCH",
        "expected.platformVersion",
        descriptor.release.platformVersion,
        request.expected.platformVersion,
      ));
    }
    if (request.expected.sdkPackageVersion !== descriptor.release.sdkPackageVersion) {
      problems.push(problem(
        "SDK_PACKAGE_VERSION_MISMATCH",
        "expected.sdkPackageVersion",
        descriptor.release.sdkPackageVersion,
        request.expected.sdkPackageVersion,
      ));
    }
    if (!descriptor.release.supportedSdkContractVersions.includes(
      request.expected.sdkContractVersion,
    )) {
      problems.push(problem(
        "SDK_CONTRACT_UNSUPPORTED",
        "expected.sdkContractVersion",
        descriptor.release.sdkContractVersion,
        request.expected.sdkContractVersion,
      ));
    }
    const available = new Set(descriptor.capabilities);
    for (const capability of new Set(request.requiredCapabilities)) {
      if (!available.has(capability)) {
        problems.push(problem("CAPABILITY_UNAVAILABLE", "requiredCapabilities", capability));
      }
    }
  }
  return {
    ...descriptor,
    accepted: problems.length === 0,
    problems,
  };
}
