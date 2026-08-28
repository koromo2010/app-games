import { createHash } from "node:crypto";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 4_000;
const DEFAULT_INVOCATION_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 40;
const DEFAULT_BREAKER_FAILURE_THRESHOLD = 2;
const DEFAULT_BREAKER_OPEN_MS = 2_000;
const MAX_RUNNER_RESPONSE_BYTES = 1024 * 1024;
const TRANSIENT_RUNNER_STATUSES = new Set([408, 502, 503, 504]);

export const GAME_SDK_RUNNER_OPERATIONS = [
  "manifest",
  "create-room",
  "apply-command",
  "apply-command-and-present",
  "present-room",
  "resource-effect-pass",
] as const;

export type GameSdkRunnerOperation =
  (typeof GAME_SDK_RUNNER_OPERATIONS)[number];

export type GameSdkRunnerBreakerState = "closed" | "open" | "half-open";

export type GameSdkRunnerClientEvent = {
  type:
    | "attempt"
    | "failure"
    | "retry"
    | "breaker-open"
    | "breaker-half-open"
    | "breaker-closed";
  operation: GameSdkRunnerOperation;
  attempt?: number;
  state?: GameSdkRunnerBreakerState;
  errorCode?: string;
  statusCode?: number;
};

export type GameSdkRunnerInvocationBudget = {
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly clock: () => number;
};

export type GameSdkRunnerResilienceOptions = {
  attemptTimeoutMs?: number;
  invocationTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  clock?: () => number;
  breakerRegistry?: GameSdkRunnerCircuitBreakerRegistry;
  onEvent?: (event: GameSdkRunnerClientEvent) => void;
};

type RunnerFailureKind =
  | "artifact"
  | "authentication"
  | "configuration"
  | "response"
  | "timeout"
  | "transport"
  | "unavailable";

type RunnerFailureScope = "artifact" | "service" | "none";

export class GameSdkRunnerClientError extends Error {
  readonly code: string;
  readonly failureKind: RunnerFailureKind;
  readonly outcome: "known" | "unknown";
  readonly retryable: boolean;
  readonly failureScope: RunnerFailureScope;
  readonly statusCode?: number;

  constructor(input: {
    code: string;
    failureKind: RunnerFailureKind;
    outcome?: "known" | "unknown";
    retryable?: boolean;
    failureScope?: RunnerFailureScope;
    statusCode?: number;
  }) {
    super(input.code);
    this.name = "GameSdkRunnerClientError";
    this.code = input.code;
    this.failureKind = input.failureKind;
    this.outcome = input.outcome ?? "known";
    this.retryable = input.retryable ?? false;
    this.failureScope = input.failureScope ?? "none";
    this.statusCode = input.statusCode;
  }
}

type BreakerEntry = {
  state: GameSdkRunnerBreakerState;
  failures: number;
  openedAt: number;
  probeInFlight: boolean;
};

export type GameSdkRunnerBreakerPermit = {
  readonly key: string;
  readonly state: GameSdkRunnerBreakerState;
  readonly probe: boolean;
};

export class GameSdkRunnerCircuitBreakerRegistry {
  readonly #failureThreshold: number;
  readonly #openMs: number;
  readonly #clock: () => number;
  readonly #entries = new Map<string, BreakerEntry>();

  constructor(options: {
    failureThreshold?: number;
    openMs?: number;
    clock?: () => number;
  } = {}) {
    this.#failureThreshold = positiveInteger(
      options.failureThreshold,
      DEFAULT_BREAKER_FAILURE_THRESHOLD,
      1,
    );
    this.#openMs = positiveInteger(
      options.openMs,
      DEFAULT_BREAKER_OPEN_MS,
      1,
    );
    this.#clock = options.clock ?? Date.now;
  }

  acquire(key: string): GameSdkRunnerBreakerPermit | null {
    const current = this.#entries.get(key);
    if (!current) return { key, state: "closed", probe: false };
    if (current.state === "closed") {
      return { key, state: "closed", probe: false };
    }
    if (
      current.state === "open"
      && this.#clock() - current.openedAt >= this.#openMs
    ) {
      current.state = "half-open";
      current.probeInFlight = false;
    }
    if (current.state === "open" || current.probeInFlight) return null;
    current.probeInFlight = true;
    return { key, state: "half-open", probe: true };
  }

  success(permit: GameSdkRunnerBreakerPermit) {
    const current = this.#entries.get(permit.key);
    if (!current) return false;
    const recovered = current.state !== "closed" || permit.probe;
    this.#entries.delete(permit.key);
    return recovered;
  }

  failure(permit: GameSdkRunnerBreakerPermit) {
    const current = this.#entries.get(permit.key) ?? {
      state: "closed" as const,
      failures: 0,
      openedAt: 0,
      probeInFlight: false,
    };
    current.probeInFlight = false;
    current.failures += 1;
    const opened = permit.probe || current.failures >= this.#failureThreshold;
    if (opened) {
      current.state = "open";
      current.openedAt = this.#clock();
    } else {
      current.state = "closed";
    }
    this.#entries.set(permit.key, current);
    return opened;
  }

  trip(permit: GameSdkRunnerBreakerPermit) {
    this.#entries.set(permit.key, {
      state: "open",
      failures: this.#failureThreshold,
      openedAt: this.#clock(),
      probeInFlight: false,
    });
  }

  neutral(permit: GameSdkRunnerBreakerPermit) {
    const current = this.#entries.get(permit.key);
    if (!current || !permit.probe) return;
    current.state = "open";
    current.openedAt = this.#clock();
    current.probeInFlight = false;
  }

  state(key: string): GameSdkRunnerBreakerState {
    const current = this.#entries.get(key);
    if (!current) return "closed";
    if (
      current.state === "open"
      && this.#clock() - current.openedAt >= this.#openMs
    ) return "half-open";
    return current.state;
  }
}

