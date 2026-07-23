import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  fallbackAvatarColor,
  isAvatarColor,
  isAvatarImage,
  type PlayerSession,
} from "@/lib/player-session";
import { loadStoredPlayerSession, saveStoredPlayerSession } from "@/lib/player-store";
import { redisCommand } from "@/lib/redis-store";
import { isPostgresConfigured } from "@/lib/postgres-store";
import {
  createPostgresPlayerAccount,
  loadPostgresPlayerAccountByEmail,
  loadPostgresPlayerAccountByLogin,
  savePostgresPlayerAccount,
  updatePostgresPlayerAccountProfile,
  deleteExpiredPostgresPlayerAccounts,
  deletePostgresPlayerAccount,
} from "@/lib/player-account-postgres-store";
import { usesStrictAppDatabase } from "@/lib/player-account-environment";
import { hasPlayerAccountEmailOwnerConflict } from "@/lib/player-account-migration";
import { legalConsentIsCurrent } from "@/lib/legal";
import { unverifiedAccountIsExpired, unverifiedPlayerAccountRetentionMs } from "@/lib/player-account-retention";
import { tahoiyaHistoryKeysForPlayer } from "@/lib/tahoiya-topic-history-store";
import { normalizeAppLocale, type AppLocale } from "@/lib/app-locale";
import { ensurePlayerAccountSession } from "@/lib/player-account-session";

