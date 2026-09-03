export const developmentRoomFixtureEnvironment = "development";
export const developmentRoomFixtureNamespace = "t185-room-discovery-v1";
export const developmentRoomFixtureScenario = "filtered-first-page-later-joinable-v1";
export const developmentRoomFixtureRoomTtlSeconds = 15 * 60;
export const developmentRoomFixtureReceiptTtlSeconds = 30 * 60;
export const developmentRoomFixtureFilteredRoomsPerSurface = 136;
export const developmentRoomFixtureCandidateRounds = 32;
export const developmentRoomFixtureTargetMinimum =
  developmentRoomFixtureFilteredRoomsPerSurface * 2 + 3;
export const developmentRoomFixtureTargetMaximum = 400;
export const developmentRoomFixtureBaselineMaximum = 512;

export const developmentRoomFixtureOperationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const publicIdentityPattern = /^[0-9a-f]{64}$/;
const creatorSlugPattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export type DevelopmentRoomFixtureState =
  | "materializing"
  | "ready"
  | "partial"
  | "cleaning"
  | "cleaned";

export type DevelopmentRoomFixturePublicReceipt = {
  schemaVersion: 1;
  namespace: typeof developmentRoomFixtureNamespace;
  operationId: string;
  scenario: typeof developmentRoomFixtureScenario;
  state: DevelopmentRoomFixtureState;
  idempotentReplay: boolean;
  createdAt: number;
  expiresAt: number;
  counts: {
    builtInTargets: number;
    sdkTargets: number;
    cleanupTargets: number;
    remainingTargets: number;
  };
  targetIdentities: string[];
  verification?: {
    builtInIndexMembers: number;
    sdkIndexMembers: number;
    builtInFirstStoragePageFiltered: boolean;
    sdkFirstStoragePageFiltered: boolean;
    builtInLaterJoinableJa: boolean;
    builtInLaterJoinableEn: boolean;
    sdkLaterJoinable: boolean;
    targetCleanupConfirmed?: boolean;
    baselineUnchanged?: boolean;
  };
  errorCode?: string;
};

export type DevelopmentRoomFixtureOperationPointer = {
  schemaVersion: 1;
  environment: typeof developmentRoomFixtureEnvironment;
  namespace: typeof developmentRoomFixtureNamespace;
  creatorSlug: string;
  operationId: string;
  expiresAt?: number;
};

function recordFrom(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function integer(value: unknown, code: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function boolean(value: unknown, code: string) {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

export function normalizeDevelopmentRoomFixtureOperationId(value: unknown) {
  const operationId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!developmentRoomFixtureOperationIdPattern.test(operationId)) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_OPERATION_ID_INVALID");
  }
  return operationId;
}

export function normalizeDevelopmentRoomFixtureCreatorSlug(value: unknown) {
  const creatorSlug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!creatorSlugPattern.test(creatorSlug)) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_CREATOR_INVALID");
  }
  return creatorSlug;
}

export function parseDevelopmentRoomFixtureRequest(value: unknown) {
  const body = recordFrom(value, "DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID");
  if (Object.keys(body).some((key) => key !== "operationId")) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID");
  }
  return {
    operationId: normalizeDevelopmentRoomFixtureOperationId(body.operationId),
  };
}

