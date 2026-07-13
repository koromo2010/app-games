import { randomUUID } from "node:crypto";
import {
  isObservabilityLevelEnabled,
  observabilityErrorCode,
  observabilityRef,
  sanitizeObservabilityFields,
  traceIdFromRequest,
} from "@/lib/observability/event";
import { getObservabilitySink } from "@/lib/observability/sink";
import type { ObservabilityFields, ObservabilityLevel } from "@/lib/observability/types";

type RequestLogBase = Pick<ObservabilityFields, "game" | "operation">;

function runtimeMetadata() {
  return {
    service: process.env.OBSERVABILITY_SERVICE_NAME || "app-games-web",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    region: process.env.VERCEL_REGION,
  };
}

export function emitObservabilityEvent(
  level: ObservabilityLevel,
  event: string,
  fields: ObservabilityFields = {},
  context: { route?: string; method?: string; requestId?: string; traceId?: string } = {},
) {
  if (!isObservabilityLevelEnabled(level)) return;
  const eventName = event.trim().replace(/[^a-z0-9._-]/gi, "_").slice(0, 100) || "unknown";
  void getObservabilitySink().emit({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level,
    event: eventName,
    ...runtimeMetadata(),
    ...context,
    fields: sanitizeObservabilityFields(fields),
  });
}

export function createRequestTelemetry(request: Request, route: string, base: RequestLogBase = {}) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id")
    || request.headers.get("x-request-id")
    || randomUUID();
  const context = {
    route,
    method: request.method,
    requestId: requestId.slice(0, 160),
    traceId: traceIdFromRequest(request, requestId),
  };
  const common = sanitizeObservabilityFields(base);
  const withCommon = (fields: ObservabilityFields) => ({ ...common, ...fields });
  const duration = () => Math.max(0, Date.now() - startedAt);

  return {
    requestId,
    roomRef: (code: unknown) => observabilityRef("room", code),
    actorRef: (id: unknown) => observabilityRef("actor", id),
    eventRef: (id: unknown) => observabilityRef("event", id),
    commandRef: (id: unknown) => observabilityRef("command", id),
    info(event: string, fields: ObservabilityFields = {}) {
      emitObservabilityEvent("info", event, withCommon(fields), context);
    },
    success(event: string, fields: ObservabilityFields = {}) {
      emitObservabilityEvent("info", event, withCommon({ ...fields, outcome: "success", durationMs: duration() }), context);
    },
    reject(event: string, statusCode: number, fields: ObservabilityFields = {}) {
      const outcome = statusCode === 409 ? "conflict" : "rejected";
      emitObservabilityEvent(statusCode >= 500 ? "error" : "warn", event, withCommon({ ...fields, outcome, statusCode, durationMs: duration() }), context);
    },
    failure(event: string, error: unknown, statusCode = 500, fields: ObservabilityFields = {}) {
      emitObservabilityEvent("error", event, withCommon({ ...fields, outcome: "failed", statusCode, durationMs: duration(), errorCode: observabilityErrorCode(error) }), context);
    },
    responseError(event: string, error: unknown, statusCode: number, fields: ObservabilityFields = {}) {
      const outcome = statusCode >= 500 ? "failed" : statusCode === 409 ? "conflict" : "rejected";
      const level: ObservabilityLevel = statusCode >= 500 ? "error" : "warn";
      emitObservabilityEvent(level, event, withCommon({ ...fields, outcome, statusCode, durationMs: duration(), errorCode: observabilityErrorCode(error) }), context);
    },
  };
}