export type PlayerAccount = {
  version: 2;
  playerId: string;
  loginName: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  email: string | null;
  avatarColor: string;
  avatarImage: string | null;
  shareNameAllowed: boolean;
  locale: AppLocale;
  termsVersion: string | null;
  termsAcceptedAt: number | null;
  privacyVersion: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PlayerAccountAuthInput = {
  name: string;
  password: string;
  email?: string;
  avatarColor?: string;
  avatarImage?: string | null;
  acceptedTerms?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
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
    shareNameAllowed: parsed.shareNameAllowed === true,
    locale: normalizeAppLocale(parsed.locale),
    termsVersion: typeof parsed.termsVersion === "string" ? parsed.termsVersion : null,
    termsAcceptedAt: typeof parsed.termsAcceptedAt === "number" ? parsed.termsAcceptedAt : null,
    privacyVersion: typeof parsed.privacyVersion === "string" ? parsed.privacyVersion : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

async function loadRedisAccount(name: string) {
  const raw = await redisCommand<string | null>(["GET", accountKey(name)]);
  if (!raw) return null;

  try {
    return normalizeAccount(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadRedisEmailOwner(email: string) {
  return redisCommand<string | null>(["GET", playerAccountEmailKey(email)]);
}

async function loadRedisAccountByEmail(email: string) {
  const loginName = await loadRedisEmailOwner(email);
  return loginName ? loadRedisAccount(loginName) : null;
}

async function mirrorAccountToRedis(account: PlayerAccount) {
  if (account.email) {
    await redisCommand<number>([
      "EVAL",
      "redis.call('SET',KEYS[1],ARGV[1]); redis.call('SET',KEYS[2],ARGV[2]); return 1",
      "2",
      accountKey(account.loginName),
      playerAccountEmailKey(account.email),
      JSON.stringify(account),
      account.loginName,
    ]);
    return;
  }
  await redisCommand<"OK">(["SET", accountKey(account.loginName), JSON.stringify(account)]);
}

async function loadAccount(name: string) {
  const loginName = normalizeAccountName(name);
  if (isPostgresConfigured()) {
    try {
      const stored = await loadPostgresPlayerAccountByLogin(loginName);
      if (stored) return normalizeAccount(stored);
      if (usesStrictAppDatabase()) return null;
    } catch (error) {
      if (usesStrictAppDatabase()) throw error;
      // Redis remains the read fallback while the existing accounts are migrated.
    }
  }

  const legacy = await loadRedisAccount(loginName);
  if (legacy && isPostgresConfigured()) {
    await savePostgresPlayerAccount(legacy).catch(() => undefined);
  }
  return legacy;
}

async function accountSession(account: PlayerAccount): Promise<PlayerSession> {
  return ensurePlayerAccountSession(account, {
    loadSession: loadStoredPlayerSession,
    saveSession: saveStoredPlayerSession,
    postgresConfigured: isPostgresConfigured,
    updatePostgresProfile: updatePostgresPlayerAccountProfile,
  });
}

export async function registerPlayerAccount(input: PlayerAccountAuthInput) {
  const name = input.name.trim();
  const loginName = normalizeAccountName(name);
  const password = input.password;
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (!legalConsentIsCurrent(input)) throw new Error("PLAYER_ACCOUNT_TERMS_REQUIRED");

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
    shareNameAllowed: false,
    locale: normalizeAppLocale(undefined),
    termsVersion: input.termsVersion!,
    termsAcceptedAt: now,
    privacyVersion: input.privacyVersion!,
    createdAt: now,
    updatedAt: now,
  };

  if (isPostgresConfigured()) {
    if (!usesStrictAppDatabase()) {
      const [legacyLogin, legacyEmail] = await Promise.all([
        loadRedisAccount(loginName),
        email ? loadRedisAccountByEmail(email) : Promise.resolve(null),
      ]);
      if (legacyLogin) throw new Error("PLAYER_ACCOUNT_ALREADY_EXISTS");
      if (legacyEmail) throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
    }

    const created = await createPostgresPlayerAccount(account);
    if (created === "login-exists") throw new Error("PLAYER_ACCOUNT_ALREADY_EXISTS");
    if (created === "email-exists") throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
    if (!usesStrictAppDatabase()) await mirrorAccountToRedis(account).catch(() => undefined);
  } else if (email) {
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
    shareNameAllowed: account.shareNameAllowed,
    hasRecoveryEmail: Boolean(account.email),
    createdAt: now,
  });
}

export async function loginPlayerAccount(input: PlayerAccountAuthInput) {
  const account = await loadAccount(input.name);
  if (!account || !verifyPassword(input.password, account.passwordSalt, account.passwordHash)) {
    throw new Error("PLAYER_ACCOUNT_INVALID_CREDENTIALS");
  }

  const activeAccount = { ...account, updatedAt: Date.now() };
  if (isPostgresConfigured()) await savePostgresPlayerAccount(activeAccount);
  if (!usesStrictAppDatabase()) await mirrorAccountToRedis(activeAccount).catch(() => undefined);
  return accountSession(activeAccount);
}

export async function deleteExpiredUnverifiedPlayerAccounts(now = Date.now()) {
  const cutoff = now - unverifiedPlayerAccountRetentionMs;
  let postgresDeleted = 0;
  if (isPostgresConfigured()) postgresDeleted = await deleteExpiredPostgresPlayerAccounts(cutoff);

  let cursor = "0";
  let redisDeleted = 0;
  do {
    const page = await redisCommand<[string, string[]]>(["SCAN", cursor, "MATCH", `${accountKeyPrefix}*`, "COUNT", "100"]);
    cursor = page[0];
    for (const key of page[1]) {
      const raw = await redisCommand<string | null>(["GET", key]);
      if (!raw) continue;
      try {
        const account = normalizeAccount(JSON.parse(raw));
        if (!account || !unverifiedAccountIsExpired(account, now)) continue;
        await redisCommand<number>(["DEL", key, `player:${account.playerId}`]);
        redisDeleted += 1;
      } catch {
        // Malformed legacy records are left in place for manual inspection.
      }
    }
  } while (cursor !== "0");

  return { cutoff, postgresDeleted, redisDeleted };
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
    if (isPostgresConfigured()) {
      const [existing, legacyOwner] = await Promise.all([
        loadPostgresPlayerAccountByEmail(email),
        usesStrictAppDatabase() ? Promise.resolve(null) : loadRedisEmailOwner(email),
      ]);
      if (hasPlayerAccountEmailOwnerConflict(account.loginName, {
        postgresLoginName: existing?.loginName ?? null,
        redisLoginName: legacyOwner,
      })) {
        throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
      }
      try {
        await savePostgresPlayerAccount(updatedAccount);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
        }
        throw error;
      }
      if (usesStrictAppDatabase()) return accountSession(updatedAccount);
    }

    const updateEmailScript = `
      local owner = redis.call("GET", KEYS[2])
      if owner and owner ~= ARGV[1] then return 1 end
      redis.call("SET", KEYS[1], ARGV[2])
      redis.call("SET", KEYS[2], ARGV[1])
      if ARGV[3] == "1" and KEYS[3] ~= KEYS[2] then redis.call("DEL", KEYS[3]) end
      return 0
    `;
    const updateRedis = () => redisCommand<number>([
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
    const result = isPostgresConfigured() ? await updateRedis().catch(() => 0) : await updateRedis();
    if (result === 1) throw new Error("PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS");
    return accountSession(updatedAccount);
  }

  return accountSession(account);
}

export async function deletePlayerAccount(input: PlayerAccountAuthInput, authenticatedPlayerId: string) {
  const account = await loadAccount(input.name);
  if (!account || account.playerId !== authenticatedPlayerId || !verifyPassword(input.password, account.passwordSalt, account.passwordHash)) {
    throw new Error("PLAYER_ACCOUNT_INVALID_CREDENTIALS");
  }

  if (isPostgresConfigured()) await deletePostgresPlayerAccount(account.playerId);
  const keys = [accountKey(account.loginName), `player:${account.playerId}`, ...tahoiyaHistoryKeysForPlayer(account.playerId)];
  if (account.email) keys.push(playerAccountEmailKey(account.email));
  await redisCommand<number>(["DEL", ...keys]);
  return { playerId: account.playerId };
}

export async function loadPlayerAccountByEmail(email: string) {
  if (!isValidEmail(email)) return null;
  const normalizedEmail = normalizeEmail(email);
  if (isPostgresConfigured()) {
    try {
      const stored = await loadPostgresPlayerAccountByEmail(normalizedEmail);
      if (stored) return normalizeAccount(stored);
      if (usesStrictAppDatabase()) return null;
    } catch (error) {
      if (usesStrictAppDatabase()) throw error;
      // Password reset remains available through the legacy index during migration.
    }
  }
  const legacy = await loadRedisAccountByEmail(normalizedEmail);
  if (legacy && isPostgresConfigured()) await savePostgresPlayerAccount(legacy).catch(() => undefined);
  return legacy;
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
  return { account, updatedAccount };
}

export async function saveResetPlayerAccountPassword(account: PlayerAccount) {
  if (isPostgresConfigured()) {
    await savePostgresPlayerAccount(account);
    if (!usesStrictAppDatabase()) await mirrorAccountToRedis(account).catch(() => undefined);
    return;
  }
  await mirrorAccountToRedis(account);
}

export async function savePlayerAccountProfile(
  playerId: string,
  profile: Pick<PlayerSession, "name" | "avatarColor" | "avatarImage" | "shareNameAllowed" | "locale" | "updatedAt">,
) {
  if (!isPostgresConfigured()) return;
  await updatePostgresPlayerAccountProfile(playerId, {
    ...profile,
    shareNameAllowed: profile.shareNameAllowed === true,
    locale: normalizeAppLocale(profile.locale),
  });
}
