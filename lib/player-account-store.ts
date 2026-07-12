import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  fallbackAvatarColor,
  isAvatarColor,
  isAvatarImage,
  type PlayerSession,
} from "@/lib/player-session";
import { loadStoredPlayerSession, saveStoredPlayerSession } from "@/lib/player-store";
import { redisCommand } from "@/lib/redis-store";

type PlayerAccount = {
  version: 2;
  playerId: string;
  loginName: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  email: string | null;
  avatarColor: string;
  avatarImage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PlayerAccountAuthInput = {
  name: string;
  password: string;
  email?: string;
  avatarColor?: string;
  avatarImage?: string | null;
};

const accountKeyPrefix = "player-account:";
const emailKeyPrefix = "player-account-email:";
const passwordKeyLength = 64;

export function normalizeAccountName(name: string) {
  return name.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function accountKey(name: string) {
  return `${accountKeyPrefix}${normalizeAccountName(name)}`;
}

export function normalizeEmail(email: string) {
  return email.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function isValidEmail(email: string) {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function playerAccountEmailKey(email: string) {
  const digest = createHash("sha256").update(normalizeEmail(email)).digest("hex");
  return `${emailKeyPrefix}${digest}`;
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
  const email = typeof parsed.email === "string" && isValidEmail(parsed.email)
    ? normalizeEmail(parsed.email)
    : null;
  const parsedAvatarColor = typeof parsed.avatarColor === "string" ? parsed.avatarColor : null;
  const parsedAvatarImage = typeof parsed.avatarImage === "string" ? parsed.avatarImage : null;

  if (!playerId || !loginName || !name || !passwordHash || !passwordSalt) return null;

  return {
    version: 2,
    playerId,
    loginName,
    name,
    passwordHash,
    passwordSalt,
    email,
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
  if (savedSession) {
    return saveStoredPlayerSession({
      ...savedSession,
      hasRecoveryEmail: Boolean(account.email),
    });
  }

  return {
    id: account.playerId,
    name: account.name,
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    hasRecoveryEmail: Boolean(account.email),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function registerPlayerAccount(input: PlayerAccountAuthInput) {
  const name = input.name.trim();
  const loginName = normalizeAccountName(name);
  const password = input.password;
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;

  if (!name || !loginName) {
    throw new Error("PLAYER_ACCOUNT_NAME_REQUIRED");
  }

  if (!validatePassword(password)) {
    throw new Error("PLAYER_ACCOUNT_PASSWORD_INVALID");
  }

  if (email && !isValidEmail(email)) {
    throw new Error("PLAYER_ACCOUNT_EMAIL_INVALID");
  }

  const now = Date.now();
  const playerId = randomUUID();
  const passwordSalt = randomBytes(16).toString("hex");
  const account: PlayerAccount = {
    version: 2,
    playerId,
    loginName,
    name,
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
    email,
    avatarColor: isAvatarColor(input.avatarColor ?? null) ? input.avatarColor! : fallbackAvatarColor,
    avatarImage: isAvatarImage(input.avatarImage ?? null) ? input.avatarImage! : null,
    createdAt: now,
    updatedAt: now,
  };

  if (email) {
    const createAccountScript = `
      if redis.call("EXISTS", KEYS[1]) == 1 then return 1 end
      if redis.call("EXISTS", KEYS[2]) == 1 then return 2 end
      redis.call("SET", KEYS[1], ARGV[1])
      redis.call("SET", KEYS[2], ARGV[2])
      return 0
    `;
    const result = await redisCommand<number>([
      "EVAL",
      createAccountScript,
      "2",
      accountKey(name),
      playerAccountEmailKey(email),
      JSON.stringify(account),
      loginName,
    ]);
    if (result === 1) throw new Error("PLAYER_ACCOUNT_ALREADY_EXISTS");
    if (result === 2) throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
  } else {
    const created = await redisCommand<"OK" | null>(["SET", accountKey(name), JSON.stringify(account), "NX"]);
    if (created !== "OK") {
      throw new Error("PLAYER_ACCOUNT_ALREADY_EXISTS");
    }
  }

  return saveStoredPlayerSession({
    id: playerId,
    name: account.name,
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    hasRecoveryEmail: Boolean(account.email),
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

export async function updatePlayerAccountEmail(input: PlayerAccountAuthInput) {
  const account = await loadAccount(input.name);
  if (!account || !verifyPassword(input.password, account.passwordSalt, account.passwordHash)) {
    throw new Error("PLAYER_ACCOUNT_INVALID_CREDENTIALS");
  }

  const email = input.email?.trim() ? normalizeEmail(input.email) : "";
  if (!email || !isValidEmail(email)) {
    throw new Error("PLAYER_ACCOUNT_EMAIL_INVALID");
  }

  if (account.email !== email) {
    const previousEmail = account.email;
    const updatedAccount: PlayerAccount = {
      ...account,
      email,
      updatedAt: Date.now(),
    };
    const updateEmailScript = `
      local owner = redis.call("GET", KEYS[2])
      if owner and owner ~= ARGV[1] then return 1 end
      redis.call("SET", KEYS[1], ARGV[2])
      redis.call("SET", KEYS[2], ARGV[1])
      if ARGV[3] == "1" and KEYS[3] ~= KEYS[2] then redis.call("DEL", KEYS[3]) end
      return 0
    `;
    const result = await redisCommand<number>([
      "EVAL",
      updateEmailScript,
      "3",
      accountKey(account.loginName),
      playerAccountEmailKey(email),
      previousEmail ? playerAccountEmailKey(previousEmail) : `${emailKeyPrefix}unused`,
      account.loginName,
      JSON.stringify(updatedAccount),
      previousEmail ? "1" : "0",
    ]);
    if (result === 1) throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
    return accountSession(updatedAccount);
  }

  return accountSession(account);
}

export async function loadPlayerAccountByEmail(email: string) {
  if (!isValidEmail(email)) return null;
  const loginName = await redisCommand<string | null>(["GET", playerAccountEmailKey(email)]);
  return loginName ? loadAccount(loginName) : null;
}

export async function resetPlayerAccountPassword(loginName: string, password: string) {
  if (!validatePassword(password)) {
    throw new Error("PLAYER_ACCOUNT_PASSWORD_INVALID");
  }

  const account = await loadAccount(loginName);
  if (!account) throw new Error("PLAYER_ACCOUNT_RESET_INVALID");

  const passwordSalt = randomBytes(16).toString("hex");
  const updatedAccount: PlayerAccount = {
    ...account,
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
    updatedAt: Date.now(),
  };
  return { account, updatedAccount, accountKey: accountKey(account.loginName) };
}
