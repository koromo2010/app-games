import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  fallbackAvatarColor,
  isAvatarColor,
  isAvatarImage,
  type PlayerSession,
} from "@/lib/player-session";
import { loadStoredPlayerSession, saveStoredPlayerSession } from "@/lib/player-store";
import { redisCommand } from "@/lib/redis-store";

type PlayerAccount = {
  version: 1;
  playerId: string;
  loginName: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  avatarColor: string;
  avatarImage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PlayerAccountAuthInput = {
  name: string;
  password: string;
  avatarColor?: string;
  avatarImage?: string | null;
};

const accountKeyPrefix = "player-account:";
const passwordKeyLength = 64;

export function normalizeAccountName(name: string) {
  return name.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function accountKey(name: string) {
  return `${accountKeyPrefix}${normalizeAccountName(name)}`;
}

function validatePassword(password: string) {
  return password.length >= 4 && password.length <= 128;
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, passwordKeyLength).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeAccount(value: unknown): PlayerAccount | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<PlayerAccount>;
  const playerId = typeof parsed.playerId === "string" ? parsed.playerId : "";
  const loginName = typeof parsed.loginName === "string" ? parsed.loginName : "";
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const passwordHash = typeof parsed.passwordHash === "string" ? parsed.passwordHash : "";
  const passwordSalt = typeof parsed.passwordSalt === "string" ? parsed.passwordSalt : "";
  const parsedAvatarColor = typeof parsed.avatarColor === "string" ? parsed.avatarColor : null;
  const parsedAvatarImage = typeof parsed.avatarImage === "string" ? parsed.avatarImage : null;

  if (!playerId || !loginName || !name || !passwordHash || !passwordSalt) return null;

  return {
    version: 1,
    playerId,
    loginName,
    name,
    passwordHash,
    passwordSalt,
    avatarColor: isAvatarColor(parsedAvatarColor) ? parsedAvatarColor : fallbackAvatarColor,
    avatarImage: isAvatarImage(parsedAvatarImage) ? parsedAvatarImage : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

async function loadAccount(name: string) {
  const raw = await redisCommand<string | null>(["GET", accountKey(name)]);
  if (!raw) return null;

  try {
    return normalizeAccount(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function accountSession(account: PlayerAccount): Promise<PlayerSession> {
  const savedSession = await loadStoredPlayerSession(account.playerId).catch(() => null);
  if (savedSession) return savedSession;

  return {
    id: account.playerId,
    name: account.name,
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function registerPlayerAccount(input: PlayerAccountAuthInput) {
  const name = input.name.trim();
  const loginName = normalizeAccountName(name);
  const password = input.password;

  if (!name || !loginName) {
    throw new Error("PLAYER_ACCOUNT_NAME_REQUIRED");
  }

  if (!validatePassword(password)) {
    throw new Error("PLAYER_ACCOUNT_PASSWORD_INVALID");
  }

  const now = Date.now();
  const playerId = randomUUID();
  const passwordSalt = randomBytes(16).toString("hex");
  const account: PlayerAccount = {
    version: 1,
    playerId,
    loginName,
    name,
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
    avatarColor: isAvatarColor(input.avatarColor ?? null) ? input.avatarColor! : fallbackAvatarColor,
    avatarImage: isAvatarImage(input.avatarImage ?? null) ? input.avatarImage! : null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await redisCommand<"OK" | null>(["SET", accountKey(name), JSON.stringify(account), "NX"]);
  if (created !== "OK") {
    throw new Error("PLAYER_ACCOUNT_ALREADY_EXISTS");
  }

  return saveStoredPlayerSession({
    id: playerId,
    name: account.name,
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    createdAt: now,
  });
}

export async function loginPlayerAccount(input: PlayerAccountAuthInput) {
  const account = await loadAccount(input.name);
  if (!account || !verifyPassword(input.password, account.passwordSalt, account.passwordHash)) {
    throw new Error("PLAYER_ACCOUNT_INVALID_CREDENTIALS");
  }

  return accountSession(account);
}
