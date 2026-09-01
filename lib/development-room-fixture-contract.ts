import { createHash } from "node:crypto";
import { resolveGameFieldsEnvironment } from "./game-fields-environment.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";

export const developmentRoomFixtureNamespace = "t185-room-discovery-v1";
export const developmentRoomFixtureScenario = "filtered-first-page-later-joinable-v1";
export const developmentRoomFixtureRoomTtlSeconds = 15 * 60;
export const developmentRoomFixtureReceiptTtlSeconds = 30 * 60;
export const developmentRoomFixtureFilteredRoomsPerSurface = 136;
export const developmentRoomFixtureCandidateRounds = 32;
export const developmentRoomFixtureTargetMaximum = 400;
export const developmentRoomFixtureBaselineMaximum = 512;

export const developmentRoomFixtureOperationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    baselineUnchanged?: boolean;
  };
  errorCode?: string;
};

export function developmentRoomFixtureEnvironmentAvailable(
  env: NodeJS.ProcessEnv = process.env,
) {
  try {
    return env.APP_ENV === "development"
      && expectedAppEnvironment(
        env.VERCEL_ENV,
        env.NODE_ENV,
        env.VERCEL_GIT_COMMIT_REF,
      ) === "development"
      && resolveGameFieldsEnvironment(undefined, env) === "development";
  } catch {
    return false;
  }
}

export function normalizeDevelopmentRoomFixtureOperationId(value: unknown) {
  const operationId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!developmentRoomFixtureOperationIdPattern.test(operationId)) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_OPERATION_ID_INVALID");
  }
  return operationId;
}

export function parseDevelopmentRoomFixtureRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "operationId")) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID");
  }
  return {
    operationId: normalizeDevelopmentRoomFixtureOperationId(body.operationId),
  };
}

export function developmentRoomFixtureActorDigest(playerId: string) {
  return createHash("sha256")
    .update(`${developmentRoomFixtureNamespace}:actor:${playerId.trim()}`)
    .digest("hex");
}

export function developmentRoomFixturePublicIdentity(input: {
  surface: string;
  roomIdentity: string;
}) {
  return createHash("sha256")
    .update(`${developmentRoomFixtureNamespace}:${input.surface}:${input.roomIdentity}`)
    .digest("hex");
}
