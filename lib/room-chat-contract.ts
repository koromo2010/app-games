import { createHmac, timingSafeEqual } from "node:crypto";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { normalizeOnlineRoomRealtimeCode, normalizeOnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { normalizeRoomInstanceId } from "./room-invite-target.ts";

export const roomChatSchemaVersion = 1 as const;
export const roomChatMaximumScalars = 500;
export const roomChatMaximumBytes = 2_048;
export const roomChatMaximumLineBreaks = 8;
export const roomChatPageMaximum = 100;

export type RoomChatErrorCode =
  | "ROOM_CHAT_INVALID_REQUEST"
  | "PLAYER_AUTH_REQUIRED"
  | "ROOM_CHAT_MEMBERSHIP_REQUIRED"
  | "ROOM_CHAT_NOT_AVAILABLE"
  | "ROOM_CHAT_GENERATION_MISMATCH"
  | "ROOM_CHAT_CURSOR_EXPIRED"
  | "ROOM_CHAT_MESSAGE_TOO_LARGE"
  | "ROOM_CHAT_TEMPORARILY_UNAVAILABLE";

export type RoomChatMessage = {
  schemaVersion: typeof roomChatSchemaVersion;
  messageId: string;
  roomInstanceId: string;
  sequence: string;
  orderCursor: string;
  kind: "user";
  senderRef: string;
  body: string;
  createdAt: number;
};

export type RoomChatTarget = {
  game: OnlineRoomRealtimeGame;
  code: string;
  roomInstanceId: string;
};

export type RoomChatSendInput = RoomChatTarget & { requestId: string; body: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const disallowedControl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export function validateRoomChatText(value: unknown) {
  if (typeof value !== "string" || !value.trim() || disallowedControl.test(value)) return null;
  let scalars = 0;
  let lineBreaks = 0;
  for (let index = 0; index < value.length;) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return null;
      index += 2;
    } else {
      if (code >= 0xdc00 && code <= 0xdfff) return null;
      index += 1;
    }
    scalars += 1;
    if (scalars > roomChatMaximumScalars) return null;
  }
  for (const character of value) if (character === "\n") lineBreaks += 1;
  if (lineBreaks > roomChatMaximumLineBreaks || Buffer.byteLength(value, "utf8") > roomChatMaximumBytes) return null;
  return value;
}

export function parseRoomChatTarget(value: unknown): RoomChatTarget | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const game = normalizeOnlineRoomRealtimeGame(input.game);
  const code = game ? normalizeOnlineRoomRealtimeCode(game, input.code) : "";
  const roomInstanceId = normalizeRoomInstanceId(input.roomInstanceId);
  return game && code && roomInstanceId ? { game, code, roomInstanceId } : null;
}

export function parseRoomChatSendInput(value: unknown): RoomChatSendInput | null {
  const target = parseRoomChatTarget(value);
  const input = value as Record<string, unknown> | null;
  const body = validateRoomChatText(input?.body);
  return target && typeof input?.requestId === "string" && uuidPattern.test(input.requestId) && body !== null
    ? { ...target, requestId: input.requestId.toLowerCase(), body }
    : null;
}

function cursorSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.PLAYER_SESSION_SECRET || env.LLM_SESSION_SECRET || "game-fields-room-chat-local-cursor-v1";
}

export function createRoomChatCursor(roomInstanceId: string, entryId: string, env: NodeJS.ProcessEnv = process.env) {
  const encoded = Buffer.from(JSON.stringify([roomChatSchemaVersion, roomInstanceId, entryId]), "utf8").toString("base64url");
  const signature = createHmac("sha256", cursorSecret(env)).update(`room-chat:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

export function parseRoomChatCursor(value: unknown, expectedRoomInstanceId: string, env: NodeJS.ProcessEnv = process.env) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const [encoded, received, extra] = value.split(".");
  if (!encoded || !received || extra) return undefined;
  const expected = createHmac("sha256", cursorSecret(env)).update(`room-chat:${encoded}`).digest();
  const actual = Buffer.from(received, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return Array.isArray(decoded) && decoded.length === 3 && decoded[0] === roomChatSchemaVersion
      && decoded[1] === expectedRoomInstanceId && typeof decoded[2] === "string" && /^\d+-\d+$/.test(decoded[2])
      ? decoded[2] as string
      : undefined;
  } catch {
    return undefined;
  }
}