const sharedRunnerBreakerRegistry = new GameSdkRunnerCircuitBreakerRegistry();

function positiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError("Game SDK runner resilience limits must be positive integers.");
  }
  return value;
}

function resilienceOptions(options: GameSdkRunnerResilienceOptions = {}) {
  return {
    attemptTimeoutMs: positiveInteger(
      options.attemptTimeoutMs,
      DEFAULT_ATTEMPT_TIMEOUT_MS,
      1,
    ),
    invocationTimeoutMs: positiveInteger(
      options.invocationTimeoutMs,
      DEFAULT_INVOCATION_TIMEOUT_MS,
      1,
    ),
    maxAttempts: positiveInteger(
      options.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
      1,
    ),
    retryBaseDelayMs: positiveInteger(
      options.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS,
      0,
    ),
    random: options.random ?? Math.random,
    sleep: options.sleep ?? ((milliseconds: number) => (
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    )),
    clock: options.clock ?? Date.now,
    breakerRegistry: options.breakerRegistry ?? sharedRunnerBreakerRegistry,
    onEvent: options.onEvent,
  };
}

export function createGameSdkRunnerInvocationBudget(
  options: GameSdkRunnerResilienceOptions = {},
): GameSdkRunnerInvocationBudget {
  const resolved = resilienceOptions(options);
  const startedAt = resolved.clock();
  return {
    startedAt,
    deadlineAt: startedAt + resolved.invocationTimeoutMs,
    clock: resolved.clock,
  };
}

export function gameSdkRunnerBudgetRemaining(
  budget: GameSdkRunnerInvocationBudget,
) {
  return Math.max(0, budget.deadlineAt - budget.clock());
}

export async function runWithinGameSdkRunnerBudget<T>(
  budget: GameSdkRunnerInvocationBudget,
  operation: () => Promise<T>,
  timeoutErrorCode: string,
) {
  const remaining = gameSdkRunnerBudgetRemaining(budget);
  if (remaining <= 0) throw new Error(timeoutErrorCode);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutErrorCode)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dependencyKeys(url: string, artifactIdentity: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID",
      failureKind: "configuration",
    });
  }
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]";
  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^[a-f0-9]{64}$/.test(artifactIdentity)
  ) {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID",
      failureKind: "configuration",
    });
  }
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  return {
    service: `service:${hash(parsed.origin)}`,
    artifact: `artifact:${hash(`${parsed.origin}${parsed.pathname}:${artifactIdentity}`)}`,
  };
}

function stableReplayIdentity(
  operation: GameSdkRunnerOperation,
  requestId: string | undefined,
) {
  if (operation === "manifest") return true;
  if (operation === "present-room") return false;
  return typeof requestId === "string" && requestId.length > 0;
}

function errorPayloadCode(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && /^[A-Z][A-Z0-9_]{2,99}$/.test(error)
    ? error
    : "";
}