export function parseDevelopmentRoomFixturePublicReceipt(
  value: unknown,
  expectedOperationId: string,
) {
  const code = "DEVELOPMENT_ROOM_FIXTURE_RECEIPT_INVALID";
  const receipt = recordFrom(value, code);
  const operationId = normalizeDevelopmentRoomFixtureOperationId(receipt.operationId);
  if (
    receipt.schemaVersion !== 1
    || receipt.namespace !== developmentRoomFixtureNamespace
    || receipt.scenario !== developmentRoomFixtureScenario
    || operationId !== normalizeDevelopmentRoomFixtureOperationId(expectedOperationId)
    || !["materializing", "ready", "partial", "cleaning", "cleaned"].includes(String(receipt.state))
    || typeof receipt.idempotentReplay !== "boolean"
  ) throw new Error(code);

  const createdAt = integer(receipt.createdAt, code);
  const expiresAt = integer(receipt.expiresAt, code);
  if (expiresAt <= createdAt) throw new Error(code);

  const counts = recordFrom(receipt.counts, code);
  const builtInTargets = integer(counts.builtInTargets, code);
  const sdkTargets = integer(counts.sdkTargets, code);
  const cleanupTargets = integer(counts.cleanupTargets, code);
  const remainingTargets = integer(counts.remainingTargets, code);
  const totalTargets = builtInTargets + sdkTargets;
  if (
    totalTargets > developmentRoomFixtureTargetMaximum
    || cleanupTargets > totalTargets
    || remainingTargets !== totalTargets - cleanupTargets
    || !Array.isArray(receipt.targetIdentities)
    || receipt.targetIdentities.length !== totalTargets
    || receipt.targetIdentities.some((identity) => (
      typeof identity !== "string" || !publicIdentityPattern.test(identity)
    ))
    || new Set(receipt.targetIdentities).size !== totalTargets
  ) throw new Error(code);

  let verification: DevelopmentRoomFixturePublicReceipt["verification"];
  if (receipt.verification !== undefined) {
    const input = recordFrom(receipt.verification, code);
    verification = {
      builtInIndexMembers: integer(input.builtInIndexMembers, code),
      sdkIndexMembers: integer(input.sdkIndexMembers, code),
      builtInFirstStoragePageFiltered: boolean(input.builtInFirstStoragePageFiltered, code),
      sdkFirstStoragePageFiltered: boolean(input.sdkFirstStoragePageFiltered, code),
      builtInLaterJoinableJa: boolean(input.builtInLaterJoinableJa, code),
      builtInLaterJoinableEn: boolean(input.builtInLaterJoinableEn, code),
      sdkLaterJoinable: boolean(input.sdkLaterJoinable, code),
      ...(input.targetCleanupConfirmed === undefined
        ? {}
        : { targetCleanupConfirmed: boolean(input.targetCleanupConfirmed, code) }),
      ...(input.baselineUnchanged === undefined
        ? {}
        : { baselineUnchanged: boolean(input.baselineUnchanged, code) }),
    };
  }

  if (receipt.state === "ready") {
    if (
      totalTargets < developmentRoomFixtureTargetMinimum
      || builtInTargets < developmentRoomFixtureFilteredRoomsPerSurface + 2
      || sdkTargets < developmentRoomFixtureFilteredRoomsPerSurface + 1
      || cleanupTargets !== 0
      || !verification
      || verification.builtInIndexMembers < builtInTargets
      || verification.sdkIndexMembers < sdkTargets
      || !verification.builtInFirstStoragePageFiltered
      || !verification.sdkFirstStoragePageFiltered
      || !verification.builtInLaterJoinableJa
      || !verification.builtInLaterJoinableEn
      || !verification.sdkLaterJoinable
    ) throw new Error(code);
  }
  if (
    receipt.state === "cleaned"
    && (remainingTargets !== 0 || verification?.targetCleanupConfirmed !== true)
  ) throw new Error(code);
  if (
    receipt.errorCode !== undefined
    && (typeof receipt.errorCode !== "string" || !/^[A-Z][A-Z0-9_]{2,99}$/.test(receipt.errorCode))
  ) throw new Error(code);

  return {
    ...receipt,
    operationId,
    state: receipt.state as DevelopmentRoomFixtureState,
    createdAt,
    expiresAt,
    counts: { builtInTargets, sdkTargets, cleanupTargets, remainingTargets },
    targetIdentities: [...receipt.targetIdentities] as string[],
    ...(verification ? { verification } : {}),
  } as DevelopmentRoomFixturePublicReceipt;
}

export function developmentRoomFixtureOperationStorageKey(creatorSlug: string) {
  return [
    "game-fields",
    developmentRoomFixtureEnvironment,
    developmentRoomFixtureNamespace,
    normalizeDevelopmentRoomFixtureCreatorSlug(creatorSlug),
    "operation",
  ].join(":");
}

export function serializeDevelopmentRoomFixtureOperationPointer(input: {
  creatorSlug: string;
  operationId: string;
  expiresAt?: number;
}) {
  const pointer: DevelopmentRoomFixtureOperationPointer = {
    schemaVersion: 1,
    environment: developmentRoomFixtureEnvironment,
    namespace: developmentRoomFixtureNamespace,
    creatorSlug: normalizeDevelopmentRoomFixtureCreatorSlug(input.creatorSlug),
    operationId: normalizeDevelopmentRoomFixtureOperationId(input.operationId),
    ...(input.expiresAt === undefined ? {} : { expiresAt: integer(
      input.expiresAt,
      "DEVELOPMENT_ROOM_FIXTURE_POINTER_INVALID",
    ) }),
  };
  return JSON.stringify(pointer);
}

export function parseDevelopmentRoomFixtureOperationPointer(
  value: string | null,
  creatorSlug: string,
) {
  if (!value) return null;
  try {
    const pointer = recordFrom(JSON.parse(value), "DEVELOPMENT_ROOM_FIXTURE_POINTER_INVALID");
    const normalizedCreator = normalizeDevelopmentRoomFixtureCreatorSlug(creatorSlug);
    if (
      pointer.schemaVersion !== 1
      || pointer.environment !== developmentRoomFixtureEnvironment
      || pointer.namespace !== developmentRoomFixtureNamespace
      || pointer.creatorSlug !== normalizedCreator
    ) return null;
    const expiresAt = pointer.expiresAt === undefined
      ? undefined
      : integer(pointer.expiresAt, "DEVELOPMENT_ROOM_FIXTURE_POINTER_INVALID");
    return {
      schemaVersion: 1,
      environment: developmentRoomFixtureEnvironment,
      namespace: developmentRoomFixtureNamespace,
      creatorSlug: normalizedCreator,
      operationId: normalizeDevelopmentRoomFixtureOperationId(pointer.operationId),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    } satisfies DevelopmentRoomFixtureOperationPointer;
  } catch {
    return null;
  }
}

export function developmentRoomFixturePointerShouldClear(input: {
  receipt?: DevelopmentRoomFixturePublicReceipt | null;
  responseStatus?: number;
  confirmedServerNow?: number;
}) {
  if (input.responseStatus === 404) return true;
  if (input.receipt?.state === "cleaned") return true;
  return input.receipt !== undefined
    && input.receipt !== null
    && input.confirmedServerNow !== undefined
    && input.confirmedServerNow >= input.receipt.expiresAt;
}
