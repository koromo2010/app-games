import { randomUUID } from "node:crypto";
import { getRedisConfig, redisCommand, redisPipeline } from "@/lib/redis-store";
import type { ObservabilityEvent } from "@/lib/observability/types";

const issueKey = "admin-observability-issues:v1";
const retentionMs = 7 * 24 * 60 * 60 * 1_000;
const maximumStoredIssues = 500;

export type AdminIssue = {
  id: string;
  occurredAt: number;
  level: "warn" | "error";
  event: string;
  route: string | null;
  game: string | null;
  operation: string | null;
  action: string | null;
  errorCode: string | null;
  statusCode: number | null;
  durationMs: number | null;
  deployment: string | null;
};

function storedIssue(event: ObservabilityEvent): AdminIssue {
  return {
    id: randomUUID(),
    occurredAt: Date.parse(event.occurredAt) || Date.now(),
    level: event.level === "error" ? "error" : "warn",
    event: event.event,
    route: event.route ?? null,
    game: event.fields.game ?? null,
    operation: event.fields.operation ?? null,
    action: event.fields.action ?? null,
    errorCode: event.fields.errorCode ?? null,
    statusCode: event.fields.statusCode ?? null,
    durationMs: event.fields.durationMs ?? null,
    deployment: event.deployment ?? null,
  };
}

export async function recordAdminIssue(event: ObservabilityEvent) {
  if (!getRedisConfig() || (event.level !== "warn" && event.level !== "error")) return;
  const issue = storedIssue(event);
  try {
    await redisPipeline([
      ["ZADD", issueKey, String(issue.occurredAt), JSON.stringify(issue)],
      ["ZREMRANGEBYSCORE", issueKey, "-inf", String(Date.now() - retentionMs)],
      ["ZREMRANGEBYRANK", issueKey, "0", String(-(maximumStoredIssues + 1))],
      ["EXPIRE", issueKey, String(Math.ceil(retentionMs / 1_000))],
    ]);
  } catch {
    // Monitoring must never make a game request fail.
  }
}

function parseIssue(raw: string): AdminIssue | null {
  try {
    const issue = JSON.parse(raw) as Partial<AdminIssue>;
    if (typeof issue.id !== "string" || typeof issue.occurredAt !== "number") return null;
    if (issue.level !== "warn" && issue.level !== "error") return null;
    return issue as AdminIssue;
  } catch {
    return null;
  }
}

export async function loadAdminIssues(limit = 100) {
  if (!getRedisConfig()) return [];
  const raw = await redisCommand<string[]>(["ZREVRANGE", issueKey, "0", String(Math.max(0, Math.min(500, limit) - 1))]);
  return raw.map(parseIssue).filter((issue): issue is AdminIssue => Boolean(issue));
}
