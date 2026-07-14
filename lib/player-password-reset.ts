import { createHash, randomBytes } from "node:crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  isValidEmail,
  loadPlayerAccountByEmail,
  normalizeEmail,
  resetPlayerAccountPassword,
  saveResetPlayerAccountPassword,
} from "@/lib/player-account-store";
import { redisCommand } from "@/lib/redis-store";

const resetKeyPrefix = "player-password-reset:";
const requestLimitKeyPrefix = "player-password-reset-limit:";
const resetTtlSeconds = 60 * 60;
const requestLimitSeconds = 60;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function resetKey(token: string) {
  return `${resetKeyPrefix}${digest(token)}`;
}

function resetBaseUrl(requestOrigin: string) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? "https://game-fields.com" : requestOrigin;
}

export async function requestPlayerPasswordReset(emailInput: string, requestOrigin: string) {
  if (!isValidEmail(emailInput)) return;

  const email = normalizeEmail(emailInput);
  const limitKey = `${requestLimitKeyPrefix}${digest(email)}`;
  const allowed = await redisCommand<"OK" | null>([
    "SET",
    limitKey,
    "1",
    "NX",
    "EX",
    requestLimitSeconds.toString(),
  ]);
  if (allowed !== "OK") return;

  const account = await loadPlayerAccountByEmail(email);
  if (!account?.email) return;

  const token = randomBytes(32).toString("base64url");
  const tokenKey = resetKey(token);
  await redisCommand<"OK">([
    "SET",
    tokenKey,
    account.loginName,
    "EX",
    resetTtlSeconds.toString(),
  ]);

  try {
    const resetUrl = `${resetBaseUrl(requestOrigin)}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail({
      email: account.email,
      playerName: account.name,
      resetUrl,
    });
  } catch (error) {
    await redisCommand<number>(["DEL", tokenKey]).catch(() => undefined);
    throw error;
  }
}

export async function completePlayerPasswordReset(token: string, password: string) {
  if (!token || token.length > 256) throw new Error("PLAYER_ACCOUNT_RESET_INVALID");
  const tokenKey = resetKey(token);
  const loginName = await redisCommand<string | null>(["GET", tokenKey]);
  if (!loginName) throw new Error("PLAYER_ACCOUNT_RESET_INVALID");

  const prepared = await resetPlayerAccountPassword(loginName, password);
  const applyResetScript = `
    if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
    redis.call("DEL", KEYS[1])
    return 1
  `;
  const updated = await redisCommand<number>([
    "EVAL",
    applyResetScript,
    "1",
    tokenKey,
    loginName,
  ]);
  if (updated !== 1) throw new Error("PLAYER_ACCOUNT_RESET_INVALID");
  await saveResetPlayerAccountPassword(prepared.updatedAccount);
}
