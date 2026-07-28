import { createHmac } from "node:crypto";
import {
  resolveGameFieldsEnvironment,
  type GameFieldsEnvironment,
} from "./game-fields-environment.ts";

type RateLimitBudget = {
  limit: number;
  windowMs: number;
};

export type RateLimitPolicy = {
  id: string;
  ip?: RateLimitBudget;
  player?: RateLimitBudget;
  identity?: RateLimitBudget;
  creator?: RateLimitBudget;
  package?: RateLimitBudget;
  room?: RateLimitBudget;
  failClosed?: boolean;
};

export type RateLimitSubjects = {
  playerId?: string | null;
  identity?: string | null;
  creatorId?: string | null;
  packageId?: string | null;
  roomId?: string | null;
  environment?: GameFieldsEnvironment;
};

export type RedisExecutor = <T>(command: unknown[]) => Promise<T>;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  bucketCount: number;
  storeAvailable: boolean;
};

const minute = 60_000;
const tenMinutes = 10 * minute;
const hour = 60 * minute;

/**
 * IP limits deliberately allow many players behind one school/home connection;
 * player or normalized-identity buckets provide the tighter protection.
 */
export const rateLimitPolicies = {
  auth: {
    id: "auth",
    ip: { limit: 120, windowMs: tenMinutes },
    identity: { limit: 12, windowMs: tenMinutes },
  },
  passwordReset: {
    id: "password-reset",
    ip: { limit: 30, windowMs: hour },
    identity: { limit: 6, windowMs: hour },
  },
  accessAuth: {
    id: "access-auth",
    ip: { limit: 40, windowMs: tenMinutes },
    player: { limit: 12, windowMs: tenMinutes },
  },
  adminAuth: {
    id: "admin-auth",
    ip: { limit: 30, windowMs: tenMinutes },
    identity: { limit: 12, windowMs: tenMinutes },
  },
  avatarUpload: {
    id: "avatar-upload",
    ip: { limit: 150, windowMs: tenMinutes },
    player: { limit: 15, windowMs: tenMinutes },
  },
  roomMutation: {
    id: "room-mutation",
    ip: { limit: 2_500, windowMs: minute },
    player: { limit: 180, windowMs: minute },
  },
  sdkRoomMutation: {
    id: "sdk-room-mutation",
    ip: { limit: 2_500, windowMs: minute },
    player: { limit: 180, windowMs: minute },
    creator: { limit: 2_000, windowMs: minute },
    package: { limit: 1_200, windowMs: minute },
    room: { limit: 600, windowMs: minute },
    failClosed: true,
  },
  sdkRoomMutationDebug: {
    id: "sdk-room-mutation-debug",
    ip: { limit: 10_000, windowMs: minute },
    player: { limit: 1_200, windowMs: minute },
    creator: { limit: 8_000, windowMs: minute },
    package: { limit: 6_000, windowMs: minute },
    room: { limit: 3_000, windowMs: minute },
    failClosed: true,
  },
  sdkRuntimeRead: {
    id: "sdk-runtime-read",
    ip: { limit: 1_800, windowMs: minute },
    player: { limit: 120, windowMs: minute },
  },
  sdkRuntimeReadDebug: {
    id: "sdk-runtime-read-debug",
    ip: { limit: 10_000, windowMs: minute },
    player: { limit: 1_200, windowMs: minute },
  },
  aiGeneration: {
    id: "ai-generation",
    ip: { limit: 300, windowMs: tenMinutes },
    player: { limit: 30, windowMs: tenMinutes },
  },
  sdkPackageAiGeneration: {
    id: "sdk-package-ai-generation",
    identity: { limit: 300, windowMs: hour },
  },
  sdkContentRead: {
    id: "sdk-content-read",
    ip: { limit: 600, windowMs: tenMinutes },
    player: { limit: 60, windowMs: tenMinutes },
  },
  profileMutation: {
    id: "profile-mutation",
    ip: { limit: 300, windowMs: tenMinutes },
    player: { limit: 60, windowMs: tenMinutes },
  },
  feedback: {
    id: "feedback",
    ip: { limit: 300, windowMs: tenMinutes },
    player: { limit: 60, windowMs: tenMinutes },
  },
} as const satisfies Record<string, RateLimitPolicy>;

