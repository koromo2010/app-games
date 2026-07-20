import { cookies } from "next/headers";
import { loadStoredPlayerSession } from "@/lib/player-store";
import {
  authenticatedPlayerIdFromCookieStore,
  createPlayerAuthToken,
  playerAuthCookieName,
  playerAuthMaxAgeSeconds,
} from "@/lib/player-auth-token";

export {
  authenticatedPlayerIdFromCookieStore,
  createPlayerAuthToken,
  parsePlayerAuthToken,
  playerAuthCookieName,
} from "@/lib/player-auth-token";

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

/** Verifies the signed cookie without reading the player record from Redis. */
export async function getAuthenticatedPlayerId() {
  return authenticatedPlayerIdFromCookieStore(await cookies());
}

export async function requireAuthenticatedPlayerId() {
  const playerId = await getAuthenticatedPlayerId();
  if (!playerId) throw new Error("PLAYER_AUTH_REQUIRED");
  return playerId;
}

export async function getAuthenticatedPlayer() {
  const playerId = await getAuthenticatedPlayerId();
  return playerId ? loadStoredPlayerSession(playerId) : null;
}

export async function requireAuthenticatedPlayer() {
  const player = await getAuthenticatedPlayer();
  if (!player?.id) throw new Error("PLAYER_AUTH_REQUIRED");
  return player as typeof player & { id: string };
}

export function isPlayerAuthConfigurationError(error: unknown) {
  return error instanceof Error && error.message === "PLAYER_SESSION_SECRET_NOT_CONFIGURED";
}
