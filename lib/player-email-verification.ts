import { createHash, randomBytes } from "node:crypto";
import { sendRecoveryEmailVerificationEmail } from "@/lib/email";
import {
  confirmPlayerAccountEmail,
  prepareExistingPlayerAccountEmailVerification,
  preparePlayerAccountEmailVerification,
  type PlayerAccountAuthInput,
} from "@/lib/player-account-store";
import {
  parsePlayerEmailVerificationPayload,
  type PlayerEmailVerificationPayload,
} from "@/lib/player-email-verification-policy";
import { redisCommand } from "@/lib/redis-store";

const verificationKeyPrefix = "player-email-verification:";
const pendingKeyPrefix = "player-email-verification-pending:";
const verificationTtlSeconds = 60 * 60;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function verificationKey(tokenDigest: string) {
  return `${verificationKeyPrefix}${tokenDigest}`;
}

function pendingKey(playerId: string) {
  return `${pendingKeyPrefix}${playerId}`;
}

function verificationBaseUrl(requestOrigin: string) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? "https://game-fields.com" : requestOrigin;
}

type PreparedPlayerEmailVerification = Awaited<ReturnType<typeof preparePlayerAccountEmailVerification>>;

async function sendPreparedPlayerEmailVerification(
  prepared: PreparedPlayerEmailVerification,
  requestOrigin: string,
) {
  if (prepared.alreadyVerified) {
    return { session: prepared.session, pending: false };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenDigest = digest(token);
  const tokenKey = verificationKey(tokenDigest);
  const playerPendingKey = pendingKey(prepared.candidate.playerId);
  const previousDigest = await redisCommand<string | null>(["GET", playerPendingKey]);
  const previousTokenKey = previousDigest ? verificationKey(previousDigest) : `${verificationKeyPrefix}unused`;
  const payload: PlayerEmailVerificationPayload = {
    version: 1,
    playerId: prepared.candidate.playerId,
    loginName: prepared.candidate.loginName,
    email: prepared.candidate.email,
    issuedAt: Date.now(),
  };

  await redisCommand<number>([
    "EVAL",
    `
      redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
      redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
      if KEYS[3] ~= KEYS[1] then redis.call("DEL", KEYS[3]) end
      return 1
    `,
    "3",
    tokenKey,
    playerPendingKey,
    previousTokenKey,
    JSON.stringify(payload),
    tokenDigest,
    verificationTtlSeconds.toString(),
  ]);

  try {
    const verificationUrl = `${verificationBaseUrl(requestOrigin)}/verify-email?token=${encodeURIComponent(token)}`;
    await sendRecoveryEmailVerificationEmail({
      email: prepared.candidate.email,
      playerName: prepared.candidate.playerName,
      verificationUrl,
    });
  } catch (error) {
    await redisCommand<number>([
      "EVAL",
      `
        if redis.call("GET", KEYS[2]) == ARGV[1] then
          redis.call("DEL", KEYS[1], KEYS[2])
          return 1
        end
        return 0
      `,
      "2",
      tokenKey,
      playerPendingKey,
      tokenDigest,
    ]).catch(() => undefined);
    throw error;
  }

  return { session: prepared.session, pending: true };
}

export async function requestPlayerEmailVerification(
  input: PlayerAccountAuthInput,
  requestOrigin: string,
) {
  return sendPreparedPlayerEmailVerification(
    await preparePlayerAccountEmailVerification(input),
    requestOrigin,
  );
}

export async function resendPlayerEmailVerification(
  input: PlayerAccountAuthInput,
  authenticatedPlayerId: string,
  requestOrigin: string,
) {
  return sendPreparedPlayerEmailVerification(
    await prepareExistingPlayerAccountEmailVerification(input, authenticatedPlayerId),
    requestOrigin,
  );
}

export async function completePlayerEmailVerification(token: string) {
  if (!token || token.length > 256) throw new Error("PLAYER_ACCOUNT_EMAIL_VERIFICATION_INVALID");
  const tokenDigest = digest(token);
  const tokenKey = verificationKey(tokenDigest);
  const [raw, ttl] = await Promise.all([
    redisCommand<string | null>(["GET", tokenKey]),
    redisCommand<number>(["TTL", tokenKey]),
  ]);
  if (!raw || ttl <= 0) throw new Error("PLAYER_ACCOUNT_EMAIL_VERIFICATION_INVALID");

  const payload = parsePlayerEmailVerificationPayload(raw);
  if (!payload) throw new Error("PLAYER_ACCOUNT_EMAIL_VERIFICATION_INVALID");
  const playerPendingKey = pendingKey(payload.playerId);
  const consumed = await redisCommand<number>([
    "EVAL",
    `
      if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
      if redis.call("GET", KEYS[2]) ~= ARGV[2] then return 0 end
      redis.call("DEL", KEYS[1], KEYS[2])
      return 1
    `,
    "2",
    tokenKey,
    playerPendingKey,
    raw,
    tokenDigest,
  ]);
  if (consumed !== 1) throw new Error("PLAYER_ACCOUNT_EMAIL_VERIFICATION_INVALID");

  try {
    await confirmPlayerAccountEmail({
      playerId: payload.playerId,
      loginName: payload.loginName,
      email: payload.email,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "PLAYER_ACCOUNT_EMAIL_ALREADY_EXISTS") {
      await Promise.all([
        redisCommand<"OK" | null>(["SET", tokenKey, raw, "NX", "EX", ttl.toString()]),
        redisCommand<"OK" | null>(["SET", playerPendingKey, tokenDigest, "NX", "EX", ttl.toString()]),
      ]).catch(() => undefined);
    }
    throw error;
  }
}
