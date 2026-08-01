import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

const INSTANCE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MINIMUM_SECRET_LENGTH = 32;
const SDK_PREVIEW_TOKEN_PREFIX = "gfsp4";
const ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

export type SdkPreviewGrant = {
  version: 4;
  audience: "mock-client" | "package-client" | "package-server";
  environment: "production" | "development";
  channel: "candidate-preview" | "development" | "main";
  role: "client" | "runner";
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
  return grant.version === 4
    && (
      grant.audience === "mock-client"
      || grant.audience === "package-client"
      || grant.audience === "package-server"
    )
    && (
      grant.environment === "production"
      || grant.environment === "development"
    )
    && (
      grant.channel === "candidate-preview"
      || grant.channel === "development"
      || grant.channel === "main"
    )
    && (
      grant.channel === "candidate-preview"
      || (grant.channel === "development" && grant.environment === "development")
      || (grant.channel === "main" && grant.environment === "production")
    )
    && (
      (grant.audience === "package-server" && grant.role === "runner")
      || (grant.audience !== "package-server" && grant.role === "client")
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

function sdkPreviewPrivateKey(secret: string) {
  assertSecret(secret);
  const seed = createHash("sha256")
    .update("game-fields-sdk-preview-grant:ed25519:v4\0", "utf8")
    .update(secret, "utf8")
    .digest();
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function sdkPreviewPublicKey(secret: string) {
  return createPublicKey(sdkPreviewPrivateKey(secret))
    .export({ format: "der", type: "spki" })
    .toString("base64url");
}

export function createSdkPreviewToken(grant: SdkPreviewGrant, secret: string) {
  if (!isSdkPreviewGrant(grant)) throw new Error("SDK preview grant is invalid.");
  const encodedPayload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  const signedMessage = `${SDK_PREVIEW_TOKEN_PREFIX}.${encodedPayload}`;
  const signature = sign(
    null,
    Buffer.from(signedMessage, "utf8"),
    sdkPreviewPrivateKey(secret),
  ).toString("base64url");
  return `${signedMessage}.${signature}`;
}

export function verifySdkPreviewToken(
  token: string,
  encodedPublicKey: string,
  now = Date.now(),
) {
  const [prefix, encodedPayload, encodedSignature, extra] = token.split(".");
  if (
    prefix !== SDK_PREVIEW_TOKEN_PREFIX
    || !encodedPayload
    || !encodedSignature
    || extra
  ) {
    return null;
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  let suppliedSignature: Buffer;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(encodedPublicKey, "base64url"),
      format: "der",
      type: "spki",
    });
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    suppliedSignature.length !== 64
    || !verify(
      null,
      Buffer.from(`${prefix}.${encodedPayload}`, "utf8"),
      publicKey,
      suppliedSignature,
    )
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!isSdkPreviewGrant(parsed) || parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}
