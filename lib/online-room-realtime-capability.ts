import { createHmac, timingSafeEqual } from "node:crypto";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";
import {
  normalizeOnlineRoomRealtimeCode,
  normalizeOnlineRoomRealtimeGame,
  type OnlineRoomNotificationFamily,
  type OnlineRoomRealtimeGame,
} from "./online-room-realtime-protocol.ts";
import { normalizeRoomInstanceId } from "./room-invite-target.ts";

export const onlineRoomRealtimeCapabilityLifetimeMs = 60_000;

export type OnlineRoomRealtimeRole = "participant" | "spectator";
export type OnlineRoomRealtimeCapability = {
  version: 1 | 2;
  environment: GameFieldsEnvironment;
  actorId: string;
  game: OnlineRoomRealtimeGame;
  code: string;
  roomInstanceId: string;
  targetDigest: string;
  role: OnlineRoomRealtimeRole;
  family: OnlineRoomNotificationFamily;
  scope: "room:revision:read" | "room:chat:read";
  sessionEpoch: number;
  issuedAt: number;
  expiresAt: number;
};

function signingSecret(env: NodeJS.ProcessEnv = process.env) {
  const value = env.PLAYER_SESSION_SECRET || env.LLM_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("PLAYER_SESSION_SECRET_NOT_CONFIGURED");
  return value;
}

function signature(encoded: string, env: NodeJS.ProcessEnv) {
  return createHmac("sha256", signingSecret(env))
    .update(`online-room-realtime:v1:${encoded}`)
    .digest("base64url");
}

function safeSignatureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createOnlineRoomRealtimeCapability(
  input: Omit<OnlineRoomRealtimeCapability, "version" | "issuedAt" | "expiresAt">,
  options: { now?: number; env?: NodeJS.ProcessEnv } = {},
) {
  const now = options.now ?? Date.now();
  const payload: OnlineRoomRealtimeCapability = {
    ...input,
    version: 2,
    issuedAt: now,
    expiresAt: now + onlineRoomRealtimeCapabilityLifetimeMs,
  };
  const encoded = Buffer.from(JSON.stringify([
    payload.version,
    payload.environment,
    payload.actorId,
    payload.game,
    payload.code,
    payload.roomInstanceId,
    payload.targetDigest,
    payload.role === "participant" ? "p" : "s",
    payload.sessionEpoch,
    payload.issuedAt,
    payload.expiresAt,
    payload.family === "room-revision" ? "r" : "c",
  ]), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, options.env ?? process.env)}`;
}

export function parseOnlineRoomRealtimeCapability(
  token: string,
  options: { now?: number; env?: NodeJS.ProcessEnv } = {},
): OnlineRoomRealtimeCapability | null {
  const [encoded, received, extra] = token.split(".");
  if (!encoded || !received || extra || !safeSignatureEqual(signature(encoded, options.env ?? process.env), received)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(decoded) || ![11, 12].includes(decoded.length)) return null;
    const family = decoded.length === 11 || decoded[11] === "r" ? "room-revision" : decoded[11] === "c" ? "chat-hint" : null;
    const value: Partial<OnlineRoomRealtimeCapability> = {
      version: decoded[0], environment: decoded[1], actorId: decoded[2], game: decoded[3],
      code: decoded[4], roomInstanceId: decoded[5], targetDigest: decoded[6],
      role: decoded[7] === "p" ? "participant" : decoded[7] === "s" ? "spectator" : undefined,
      family: family ?? undefined, scope: family === "chat-hint" ? "room:chat:read" : "room:revision:read", sessionEpoch: decoded[8],
      issuedAt: decoded[9], expiresAt: decoded[10],
    };
    const game = normalizeOnlineRoomRealtimeGame(value.game);
    const code = game ? normalizeOnlineRoomRealtimeCode(game, value.code) : "";
    const roomInstanceId = normalizeRoomInstanceId(value.roomInstanceId);
    const now = options.now ?? Date.now();
    if (
      (value.version !== 1 && value.version !== 2)
      || !["development", "production", "candidate-preview", "sdk-portal", "test"].includes(String(value.environment))
      || typeof value.actorId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.actorId)
      || !game || !code || !roomInstanceId
      || typeof value.targetDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.targetDigest)
      || (value.role !== "participant" && value.role !== "spectator")
      || !family || value.scope !== (family === "chat-hint" ? "room:chat:read" : "room:revision:read")
      || !Number.isSafeInteger(value.sessionEpoch) || Number(value.sessionEpoch) < 0
      || typeof value.issuedAt !== "number" || typeof value.expiresAt !== "number"
      || value.issuedAt > now + 5_000 || value.expiresAt <= now
      || value.expiresAt - value.issuedAt > onlineRoomRealtimeCapabilityLifetimeMs
    ) return null;
    return { ...value, game, code, roomInstanceId } as OnlineRoomRealtimeCapability;
  } catch {
    return null;
  }
}
