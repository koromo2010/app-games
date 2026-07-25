import { after } from "next/server.js";
import {
  emitObservabilityEvent,
  observabilityErrorCode,
  observabilityRef,
} from "./observability/index.ts";

function isMissingRequestScope(error: unknown) {
  return error instanceof Error && error.message.includes("outside a request scope");
}

/**
 * Runs non-critical persistence after the HTTP response when a Next.js request
 * scope exists. Direct store calls (tests and maintenance scripts) retain the
 * previous awaited behavior.
 */
export async function schedulePostResponseWork(
  name: string,
  work: () => Promise<unknown>,
  options: { outsideRequest?: "run" | "skip" } = {},
) {
  try {
    after(async () => {
      try {
        await work();
      } catch (error) {
        emitObservabilityEvent("error", "post-response-work", {
          operation: "background-work",
          eventRef: observabilityRef("event", name),
          outcome: "failed",
          errorCode: observabilityErrorCode(error),
        });
      }
    });
  } catch (error) {
    if (!isMissingRequestScope(error)) throw error;
    if (options.outsideRequest === "skip") return;
    await work();
  }
}
