import type { ObservabilityEvent, ObservabilitySink } from "@/lib/observability/types";
import { recordAdminIssue } from "@/lib/admin-observability-store";

export const consoleObservabilitySink: ObservabilitySink = {
  emit(event: ObservabilityEvent) {
    const line = JSON.stringify(event);
    if (event.level === "error") console.error(line);
    else if (event.level === "warn") console.warn(line);
    else console.info(line);
    if (event.level === "warn" || event.level === "error") void recordAdminIssue(event);
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
