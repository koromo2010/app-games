import { emitObservabilityEvent } from "@/lib/observability";
import {
  checkRateLimitCore,
  rateLimitPolicies,
  rateLimitResponse,
  type RateLimitPolicy,
  type RateLimitResult,
  type RateLimitSubjects,
  type RedisExecutor,
} from "@/lib/rate-limit-core";
import { redisCommand } from "@/lib/redis-store";

export { rateLimitPolicies, rateLimitResponse };
export type { RateLimitPolicy, RateLimitResult };

export async function checkRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  subjects: RateLimitSubjects = {},
  execute: RedisExecutor = redisCommand,
) {
  const result = await checkRateLimitCore(request, policy, subjects, execute);
  if (!result.storeAvailable) {
    emitObservabilityEvent("warn", "rate-limit.store", {
      operation: policy.id,
      outcome: "ignored",
      errorCode: "RATE_LIMIT_STORE_UNAVAILABLE",
    });
  }
  return result;
}

export async function rateLimitResponseFor(
  request: Request,
  policy: RateLimitPolicy,
  subjects: RateLimitSubjects = {},
) {
  const result = await checkRateLimit(request, policy, subjects);
  if (result.allowed) return null;
  emitObservabilityEvent("warn", "request.rate-limit", {
    operation: policy.id,
    outcome: "rejected",
    retryAfterMs: result.retryAfterMs,
    sourceCount: result.bucketCount,
  });
  return rateLimitResponse(result);
}
