import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { loadStoredPlayerSession } from "@/lib/player-store";

export const playerAuthCookieName = "game-fields-player-auth";
const playerAuthMaxAgeSeconds = 60 * 60 * 24 * 30;

type PlayerAuthPayload = {
  version: 1;
  playerId: string;
  expiresAt: number;
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

export async function setPlayerAuthCookie(playerId: string) {
  const store = await cookies();
  store.set(playerAuthCookieName, createPlayerAuthToken(playerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: playerAuthMaxAgeSeconds,
  });
}

export async function clearPlayerAuthCookie() {
  const store = await cookies();
  store.set(playerAuthCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedPlayer() {
  const store = await cookies();
  const token = store.get(playerAuthCookieName)?.value;
  if (!token) return null;
  const payload = parsePlayerAuthToken(token);
  if (!payload) return null;
  return loadStoredPlayerSession(payload.playerId);
}

export async function requireAuthenticatedPlayer() {
  const player = await getAuthenticatedPlayer();
  if (!player?.id) throw new Error("PLAYER_AUTH_REQUIRED");
  return player as typeof player & { id: string };
}

export function isPlayerAuthConfigurationError(error: unknown) {
  return error instanceof Error && error.message === "PLAYER_SESSION_SECRET_NOT_CONFIGURED";
}
