import { createHmac, timingSafeEqual } from "node:crypto";

const INSTANCE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const MINIMUM_SECRET_LENGTH = 32;

export type SdkPreviewGrant = {
  version: 1;
  instanceId: string;
  gameId: string;
  revision: string;
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
  return grant.version === 1
    && typeof grant.instanceId === "string"
    && INSTANCE_PATTERN.test(grant.instanceId)
    && typeof grant.gameId === "string"
    && GAME_PATTERN.test(grant.gameId)
    && typeof grant.revision === "string"
    && REVISION_PATTERN.test(grant.revision)
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
