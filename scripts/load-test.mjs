import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultBaseUrl = "http://localhost:3000";
const maximumRemoteRequests = 100;
const maximumRemoteConcurrency = 5;

function positiveNumber(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

function positiveInteger(value, fallback, name) {
  return Math.round(positiveNumber(value, fallback, name));
}

function commaSeparated(value, fallback) {
  const items = (value || fallback).split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new Error("At least one load-test path is required");
  return items;
}

export function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

export function summarizeSamples(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const failed = samples.filter((sample) => !sample.ok).length;
  const statusCounts = {};
  for (const sample of samples) {
    const key = String(sample.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  return {
    requests: samples.length,
    succeeded: samples.length - failed,
    failed,
    errorRate: samples.length === 0 ? 0 : failed / samples.length,
    statusCounts,
    latencyMs: {
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(Math.max(0, ...durations)),
    },
  };
}

export function isRemoteTarget(baseUrl) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
}

function loadConfiguration(environment = process.env) {
  const baseUrl = new URL(environment.LOAD_TEST_BASE_URL || defaultBaseUrl).toString().replace(/\/$/, "");
  const paths = commaSeparated(environment.LOAD_TEST_PATHS, "/games");
  if (paths.some((path) => !path.startsWith("/") || path.startsWith("//"))) {
    throw new Error("LOAD_TEST_PATHS must contain same-origin absolute paths");
  }

  const requests = positiveInteger(environment.LOAD_TEST_REQUESTS, 30, "LOAD_TEST_REQUESTS");
  const concurrency = positiveInteger(environment.LOAD_TEST_CONCURRENCY, 3, "LOAD_TEST_CONCURRENCY");
  const timeoutMs = positiveInteger(environment.LOAD_TEST_TIMEOUT_MS, 8_000, "LOAD_TEST_TIMEOUT_MS");
  const remote = isRemoteTarget(baseUrl);
  const maximumP95Ms = positiveNumber(environment.LOAD_TEST_MAX_P95_MS, remote ? 6_000 : 2_000, "LOAD_TEST_MAX_P95_MS");
  const maximumErrorRate = Number(environment.LOAD_TEST_MAX_ERROR_RATE ?? 0.01);
  if (!Number.isFinite(maximumErrorRate) || maximumErrorRate < 0 || maximumErrorRate > 1) {
    throw new Error("LOAD_TEST_MAX_ERROR_RATE must be between 0 and 1");
  }

  const expectedStatuses = new Set(commaSeparated(environment.LOAD_TEST_EXPECTED_STATUSES, "200").map((value) => {
    const status = Number(value);
    if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("Invalid expected HTTP status");
    return status;
  }));
  if (remote && environment.LOAD_TEST_ALLOW_REMOTE !== "1") {
    throw new Error("Remote load tests require LOAD_TEST_ALLOW_REMOTE=1");
  }
  if (remote && requests > maximumRemoteRequests) {
    throw new Error(`Remote load tests are capped at ${maximumRemoteRequests} requests`);
  }
  if (remote && concurrency > maximumRemoteConcurrency) {
    throw new Error(`Remote load tests are capped at concurrency ${maximumRemoteConcurrency}`);
  }
  if (concurrency > requests) throw new Error("LOAD_TEST_CONCURRENCY cannot exceed LOAD_TEST_REQUESTS");

  return {
    baseUrl,
    paths,
    requests,
    concurrency,
    timeoutMs,
    maximumP95Ms,
    maximumErrorRate,
    expectedStatuses,
    cookie: environment.LOAD_TEST_COOKIE?.trim() || null,
  };
}

async function requestSample(configuration, index) {
  const path = configuration.paths[index % configuration.paths.length];
  const url = new URL(path, `${configuration.baseUrl}/`);
  const headers = {
    accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    "user-agent": "game-fields-controlled-load-test/1.0",
  };
  if (configuration.cookie) headers.cookie = configuration.cookie;

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
    await response.arrayBuffer();
    return {
      path,
      status: response.status,
      ok: configuration.expectedStatuses.has(response.status),
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      path,
      status: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network-error",
      ok: false,
      durationMs: performance.now() - startedAt,
    };
  }
}

export async function runLoadTest(environment = process.env) {
  const configuration = loadConfiguration(environment);
  const startedAt = performance.now();
  const samples = new Array(configuration.requests);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < configuration.requests) {
      const index = nextIndex;
      nextIndex += 1;
      samples[index] = await requestSample(configuration, index);
    }
  }

  await Promise.all(Array.from({ length: configuration.concurrency }, () => worker()));
  const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1_000);
  const summary = summarizeSamples(samples);
  const result = {
    target: configuration.baseUrl,
    paths: configuration.paths,
    concurrency: configuration.concurrency,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    requestsPerSecond: Number((summary.requests / elapsedSeconds).toFixed(2)),
    ...summary,
    thresholds: {
      maximumP95Ms: configuration.maximumP95Ms,
      maximumErrorRate: configuration.maximumErrorRate,
    },
  };
  const passed = result.latencyMs.p95 <= configuration.maximumP95Ms
    && result.errorRate <= configuration.maximumErrorRate;
  return { passed, result };
}

async function main() {
  try {
    const { passed, result } = await runLoadTest();
    console.log(JSON.stringify(result, null, 2));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Load test failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
