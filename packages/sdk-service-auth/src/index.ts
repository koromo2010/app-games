import { createHmac, timingSafeEqual } from "node:crypto";

const MINIMUM_SECRET_LENGTH = 32;
const SDK_SERVICE_AUTH_VERSION = 1;
const SDK_SERVICE_AUTH_MAX_AGE_MS = 60_000;
const SDK_SERVICE_OPERATION_AUTH_VERSION = 1;
export const SDK_SERVICE_OPERATION_AUTH_MAX_AGE_MS = 30_000;
const OPERATION_ACTION_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type SdkServiceOperationGrant = {
  version: 1;
  kind: "sdk-service-operation";
  method: string;
  path: string;
  environment: "production" | "development";
  action: string;
  operationId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

function assertSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_LENGTH) {
    throw new Error("SDK service signing secret must contain at least 32 bytes.");
  }
}

function signature(payload: string, secret: string) {
  assertSecret(secret);
  return createHmac("sha256", secret)
    .update(`game-fields-sdk-service:${payload}`)
    .digest("base64url");
}

function operationSignature(payload: string, secret: string) {
  return signature(`operation-grant:v1:${payload}`, secret);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOperationGrant(
  value: unknown,
  expected: {
    method: string;
    path: string;
    environment: "production" | "development";
    action: string;
    now: number;
  },
): value is SdkServiceOperationGrant {
  if (!value || typeof value !== "object") return false;
  const grant = value as Partial<SdkServiceOperationGrant>;
  return grant.version === SDK_SERVICE_OPERATION_AUTH_VERSION
    && grant.kind === "sdk-service-operation"
    && grant.method === expected.method.toUpperCase()
    && grant.path === expected.path
    && grant.environment === expected.environment
    && grant.action === expected.action
    && OPERATION_ACTION_PATTERN.test(grant.action)
    && isUuid(grant.operationId)
    && isUuid(grant.nonce)
    && typeof grant.issuedAt === "number"
    && Number.isSafeInteger(grant.issuedAt)
    && typeof grant.expiresAt === "number"
    && Number.isSafeInteger(grant.expiresAt)
    && grant.issuedAt <= expected.now + 5_000
    && grant.expiresAt > expected.now
    && grant.expiresAt > grant.issuedAt
    && grant.expiresAt - grant.issuedAt <= SDK_SERVICE_OPERATION_AUTH_MAX_AGE_MS;
}

export function createSdkServiceAuthorization(input: {
  method: string;
  path: string;
  environment?: string;
  now?: number;
}, secret: string) {
  const payload = Buffer.from(JSON.stringify({
    version: SDK_SERVICE_AUTH_VERSION,
    method: input.method.toUpperCase(),
    path: input.path,
    ...(input.environment ? { environment: input.environment } : {}),
    issuedAt: input.now ?? Date.now(),
  }), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySdkServiceAuthorization(
  value: string,
  expected: {
    method: string;
    path: string;
    environment?: string;
    now?: number;
  },
  secret: string,
) {
  assertSecret(secret);
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const actual = Buffer.from(suppliedSignature, "base64url");
  const wanted = Buffer.from(signature(payload, secret), "base64url");
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const now = expected.now ?? Date.now();
    return parsed.version === SDK_SERVICE_AUTH_VERSION
      && parsed.method === expected.method.toUpperCase()
      && parsed.path === expected.path
      && (
        expected.environment === undefined
        || parsed.environment === expected.environment
      )
      && typeof parsed.issuedAt === "number"
      && Number.isSafeInteger(parsed.issuedAt)
      && Math.abs(now - parsed.issuedAt) <= SDK_SERVICE_AUTH_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Creates a short-lived operation grant under the existing SDK service HMAC
 * authority. This is a separate token domain from ordinary service requests;
 * no new long-lived secret is introduced.
 */
export function createSdkServiceOperationAuthorization(input: {
  method: string;
  path: string;
  environment: "production" | "development";
  action: string;
  operationId: string;
  nonce: string;
  now?: number;
  expiresAt?: number;
}, secret: string) {
  assertSecret(secret);
  const issuedAt = input.now ?? Date.now();
  const expiresAt = input.expiresAt
    ?? issuedAt + SDK_SERVICE_OPERATION_AUTH_MAX_AGE_MS;
  const grant: SdkServiceOperationGrant = {
    version: SDK_SERVICE_OPERATION_AUTH_VERSION,
    kind: "sdk-service-operation",
    method: input.method.toUpperCase(),
    path: input.path,
    environment: input.environment,
    action: input.action,
    operationId: input.operationId.toLowerCase(),
    nonce: input.nonce.toLowerCase(),
    issuedAt,
    expiresAt,
  };
  if (!isOperationGrant(grant, {
    method: grant.method,
    path: grant.path,
    environment: grant.environment,
    action: grant.action,
    now: issuedAt,
  })) {
    throw new Error("SDK service operation grant is invalid.");
  }
  const payload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  return `${payload}.${operationSignature(payload, secret)}`;
}

export function verifySdkServiceOperationAuthorization(
  value: string,
  expected: {
    method: string;
    path: string;
    environment: "production" | "development";
    action: string;
    now?: number;
  },
  secret: string,
): SdkServiceOperationGrant | null {
  assertSecret(secret);
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const actual = Buffer.from(suppliedSignature, "base64url");
  const wanted = Buffer.from(operationSignature(payload, secret), "base64url");
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    const now = expected.now ?? Date.now();
    return isOperationGrant(parsed, {
      method: expected.method,
      path: expected.path,
      environment: expected.environment,
      action: expected.action,
      now,
    }) ? parsed : null;
  } catch {
    return null;
  }
}