function httpFailure(status: number, payload: unknown) {
  const upstream = errorPayloadCode(payload);
  if (status === 401 || status === 403 || upstream.includes("TOKEN") || upstream.includes("GRANT_")) {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_AUTH_FAILED",
      failureKind: "authentication",
      statusCode: status,
    });
  }
  if (
    upstream === "SERVER_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND"
    || upstream === "SERVER_RUNTIME_BUNDLE_NOT_FOUND"
  ) {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_ARTIFACT_NOT_FOUND",
      failureKind: "artifact",
      failureScope: "artifact",
      statusCode: status,
    });
  }
  if (upstream === "SERVER_RUNTIME_BUNDLE_HASH_MISMATCH") {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_ARTIFACT_HASH_MISMATCH",
      failureKind: "artifact",
      failureScope: "artifact",
      statusCode: status,
    });
  }
  if (upstream === "SERVER_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE") {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_ARTIFACT_SOURCE_UNAVAILABLE",
      failureKind: "unavailable",
      retryable: true,
      failureScope: "service",
      statusCode: status,
    });
  }
  if (
    upstream === "SERVER_RUNTIME_NOT_CONFIGURED"
    || upstream === "SERVER_RUNTIME_SOURCE_NOT_CONFIGURED"
  ) {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID",
      failureKind: "configuration",
      statusCode: status,
    });
  }
  if (TRANSIENT_RUNNER_STATUSES.has(status) || status >= 500) {
    return new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_UNAVAILABLE",
      failureKind: "unavailable",
      retryable: true,
      failureScope: "service",
      statusCode: status,
    });
  }
  return new GameSdkRunnerClientError({
    code: "GAME_SDK_REMOTE_RUNNER_REJECTED",
    failureKind: "response",
    statusCode: status,
  });
}

