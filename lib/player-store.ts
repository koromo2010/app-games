import {
  fallbackAvatarColor,
  isAvatarColor,
  isAvatarImage,
  type PlayerSession,
} from "@/lib/player-session";

type RedisResponse<T> = {
  result: T;
  error?: string;
};

const playerKeyPrefix = "player:";

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return {
    url: url.replace(/\/$/, ""),
    token,
  };
}

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
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

async function redisCommand<T>(command: unknown[]) {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("PLAYER_STORE_NOT_CONFIGURED");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PLAYER_STORE_REQUEST_FAILED_${response.status}`);
  }

  const data = (await response.json()) as RedisResponse<T>;
  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
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
    createdAt: previous?.createdAt ?? session.createdAt ?? now,
    updatedAt: session.updatedAt ?? now,
  };

  await redisCommand<"OK">(["SET", `${playerKeyPrefix}${id}`, JSON.stringify(nextSession)]);

  return nextSession;
}
