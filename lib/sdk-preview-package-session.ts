import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type {
  GameSdkRoomPlayer,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";

export type SdkPreviewPackageSessionScope = {
  creatorSlug: string;
  gameId: string;
  revision: string;
};

export type SdkPreviewPackageSession = {
  version: 1;
  scope: SdkPreviewPackageSessionScope;
  playerId: string;
  room: GameSdkStoredRoom & Record<string, unknown>;
};

export const sdkPreviewPackageSessionMaxAgeSeconds = 60 * 60;
export const sdkPreviewPackageSessionCookiePrefix = "game-fields-sdk-preview-";

function signingSecret() {
  const value = process.env.SDK_PREVIEW_SIGNING_SECRET?.trim() ?? "";
  if (value.length < 32) throw new Error("SDK_PREVIEW_SIGNING_SECRET_NOT_CONFIGURED");
  return value;
}

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update("game-fields-sdk-preview-session:v1:")
    .update(secret)
    .digest();
}

function scopeKey(scope: SdkPreviewPackageSessionScope, playerId: string) {
  return JSON.stringify([
    scope.creatorSlug,
    scope.gameId,
    scope.revision,
    playerId,
  ]);
}

function cookieName(scope: SdkPreviewPackageSessionScope) {
  return `${sdkPreviewPackageSessionCookiePrefix}${createHash("sha256")
    .update(JSON.stringify(scope))
    .digest("hex")
    .slice(0, 24)}`;
}

function isScope(value: unknown): value is SdkPreviewPackageSessionScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<SdkPreviewPackageSessionScope>;
  return (
    typeof scope.creatorSlug === "string"
    && typeof scope.gameId === "string"
    && /^[a-f0-9]{40}$/.test(scope.revision ?? "")
  );
}

function isStoredRoom(value: unknown): value is GameSdkStoredRoom & Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const room = value as Partial<GameSdkStoredRoom>;
  return (
    typeof room.code === "string"
    && /^[A-Z0-9]{4,12}$/.test(room.code)
    && Number.isSafeInteger(room.revision)
    && Number(room.revision) >= 1
    && typeof room.phase === "string"
  );
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function sdkPreviewPackageSessionCookieName(
  scope: SdkPreviewPackageSessionScope,
) {
  return cookieName(scope);
}

export function encodeSdkPreviewPackageSession(
  session: SdkPreviewPackageSession,
  secret = signingSecret(),
) {
  if (
    session.version !== 1
    || !isScope(session.scope)
    || !session.playerId.trim()
    || !isStoredRoom(session.room)
  ) {
    throw new Error("SDK_PREVIEW_SESSION_INVALID");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), nonce);
  cipher.setAAD(Buffer.from(scopeKey(session.scope, session.playerId), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const token = [
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ].map((part) => part.toString("base64url")).join(".");
  if (token.length > 3_800) throw new Error("SDK_PREVIEW_SESSION_TOO_LARGE");
  return token;
}

export function decodeSdkPreviewPackageSession(
  token: string,
  scope: SdkPreviewPackageSessionScope,
  playerId: string,
  secret = signingSecret(),
): SdkPreviewPackageSession | null {
  if (!token || token.length > 3_800) return null;
  try {
    const [noncePart, authTagPart, ciphertextPart, extra] = token.split(".");
    if (!noncePart || !authTagPart || !ciphertextPart || extra) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      Buffer.from(noncePart, "base64url"),
    );
    decipher.setAAD(Buffer.from(scopeKey(scope, playerId), "utf8"));
    decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as Partial<SdkPreviewPackageSession>;
    if (
      parsed.version !== 1
      || !isScope(parsed.scope)
      || JSON.stringify(parsed.scope) !== JSON.stringify(scope)
      || parsed.playerId !== playerId
      || !isStoredRoom(parsed.room)
    ) return null;
    return parsed as SdkPreviewPackageSession;
  } catch {
    return null;
  }
}

function readCookies(value: string | null) {
  return new Map(
    (value ?? "").split(";").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1) return [];
      return [[
        entry.slice(0, separator).trim(),
        decodeURIComponent(entry.slice(separator + 1).trim()),
      ] as const];
    }),
  );
}

export function readSdkPreviewPackageSession(
  cookieHeader: string | null,
  scope: SdkPreviewPackageSessionScope,
  playerId: string,
  secret = signingSecret(),
) {
  const token = readCookies(cookieHeader).get(cookieName(scope));
  return token
    ? decodeSdkPreviewPackageSession(token, scope, playerId, secret)
    : null;
}

export function sdkPreviewPackageSessionSetCookie(
  scope: SdkPreviewPackageSessionScope,
  token: string | null,
  secure = process.env.NODE_ENV === "production",
) {
  const name = cookieName(scope);
  const attributes = [
    "Path=/api/sdk-preview",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    token === null
      ? "Max-Age=0"
      : `Max-Age=${sdkPreviewPackageSessionMaxAgeSeconds}`,
  ];
  return `${name}=${token === null ? "" : encode(token)}; ${attributes.join("; ")}`;
}

export function sdkPreviewPackageSessionPlayers(room: GameSdkStoredRoom) {
  const players = (room as GameSdkStoredRoom & { players?: unknown }).players;
  return Array.isArray(players)
    ? players as GameSdkRoomPlayer[]
    : [];
}
