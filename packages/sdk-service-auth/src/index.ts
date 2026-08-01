import { createHmac, timingSafeEqual } from "node:crypto";

const MINIMUM_SECRET_LENGTH = 32;
const SDK_SERVICE_AUTH_VERSION = 1;
const SDK_SERVICE_AUTH_MAX_AGE_MS = 60_000;

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
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySdkServiceAuthorization(
  value: string,
  expected: { method: string; path: string; now?: number },
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
      && typeof parsed.issuedAt === "number"
      && Number.isSafeInteger(parsed.issuedAt)
      && Math.abs(now - parsed.issuedAt) <= SDK_SERVICE_AUTH_MAX_AGE_MS;
  } catch {
    return false;
  }
}
