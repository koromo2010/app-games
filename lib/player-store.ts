import {
  fallbackAvatarColor,
  isAvatarColor,
  isAvatarImage,
  type PlayerSession,
} from "@/lib/player-session";
import { redisCommand } from "@/lib/redis-store";

const playerKeyPrefix = "player:";

function normalizeStoredSession(id: string, value: unknown): PlayerSession | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<PlayerSession>;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const parsedAvatarColor = typeof parsed.avatarColor === "string" ? parsed.avatarColor : null;
  const parsedAvatarImage = typeof parsed.avatarImage === "string" ? parsed.avatarImage : null;
  const avatarColor = isAvatarColor(parsedAvatarColor) ? parsedAvatarColor : fallbackAvatarColor;
  const avatarImage = isAvatarImage(parsedAvatarImage) ? parsedAvatarImage : null;

  if (!name) return null;

  return {
    id,
    name,
    avatarColor,
    avatarImage,
    hasRecoveryEmail: parsed.hasRecoveryEmail === true,
    shareNameAllowed: parsed.shareNameAllowed === true,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

export async function loadStoredPlayerSession(id: string) {
  const raw = await redisCommand<string | null>(["GET", `${playerKeyPrefix}${id}`]);
  if (!raw) return null;

  try {
    return normalizeStoredSession(id, JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredPlayerSession(session: Omit<PlayerSession, "updatedAt"> & { updatedAt?: number }) {
  const id = session.id || crypto.randomUUID();
  const previous = await loadStoredPlayerSession(id).catch(() => null);
  const now = Date.now();
  const nextSession: PlayerSession = {
    id,
    name: session.name.trim(),
    avatarColor: isAvatarColor(session.avatarColor) ? session.avatarColor : fallbackAvatarColor,
    avatarImage: isAvatarImage(session.avatarImage) ? session.avatarImage : null,
    hasRecoveryEmail: session.hasRecoveryEmail === true,
    shareNameAllowed: typeof session.shareNameAllowed === "boolean"
      ? session.shareNameAllowed
      : previous?.shareNameAllowed === true,
    createdAt: previous?.createdAt ?? session.createdAt ?? now,
    updatedAt: session.updatedAt ?? now,
  };

  await redisCommand<"OK">(["SET", `${playerKeyPrefix}${id}`, JSON.stringify(nextSession)]);

  return nextSession;
}