const fixedWindowScript = `
  local allowed = 1
  local retry_after = 0
  for index, key in ipairs(KEYS) do
    local argument_index = (index - 1) * 2
    local limit = tonumber(ARGV[argument_index + 1])
    local window_ms = tonumber(ARGV[argument_index + 2])
    local current = redis.call("INCR", key)
    if current == 1 then redis.call("PEXPIRE", key, window_ms) end
    local ttl = redis.call("PTTL", key)
    if ttl < 0 then
      redis.call("PEXPIRE", key, window_ms)
      ttl = window_ms
    end
    if current > limit then
      allowed = 0
      if ttl > retry_after then retry_after = ttl end
    end
  end
  return { allowed, retry_after }
`;

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashSecret() {
  return process.env.RATE_LIMIT_HASH_SECRET
    || process.env.PLAYER_SESSION_SECRET
    || process.env.LLM_SESSION_SECRET
    || "game-fields-local-rate-limit-v1";
}

type RateLimitSubjectKind =
  | "ip"
  | "player"
  | "identity"
  | "creator"
  | "package"
  | "room";

function subjectKey(
  policyId: string,
  kind: RateLimitSubjectKind,
  value: string,
  environment: GameFieldsEnvironment,
) {
  const normalized = value.trim().normalize("NFKC").toLocaleLowerCase(kind === "identity" ? "ja-JP" : "en-US");
  const digest = createHmac("sha256", hashSecret())
    .update(`${environment}:${kind}:${normalized}`)
    .digest("base64url")
    .slice(0, 24);
  return `rate-limit:v2:${environment}:${policyId}:${kind}:${digest}`;
}

function rateLimitBuckets(request: Request, policy: RateLimitPolicy, subjects: RateLimitSubjects) {
  const buckets: { key: string; budget: RateLimitBudget }[] = [];
  const environment = resolveGameFieldsEnvironment(subjects.environment);
  if (policy.ip) buckets.push({ key: subjectKey(policy.id, "ip", clientAddress(request), environment), budget: policy.ip });
  if (policy.player && subjects.playerId) buckets.push({ key: subjectKey(policy.id, "player", subjects.playerId, environment), budget: policy.player });
  if (policy.identity && subjects.identity?.trim()) buckets.push({ key: subjectKey(policy.id, "identity", subjects.identity, environment), budget: policy.identity });
  if (policy.creator && subjects.creatorId?.trim()) buckets.push({ key: subjectKey(policy.id, "creator", subjects.creatorId, environment), budget: policy.creator });
  if (policy.package && subjects.packageId?.trim()) buckets.push({ key: subjectKey(policy.id, "package", subjects.packageId, environment), budget: policy.package });
  if (policy.room && subjects.roomId?.trim()) buckets.push({ key: subjectKey(policy.id, "room", subjects.roomId, environment), budget: policy.room });
  return buckets;
}

export async function checkRateLimitCore(
  request: Request,
  policy: RateLimitPolicy,
  subjects: RateLimitSubjects,
  execute: RedisExecutor,
): Promise<RateLimitResult> {
  const buckets = rateLimitBuckets(request, policy, subjects);
  if (!buckets.length) return { allowed: true, retryAfterMs: 0, bucketCount: 0, storeAvailable: true };

  const command: unknown[] = [
    "EVAL",
    fixedWindowScript,
    String(buckets.length),
    ...buckets.map((bucket) => bucket.key),
    ...buckets.flatMap((bucket) => [String(bucket.budget.limit), String(bucket.budget.windowMs)]),
  ];

  try {
    const result = await execute<[number | string, number | string]>(command);
    return {
      allowed: Number(result[0]) === 1,
      retryAfterMs: Math.max(0, Number(result[1]) || 0),
      bucketCount: buckets.length,
      storeAvailable: true,
    };
  } catch {
    return {
      allowed: policy.failClosed !== true,
      retryAfterMs: policy.failClosed === true ? 1_000 : 0,
      bucketCount: buckets.length,
      storeAvailable: false,
    };
  }
}

export function rateLimitResponse(result: RateLimitResult) {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return Response.json(
    { error: "RATE_LIMITED", retryAfterMs: result.retryAfterMs },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
