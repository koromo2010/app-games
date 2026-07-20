import { createHmac, timingSafeEqual } from "node:crypto";

export const playerAuthCookieName = "game-fields-player-auth";
export const playerAuthMaxAgeSeconds = 60 * 60 * 24 * 30;

type PlayerAuthPayload = {
  version: 1;
  playerId: string;
  expiresAt: number;
};

export type PlayerAuthCookieReader = {
  get(name: string): { value: string } | undefined;
};

function authSecret() {
  const value = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("PLAYER_SESSION_SECRET_NOT_CONFIGURED");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(encodedPayload: string) {
  return createHmac("sha256", authSecret()).update(encodedPayload).digest("base64url");
}

export function createPlayerAuthToken(playerId: string, now = Date.now()) {
  const payload: PlayerAuthPayload = {
    version: 1,
    playerId,
    expiresAt: now + playerAuthMaxAgeSeconds * 1000,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

export function parsePlayerAuthToken(token: string, now = Date.now()) {
  const [encodedPayload, receivedSignature, extra] = token.split(".");
  if (!encodedPayload || !receivedSignature || extra) return null;
  const expectedSignature = signature(encodedPayload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(decode(encodedPayload)) as Partial<PlayerAuthPayload>;
    if (payload.version !== 1 || typeof payload.playerId !== "string" || !payload.playerId || typeof payload.expiresAt !== "number" || payload.expiresAt <= now) return null;
    return payload as PlayerAuthPayload;
  } catch {
    return null;
  }
}

export function authenticatedPlayerIdFromCookieStore(store: PlayerAuthCookieReader, now = Date.now()) {
  const token = store.get(playerAuthCookieName)?.value;
  return token ? parsePlayerAuthToken(token, now)?.playerId ?? null : null;
}
