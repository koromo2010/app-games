import type { ObservabilityEvent, ObservabilitySink } from "./types.ts";
import { recordAdminIssue } from "../admin-observability-store.ts";
import { observabilityErrorCode } from "./event.ts";
import { redisStoreObservabilityFields } from "../redis-store.ts";

export function reportObservabilitySinkFailure(
  source: ObservabilityEvent,
  error: unknown,
  operation: "admin-issue-store" | "event-sink",
) {
  const fallback: ObservabilityEvent = {
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "error",
    event: "observability.sink-failure",
    service: source.service,
    environment: source.environment,
    ...(source.deployment ? { deployment: source.deployment } : {}),
    ...(source.region ? { region: source.region } : {}),
    fields: {
      operation,
      ...redisStoreObservabilityFields(error),
      outcome: "failed",
      errorCode: observabilityErrorCode(error),
    },
  };
  console.error(JSON.stringify(fallback));
}

export const consoleObservabilitySink: ObservabilitySink = {
  emit(event: ObservabilityEvent) {
    const line = JSON.stringify(event);
    if (event.level === "error") console.error(line);
    else if (event.level === "warn") console.warn(line);
    else console.info(line);
    if (event.level === "warn" || event.level === "error") {
      void recordAdminIssue(event).catch((error) => {
        reportObservabilitySinkFailure(
          event,
          error,
          "admin-issue-store",
        );
      });
    }
  },
};

let activeSink: ObservabilitySink = consoleObservabilitySink;

export function getObservabilitySink() {
  return activeSink;
}

/** Allows an OTLP/HTTP adapter after the observability collector is separated. */
export function setObservabilitySink(sink: ObservabilitySink) {
  activeSink = sink;
}
