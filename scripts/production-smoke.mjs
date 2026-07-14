import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultUrl = "https://www.game-fields.com/games";

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function checkProduction({
  url = process.env.PRODUCTION_SMOKE_URL || defaultUrl,
  attempts = 3,
  timeoutMs = 10_000,
  maximumLatencyMs = 6_000,
} = {}) {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("Production smoke target must use HTTPS");
  const results = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        headers: {
          accept: "text/html",
          "user-agent": "game-fields-production-smoke/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();
      const durationMs = Math.round(performance.now() - startedAt);
      const contentType = response.headers.get("content-type") || "";
      const ok = response.status === 200
        && durationMs <= maximumLatencyMs
        && contentType.includes("text/html")
        && body.length >= 200;
      results.push({ attempt, status: response.status, durationMs, ok });
      if (ok) return { ok: true, url: target.toString(), results };
    } catch (error) {
      results.push({
        attempt,
        status: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network-error",
        durationMs: Math.round(performance.now() - startedAt),
        ok: false,
      });
    }
    if (attempt < attempts) await wait(5_000);
  }
  return { ok: false, url: target.toString(), results };
}

async function main() {
  try {
    const result = await checkProduction();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke check failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