async function readPayload(
  response: Response,
  remaining: number,
  controller: AbortController,
) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RUNNER_RESPONSE_BYTES) {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RESPONSE_TOO_LARGE",
      failureKind: "response",
      failureScope: "service",
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      response.text(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GameSdkRunnerClientError({
            code: "GAME_SDK_REMOTE_RUNNER_TIMEOUT",
            failureKind: "timeout",
            outcome: "unknown",
            retryable: true,
            failureScope: "service",
          }));
        }, remaining);
      }),
    ]);
    if (Buffer.byteLength(text, "utf8") > MAX_RUNNER_RESPONSE_BYTES) {
      throw new GameSdkRunnerClientError({
        code: "GAME_SDK_REMOTE_RESPONSE_TOO_LARGE",
        failureKind: "response",
        failureScope: "service",
      });
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) return null;
      throw new GameSdkRunnerClientError({
        code: "GAME_SDK_REMOTE_RESPONSE_INVALID",
        failureKind: "response",
        failureScope: "service",
      });
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchAttempt(input: {
  url: string;
  token: string;
  body: string;
  headers?: Record<string, string>;
  fetchRunner: typeof fetch;
  attemptTimeoutMs: number;
  budget: GameSdkRunnerInvocationBudget;
}) {
  const remaining = Math.min(
    input.attemptTimeoutMs,
    gameSdkRunnerBudgetRemaining(input.budget),
  );
  if (remaining <= 0) {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_TIMEOUT",
      failureKind: "timeout",
      outcome: "known",
      failureScope: "service",
    });
  }
  const controller = new AbortController();
  const attemptDeadlineAt = input.budget.clock() + remaining;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      input.fetchRunner(input.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          ...input.headers,
        },
        body: input.body,
        cache: "no-store",
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GameSdkRunnerClientError({
            code: "GAME_SDK_REMOTE_RUNNER_TIMEOUT",
            failureKind: "timeout",
            outcome: "unknown",
            retryable: true,
            failureScope: "service",
          }));
        }, remaining);
      }),
    ]);
    const payload = await readPayload(
      response,
      Math.max(1, Math.min(
        attemptDeadlineAt - input.budget.clock(),
        gameSdkRunnerBudgetRemaining(input.budget),
      )),
      controller,
    );
    if (!response.ok) throw httpFailure(response.status, payload);
    return { response, payload };
  } catch (error) {
    if (error instanceof GameSdkRunnerClientError) throw error;
    if (controller.signal.aborted) {
      throw new GameSdkRunnerClientError({
        code: "GAME_SDK_REMOTE_RUNNER_TIMEOUT",
        failureKind: "timeout",
        outcome: "unknown",
        retryable: true,
        failureScope: "service",
      });
    }
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_OUTCOME_UNKNOWN",
      failureKind: "transport",
      outcome: "unknown",
      retryable: true,
      failureScope: "service",
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function recordBreakerFailure(
  registry: GameSdkRunnerCircuitBreakerRegistry,
  error: GameSdkRunnerClientError,
  servicePermit: GameSdkRunnerBreakerPermit,
  artifactPermit: GameSdkRunnerBreakerPermit,
) {
  if (error.failureScope === "artifact") {
    registry.success(servicePermit);
    registry.trip(artifactPermit);
    return "artifact" as const;
  }
  if (error.failureScope === "service") {
    registry.failure(servicePermit);
    registry.neutral(artifactPermit);
    return "service" as const;
  }
  registry.success(servicePermit);
  registry.neutral(artifactPermit);
  return "none" as const;
}

function breakerStateEvent(
  onEvent: ((event: GameSdkRunnerClientEvent) => void) | undefined,
  operation: GameSdkRunnerOperation,
  type: "breaker-open" | "breaker-half-open" | "breaker-closed",
  state: GameSdkRunnerBreakerState,
) {
  onEvent?.({ type, operation, state });
}

export async function invokeGameSdkRunner(input: {
  url: string;
  token: string;
  artifactIdentity: string;
  operation: GameSdkRunnerOperation;
  request: unknown;
  requestId?: string;
  headers?: Record<string, string>;
  fetchRunner?: typeof fetch;
  budget?: GameSdkRunnerInvocationBudget;
  resilience?: GameSdkRunnerResilienceOptions;
}) {
  if (
    !input.token
    || input.token.length > 4_096
    || !/^[\x21-\x7e]+$/.test(input.token)
  ) {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID",
      failureKind: "configuration",
    });
  }
  let body: string;
  try {
    body = JSON.stringify(input.request);
  } catch {
    throw new GameSdkRunnerClientError({
      code: "GAME_SDK_REMOTE_REQUEST_INVALID",
      failureKind: "configuration",
    });
  }
  const options = resilienceOptions(input.resilience);
  const budget = input.budget ?? createGameSdkRunnerInvocationBudget({
    ...input.resilience,
    clock: options.clock,
  });
  const keys = dependencyKeys(input.url, input.artifactIdentity);
  const replayEligible = stableReplayIdentity(input.operation, input.requestId);
  let lastError: GameSdkRunnerClientError | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const servicePermit = options.breakerRegistry.acquire(keys.service);
    if (!servicePermit) {
      throw new GameSdkRunnerClientError({
        code: "GAME_SDK_REMOTE_RUNNER_CIRCUIT_OPEN",
        failureKind: "unavailable",
      });
    }
    if (servicePermit.probe) {
      breakerStateEvent(
        options.onEvent,
        input.operation,
        "breaker-half-open",
        "half-open",
      );
    }
    const artifactPermit = options.breakerRegistry.acquire(keys.artifact);
    if (!artifactPermit) {
      options.breakerRegistry.neutral(servicePermit);
      throw new GameSdkRunnerClientError({
        code: "GAME_SDK_REMOTE_ARTIFACT_CIRCUIT_OPEN",
        failureKind: "artifact",
      });
    }
    if (artifactPermit.probe) {
      breakerStateEvent(
        options.onEvent,
        input.operation,
        "breaker-half-open",
        "half-open",
      );
    }
    options.onEvent?.({ type: "attempt", operation: input.operation, attempt });
    try {
      const result = await fetchAttempt({
        url: input.url,
        token: input.token,
        body,
        headers: input.headers,
        fetchRunner: input.fetchRunner ?? fetch,
        attemptTimeoutMs: options.attemptTimeoutMs,
        budget,
      });
      const serviceRecovered = options.breakerRegistry.success(servicePermit);
      const artifactRecovered = options.breakerRegistry.success(artifactPermit);
      if (serviceRecovered || artifactRecovered) {
        breakerStateEvent(
          options.onEvent,
          input.operation,
          "breaker-closed",
          "closed",
        );
      }
      return { ...result, attempts: attempt };
    } catch (error) {
      const failure = error instanceof GameSdkRunnerClientError
        ? error
        : new GameSdkRunnerClientError({
            code: "GAME_SDK_REMOTE_OUTCOME_UNKNOWN",
            failureKind: "transport",
            outcome: "unknown",
            retryable: true,
            failureScope: "service",
          });
      lastError = failure;
      const failedScope = recordBreakerFailure(
        options.breakerRegistry,
        failure,
        servicePermit,
        artifactPermit,
      );
      const failedKey = failedScope === "artifact" ? keys.artifact : keys.service;
      if (
        failedScope !== "none"
        && options.breakerRegistry.state(failedKey) === "open"
      ) {
        breakerStateEvent(
          options.onEvent,
          input.operation,
          "breaker-open",
          "open",
        );
      }
      options.onEvent?.({
        type: "failure",
        operation: input.operation,
        attempt,
        errorCode: failure.code,
        statusCode: failure.statusCode,
      });
      const canRetry = failure.retryable
        && replayEligible
        && attempt < options.maxAttempts;
      if (!canRetry) throw failure;
      const delay = Math.floor(
        options.retryBaseDelayMs
        * (2 ** (attempt - 1))
        * (1 + Math.max(0, Math.min(1, options.random()))),
      );
      if (gameSdkRunnerBudgetRemaining(budget) <= delay) throw failure;
      options.onEvent?.({
        type: "retry",
        operation: input.operation,
        attempt: attempt + 1,
        errorCode: failure.code,
      });
      if (delay > 0) await options.sleep(delay);
    }
  }
  throw lastError ?? new GameSdkRunnerClientError({
    code: "GAME_SDK_REMOTE_RUNNER_UNAVAILABLE",
    failureKind: "unavailable",
  });
}
