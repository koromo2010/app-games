import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizeOnlineRoomRealtimeGame,
  type OnlineRoomRealtimeGame,
} from "./online-room-realtime-protocol.ts";

export const onlineRoomSpectatorCookieName = "game-fields-spectator";
export const onlineRoomSpectatorGrantMaxAgeSeconds = 6 * 60 * 60;

type SpectatorGrant = {
  version: 1;
  game: OnlineRoomRealtimeGame;
  code: string;
  playerId: string;
  roomCreatedAt: number;
  expiresAt: number;
};

function secret() {
  const value = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("PLAYER_SESSION_SECRET_NOT_CONFIGURED");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(`spectator:${payload}`).digest("base64url");
}

export function createOnlineRoomSpectatorGrant(input: Omit<SpectatorGrant, "version" | "expiresAt">, now = Date.now()) {
  const encoded = Buffer.from(JSON.stringify({ ...input, version: 1, expiresAt: now + onlineRoomSpectatorGrantMaxAgeSeconds * 1000 }), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function parseOnlineRoomSpectatorGrant(token: string, now = Date.now()): SpectatorGrant | null {
  const [encoded, receivedSignature, extra] = token.split(".");
  if (!encoded || !receivedSignature || extra) return null;
  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SpectatorGrant>;
    return payload.version === 1 && normalizeOnlineRoomRealtimeGame(payload.game) && typeof payload.code === "string" && typeof payload.playerId === "string" && typeof payload.roomCreatedAt === "number" && typeof payload.expiresAt === "number" && payload.expiresAt > now
      ? payload as SpectatorGrant
      : null;
  } catch {
    return null;
  }
}
