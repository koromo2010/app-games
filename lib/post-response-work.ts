import { after } from "next/server.js";
import {
  emitObservabilityEvent,
  observabilityErrorCode,
  observabilityRef,
} from "./observability/index.ts";
import type { ObservabilityFields } from "./observability/types.ts";
import { redisStoreObservabilityFields } from "./redis-store.ts";

function isMissingRequestScope(error: unknown) {
  return error instanceof Error && error.message.includes("outside a request scope");
}

type PostResponseWorkOptions = {
  mode?: "critical" | "best-effort";
  outsideRequest?: "run" | "skip";
  telemetryEvent?: string;
  telemetryFields?: ObservabilityFields;
  onFailure?: (
    error: unknown,
    fields: ObservabilityFields,
  ) => void;
};

/**
 * Critical persistence is awaited and rejects by default. Only explicitly
 * best-effort work may run after the HTTP response, and every failure in that
 * mode is converted to structured telemetry.
 */
export async function schedulePostResponseWork(
  name: string,
  work: () => Promise<unknown>,
  options: PostResponseWorkOptions = {},
) {
  const mode = options.mode ?? "critical";
  const failureFields = (error: unknown): ObservabilityFields => ({
    ...options.telemetryFields,
    ...redisStoreObservabilityFields(error),
    workClass: mode,
    eventRef: observabilityRef("event", name),
    outcome: "failed",
    errorCode: observabilityErrorCode(error),
  });
  const reportFailure = (error: unknown) => {
    const fields = failureFields(error);
    if (options.onFailure) {
      try {
        options.onFailure(error, fields);
        return;
      } catch {
        // Fall through to the process-safe default sink.
      }
    }
    emitObservabilityEvent(
      "error",
      options.telemetryEvent ?? "post-response-work",
      fields,
    );
  };

  if (mode === "critical") {
    try {
      await work();
      return;
    } catch (error) {
      reportFailure(error);
      throw error;
    }
  }

  const runBestEffort = async () => {
    try {
      await work();
    } catch (error) {
      reportFailure(error);
    }
  };

  try {
    after(runBestEffort);
  } catch (error) {
    if (!isMissingRequestScope(error)) {
      reportFailure(error);
      return;
    }
    if (options.outsideRequest === "skip") return;
    await runBestEffort();
  }
}
