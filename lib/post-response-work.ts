import { after } from "next/server.js";

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
        console.error(`[post-response-work] ${name} failed`, error);
      }
    });
  } catch (error) {
    if (!isMissingRequestScope(error)) throw error;
    if (options.outsideRequest === "skip") return;
    await work();
  }
}
