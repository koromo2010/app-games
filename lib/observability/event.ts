import { createHash, createHmac } from "node:crypto";
import type { ObservabilityFields, ObservabilityLevel, ObservabilityOutcome } from "@/lib/observability/types";

const stringFieldNames = [
  "game",
  "operation",
  "action",
  "roomRef",
  "actorRef",
  "eventRef",
  "commandRef",
  "phase",
  "provider",
  "model",
  "errorCode",
  "databaseCode",
] as const;
const numberFieldNames = [
  "revision",
  "playerCount",
  "round",
  "gameNumber",
  "statusCode",
  "durationMs",
  "retryAfterMs",
  "attempt",
  "affectedCount",
  "sourceCount",
] as const;
const booleanFieldNames = ["applied", "debugMode"] as const;
const outcomes = new Set<ObservabilityOutcome>(["started", "success", "rejected", "conflict", "ignored", "failed"]);

function cleanString(value: unknown, maximumLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

/** Runtime allowlist protects logs even if a caller bypasses TypeScript. */
export function sanitizeObservabilityFields(value: unknown): ObservabilityFields {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const fields: ObservabilityFields = {};

  for (const name of stringFieldNames) {
    const cleaned = cleanString(input[name]);
    if (cleaned) fields[name] = cleaned;
  }
  for (const name of numberFieldNames) {
    const number = input[name];
    if (typeof number === "number" && Number.isFinite(number)) fields[name] = Math.max(0, Math.floor(number));
  }
  for (const name of booleanFieldNames) {
    if (typeof input[name] === "boolean") fields[name] = input[name];
  }
  if (typeof input.outcome === "string" && outcomes.has(input.outcome as ObservabilityOutcome)) {
    fields.outcome = input.outcome as ObservabilityOutcome;
  }
  return fields;
}

function hashSecret() {
  return process.env.OBSERVABILITY_HASH_SECRET
    || process.env.PLAYER_SESSION_SECRET
    || process.env.LLM_SESSION_SECRET
    || "game-fields-local-observability-v1";
}

/** Stable opaque reference for correlating rooms/players without logging raw IDs. */
export function observabilityRef(kind: "room" | "actor" | "event" | "command", value: unknown) {
  const normalized = cleanString(value, 240);
  if (!normalized) return undefined;
  const digest = createHmac("sha256", hashSecret()).update(`${kind}:${normalized}`).digest("base64url").slice(0, 16);
  return `${kind}_${digest}`;
}

export function observabilityErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNEXPECTED_ERROR";
  const candidate = error.message.split(":", 1)[0]?.trim() ?? "";
  if (/^[A-Z][A-Z0-9_]{2,79}$/.test(candidate)) return candidate;
  const name = error.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80);
  return name && name !== "ERROR" ? name : "UNEXPECTED_ERROR";
}

export function isObservabilityLevelEnabled(level: ObservabilityLevel) {
  const configured = (process.env.OBSERVABILITY_LOG_LEVEL ?? "info").toLowerCase();
  const rank: Record<ObservabilityLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const minimum = configured === "debug" || configured === "warn" || configured === "error" ? configured : "info";
  return rank[level] >= rank[minimum];
}

export function traceIdFromRequest(request: Request, requestId: string) {
  const traceParent = request.headers.get("traceparent")?.trim();
  const traceId = traceParent?.split("-")[1];
  if (traceId && /^[a-f0-9]{32}$/i.test(traceId)) return traceId.toLowerCase();
  return createHash("sha256").update(requestId).digest("hex").slice(0, 32);
}
