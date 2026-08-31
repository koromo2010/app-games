import { createHash, randomUUID } from "node:crypto";
import type { AppLocale } from "./app-locale.ts";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";
import { normalizeOnlineRoomCode } from "./online-room-policy.ts";

export const roomInviteSchemaVersion = 1 as const;
export const roomInviteRefPattern = /^[a-f0-9]{32}$/;
export const roomInstanceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export type CanonicalRoomInviteProviderKind =
  | "built-in"
  | "canvas"
  | "sdk-approved"
  | "sdk-preview";

export type CanonicalRoomInviteSdkIdentity = {
  publicGameId: string;
  sourceCreatorSlug: string;
  sourceGameId: string;
  packageRevision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
};

export type CanonicalRoomInvitePrimaryBinding = {
  environment: GameFieldsEnvironment;
  providerKind: CanonicalRoomInviteProviderKind;
  gameNamespace: string;
  displayCode: string;
  roomInstanceId: string;
  packageRevision?: string;
  packageRootSha256?: string;
};

export type CanonicalRoomInviteTarget = CanonicalRoomInvitePrimaryBinding & {
  schemaVersion: typeof roomInviteSchemaVersion;
  inviteRef: string;
  issuedAt: number;
  expiresAt: number;
  contentLanguage?: AppLocale;
  sdk?: CanonicalRoomInviteSdkIdentity;
};

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function validSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

function validSha40(value: string) {
  return /^[a-f0-9]{40}$/.test(value);
}

function validSha256(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

export function createRoomInstanceId() {
  return `room-${randomUUID()}`;
}

export function createRoomInviteRef() {
  return randomUUID().replaceAll("-", "").toLowerCase();
}

export function normalizeRoomInstanceId(value: unknown) {
  return typeof value === "string" && roomInstanceIdPattern.test(value)
    ? value
    : null;
}

export function expectedRoomInstanceIdFrom(value: unknown) {
  return normalizeRoomInstanceId(
    (value as { expectedRoomInstanceId?: unknown } | null)?.expectedRoomInstanceId,
  ) ?? undefined;
}

export function canonicalRoomInvitePrimaryBinding(
  target: CanonicalRoomInviteTarget,
): CanonicalRoomInvitePrimaryBinding {
  return {
    environment: target.environment,
    providerKind: target.providerKind,
    gameNamespace: target.gameNamespace,
    displayCode: target.displayCode,
    roomInstanceId: target.roomInstanceId,
    ...(target.sdk ? {
      packageRevision: target.sdk.packageRevision,
      packageRootSha256: target.sdk.packageRootSha256,
    } : {}),
  };
}

export function canonicalRoomInviteTargetDigest(
  target: CanonicalRoomInviteTarget,
) {
  return createHash("sha256").update(canonicalJson({
    ...canonicalRoomInvitePrimaryBinding(target),
    contentLanguage: target.contentLanguage,
    sdk: target.sdk,
  })).digest("hex");
}

export function canonicalRoomInvitePrimaryBindingDigest(
  binding: CanonicalRoomInvitePrimaryBinding,
) {
  return createHash("sha256").update(canonicalJson(binding)).digest("hex");
}

export function normalizeCanonicalRoomInviteTarget(
  value: unknown,
): CanonicalRoomInviteTarget | null {
  if (!value || typeof value !== "object") return null;
  const target = value as Partial<CanonicalRoomInviteTarget>;
  const code = normalizeOnlineRoomCode(target.displayCode);
  const instanceId = normalizeRoomInstanceId(target.roomInstanceId);
  if (
    target.schemaVersion !== roomInviteSchemaVersion
    || typeof target.inviteRef !== "string"
    || !roomInviteRefPattern.test(target.inviteRef)
    || ![
      "production",
      "development",
      "candidate-preview",
      "sdk-portal",
      "test",
    ].includes(String(target.environment))
    || !["built-in", "canvas", "sdk-approved", "sdk-preview"].includes(
      String(target.providerKind),
    )
    || typeof target.gameNamespace !== "string"
    || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(target.gameNamespace)
    || !code
    || !instanceId
    || !Number.isSafeInteger(target.issuedAt)
    || !Number.isSafeInteger(target.expiresAt)
    || Number(target.expiresAt) <= Number(target.issuedAt)
    || (
      target.contentLanguage !== undefined
      && target.contentLanguage !== "ja"
      && target.contentLanguage !== "en"
    )
  ) return null;
  const sdkProvider = target.providerKind === "sdk-approved"
    || target.providerKind === "sdk-preview";
  if (sdkProvider !== Boolean(target.sdk)) return null;
  if (target.sdk) {
    const sdk = target.sdk;
    if (
      !validSlug(sdk.publicGameId)
      || !validSlug(sdk.sourceCreatorSlug)
      || !validSlug(sdk.sourceGameId)
      || !validSha40(sdk.packageRevision)
      || !validSha256(sdk.packageRootSha256)
      || !validSha256(sdk.serverBundleSha256)
      || !validSha256(sdk.appSetSourceSha256)
    ) return null;
  }
  return {
    ...(target as CanonicalRoomInviteTarget),
    displayCode: code,
    roomInstanceId: instanceId,
  };
}

export function canonicalRoomInviteTargetsEqual(
  left: CanonicalRoomInviteTarget,
  right: CanonicalRoomInviteTarget,
) {
  return canonicalRoomInviteTargetDigest(left)
    === canonicalRoomInviteTargetDigest(right);
}
