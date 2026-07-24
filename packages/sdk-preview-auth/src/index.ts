import { createHmac, timingSafeEqual } from "node:crypto";

const INSTANCE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MINIMUM_SECRET_LENGTH = 32;
const SDK_SERVICE_AUTH_VERSION = 1;
const SDK_SERVICE_AUTH_MAX_AGE_MS = 60_000;

export type SdkPreviewGrant = {
  version: 2;
  audience: "mock-client" | "package-client" | "package-server";
  instanceId: string;
  gameId: string;
  revision: string;
  bundleSha256?: string;
  expiresAt: number;
};

function assertSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_LENGTH) {
    throw new Error("SDK preview signing secret must contain at least 32 bytes.");
  }
}

export function isSdkPreviewGrant(value: unknown): value is SdkPreviewGrant {
  if (!value || typeof value !== "object") return false;
  const grant = value as Partial<SdkPreviewGrant>;
  return grant.version === 2
    && (
      grant.audience === "mock-client"
      || grant.audience === "package-client"
      || grant.audience === "package-server"
    )
    && typeof grant.instanceId === "string"
    && INSTANCE_PATTERN.test(grant.instanceId)
    && typeof grant.gameId === "string"
    && GAME_PATTERN.test(grant.gameId)
    && typeof grant.revision === "string"
    && REVISION_PATTERN.test(grant.revision)
    && (
      grant.audience === "package-server"
        ? typeof grant.bundleSha256 === "string"
          && SHA256_PATTERN.test(grant.bundleSha256)
        : grant.bundleSha256 === undefined
    )
    && Number.isSafeInteger(grant.expiresAt)
    && Number(grant.expiresAt) > 0;
}

function signatureFor(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSdkPreviewToken(grant: SdkPreviewGrant, secret: string) {
  assertSecret(secret);
  if (!isSdkPreviewGrant(grant)) throw new Error("SDK preview grant is invalid.");
  const encodedPayload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

export function verifySdkPreviewToken(token: string, secret: string, now = Date.now()) {
  assertSecret(secret);
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signatureFor(encodedPayload, secret), "base64url");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!isSdkPreviewGrant(parsed) || parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sdkServiceSignature(payload: string, secret: string) {
  assertSecret(secret);
  return createHmac("sha256", secret)
    .update(`game-fields-sdk-service:${payload}`)
    .digest("base64url");
}

export function createSdkServiceAuthorization(input: {
  method: string;
  path: string;
  now?: number;
}, secret: string) {
  const payload = Buffer.from(JSON.stringify({
    version: SDK_SERVICE_AUTH_VERSION,
    method: input.method.toUpperCase(),
    path: input.path,
    issuedAt: input.now ?? Date.now(),
  }), "utf8").toString("base64url");
  return `${payload}.${sdkServiceSignature(payload, secret)}`;
}

export function verifySdkServiceAuthorization(
  value: string,
  expected: {
    method: string;
    path: string;
    now?: number;
  },
  secret: string,
) {
  assertSecret(secret);
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const actual = Buffer.from(suppliedSignature, "base64url");
  const wanted = Buffer.from(sdkServiceSignature(payload, secret), "base64url");
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return false;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      version?: unknown;
      method?: unknown;
      path?: unknown;
      issuedAt?: unknown;
    };
    const now = expected.now ?? Date.now();
    return parsed.version === SDK_SERVICE_AUTH_VERSION
      && parsed.method === expected.method.toUpperCase()
      && parsed.path === expected.path
      && typeof parsed.issuedAt === "number"
      && Number.isSafeInteger(parsed.issuedAt)
      && Math.abs(now - parsed.issuedAt) <= SDK_SERVICE_AUTH_MAX_AGE_MS;
  } catch {
    return false;
  }
}
