import assert from "node:assert/strict";
import test from "node:test";
import {
  GameSdkRunnerCircuitBreakerRegistry,
  GameSdkRunnerClientError,
  invokeGameSdkRunner,
  type GameSdkRunnerClientEvent,
  type GameSdkRunnerOperation,
} from "../lib/game-sdk-runner-client.ts";

const runnerUrl = "https://runner.example/server/creator/game/revision";
const artifactIdentity = "b".repeat(64);

function resilience(input: {
  registry?: GameSdkRunnerCircuitBreakerRegistry;
  events?: GameSdkRunnerClientEvent[];
  attemptTimeoutMs?: number;
  invocationTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
} = {}) {
  return {
    attemptTimeoutMs: input.attemptTimeoutMs ?? 100,
    invocationTimeoutMs: input.invocationTimeoutMs ?? 500,
    maxAttempts: input.maxAttempts ?? 2,
    retryBaseDelayMs: input.retryBaseDelayMs ?? 0,
    random: input.random,
    sleep: input.sleep,
    breakerRegistry: input.registry ?? new GameSdkRunnerCircuitBreakerRegistry({
      failureThreshold: 3,
      openMs: 100,
    }),
    onEvent: (event: GameSdkRunnerClientEvent) => input.events?.push(event),
  };
}

function invoke(input: {
  fetchRunner: typeof fetch;
  operation?: GameSdkRunnerOperation;
  requestId?: string;
  artifact?: string;
  resilience?: ReturnType<typeof resilience>;
}) {
  return invokeGameSdkRunner({
    url: runnerUrl,
    token: "signed-token",
    artifactIdentity: input.artifact ?? artifactIdentity,
    operation: input.operation ?? "apply-command",
    request: {
      version: 1,
      invocation: { operation: "applyCommand" },
      requestId: input.requestId,
    },
    requestId: input.requestId,
    fetchRunner: input.fetchRunner,
    resilience: input.resilience ?? resilience(),
  });
}

test("stable mutating operations retry with byte-identical request identity", async () => {
  const requests: Array<{ body: string; authorization: string | null }> = [];
  const events: GameSdkRunnerClientEvent[] = [];
  const result = await invoke({
    requestId: "command-stable-0001",
    resilience: resilience({ events }),
    fetchRunner: (async (_url, init) => {
      requests.push({
        body: String(init?.body),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (requests.length === 1) {
        return Response.json(
          { error: "SERVER_RUNTIME_TEMPORARILY_UNAVAILABLE" },
          { status: 503 },
        );
      }
      return Response.json({ ok: true, value: { revision: 2 } });
    }) as typeof fetch,
  });

  assert.equal(result.attempts, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.body, requests[1]?.body);
  assert.match(requests[0]?.body ?? "", /command-stable-0001/);
  assert.deepEqual(
    requests.map(({ authorization }) => authorization),
    ["Bearer signed-token", "Bearer signed-token"],
  );
  assert.equal(events.filter(({ type }) => type === "retry").length, 1);
});

test("bounded retry applies operation-aware exponential jitter", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await invoke({
    requestId: "command-jitter-0001",
    resilience: resilience({
      retryBaseDelayMs: 10,
      random: () => 0.5,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    }),
    fetchRunner: (async () => {
      attempts += 1;
      return attempts === 1
        ? Response.json(
            { error: "SERVER_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE" },
            { status: 503 },
          )
        : Response.json({ ok: true, value: { revision: 2 } });
    }) as typeof fetch,
  });
  assert.deepEqual(delays, [15]);
});

test("presentation without an existing idempotency identity is never replayed", async () => {
  let attempts = 0;
  await assert.rejects(
    () => invoke({
      operation: "present-room",
      fetchRunner: (async () => {
        attempts += 1;
        return Response.json({ error: "SERVER_RUNTIME_BUSY" }, { status: 503 });
      }) as typeof fetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_UNAVAILABLE/,
  );
  assert.equal(attempts, 1);
});

test("mutation without a stable request identity never retries", async () => {
  let attempts = 0;
  await assert.rejects(
    () => invoke({
      operation: "create-room",
      fetchRunner: (async () => {
        attempts += 1;
        return Response.json({ error: "SERVER_RUNTIME_BUSY" }, { status: 503 });
      }) as typeof fetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_UNAVAILABLE/,
  );
  assert.equal(attempts, 1);
});

test("authentication and configuration failures are terminal and secret-safe", async () => {
  let attempts = 0;
  await assert.rejects(
    () => invoke({
      requestId: "command-stable-0002",
      fetchRunner: (async () => {
        attempts += 1;
        return Response.json({ error: "SERVER_RUNTIME_TOKEN_INVALID" }, { status: 403 });
      }) as typeof fetch,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GameSdkRunnerClientError);
      assert.equal(error.code, "GAME_SDK_REMOTE_RUNNER_AUTH_FAILED");
      assert.doesNotMatch(error.message, /signed-token|runner\.example/);
      return true;
    },
  );
  assert.equal(attempts, 1);

  await assert.rejects(
    () => invokeGameSdkRunner({
      url: "https://runner.example/server?token=secret",
      token: "signed-token",
      artifactIdentity,
      operation: "manifest",
      request: { operation: "manifest" },
      fetchRunner: (() => {
        throw new Error("fetch must not run");
      }) as typeof fetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID/,
  );
});

test("exact missing artifact trips only its artifact circuit", async () => {
  const registry = new GameSdkRunnerCircuitBreakerRegistry({
    failureThreshold: 5,
    openMs: 1_000,
  });
  let missingCalls = 0;
  const missingFetch = (async () => {
    missingCalls += 1;
    return Response.json(
      { error: "SERVER_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND" },
      { status: 404 },
    );
  }) as typeof fetch;

  await assert.rejects(
    () => invoke({
      operation: "manifest",
      fetchRunner: missingFetch,
      resilience: resilience({ registry }),
    }),
    /GAME_SDK_REMOTE_ARTIFACT_NOT_FOUND/,
  );
  await assert.rejects(
    () => invoke({
      operation: "manifest",
      fetchRunner: missingFetch,
      resilience: resilience({ registry }),
    }),
    /GAME_SDK_REMOTE_ARTIFACT_CIRCUIT_OPEN/,
  );
  assert.equal(missingCalls, 1);

  let healthyCalls = 0;
  const healthy = await invoke({
    operation: "manifest",
    artifact: "c".repeat(64),
    resilience: resilience({ registry }),
    fetchRunner: (async () => {
      healthyCalls += 1;
      return Response.json({ ok: true, value: { id: "other-artifact" } });
    }) as typeof fetch,
  });
  assert.equal(healthy.attempts, 1);
  assert.equal(healthyCalls, 1);
});

test("fetch and response-body stalls are bounded even when abort is ignored", async () => {
  let fetchCalls = 0;
  const attemptSignals: AbortSignal[] = [];
  await assert.rejects(
    () => invoke({
      requestId: "command-timeout-0001",
      resilience: resilience({
        attemptTimeoutMs: 8,
        invocationTimeoutMs: 100,
        maxAttempts: 2,
      }),
      fetchRunner: (async (_url, init) => {
        fetchCalls += 1;
        assert.ok(init?.signal);
        attemptSignals.push(init.signal);
        return await new Promise<Response>(() => undefined);
      }) as typeof fetch,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GameSdkRunnerClientError);
      assert.equal(error.code, "GAME_SDK_REMOTE_RUNNER_TIMEOUT");
      assert.equal(error.outcome, "unknown");
      return true;
    },
  );
  assert.equal(fetchCalls, 2);
  assert.ok(attemptSignals.every(({ aborted }) => aborted));

  const hangingBody = {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => new Promise<string>(() => undefined),
  } as Response;
  await assert.rejects(
    () => invoke({
      operation: "manifest",
      resilience: resilience({
        attemptTimeoutMs: 8,
        invocationTimeoutMs: 50,
        maxAttempts: 1,
      }),
      fetchRunner: (async () => hangingBody) as typeof fetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_TIMEOUT/,
  );
});

test("shared circuit breaker permits one recovery probe and closes without restart", () => {
  let now = 0;
  const registry = new GameSdkRunnerCircuitBreakerRegistry({
    failureThreshold: 2,
    openMs: 100,
    clock: () => now,
  });
  const key = "service:shared";
  const first = registry.acquire(key);
  assert.ok(first);
  assert.equal(registry.failure(first), false);
  const second = registry.acquire(key);
  assert.ok(second);
  assert.equal(registry.failure(second), true);
  assert.equal(registry.state(key), "open");
  assert.equal(registry.acquire(key), null);

  now = 100;
  assert.equal(registry.state(key), "half-open");
  const probe = registry.acquire(key);
  assert.ok(probe?.probe);
  assert.equal(registry.acquire(key), null);
  assert.equal(registry.success(probe), true);
  assert.equal(registry.state(key), "closed");

  const normal = registry.acquire(key);
  assert.ok(normal);
  assert.equal(normal.probe, false);
});

test("concurrent callers share one half-open probe and resume after recovery", async () => {
  let now = 0;
  const registry = new GameSdkRunnerCircuitBreakerRegistry({
    failureThreshold: 1,
    openMs: 100,
    clock: () => now,
  });
  const events: GameSdkRunnerClientEvent[] = [];
  const sharedResilience = resilience({ registry, maxAttempts: 1, events });
  await assert.rejects(
    () => invoke({
      operation: "manifest",
      resilience: sharedResilience,
      fetchRunner: (async () => Response.json(
        { error: "SERVER_RUNTIME_BUSY" },
        { status: 503 },
      )) as typeof fetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_UNAVAILABLE/,
  );

  now = 100;
  let releaseProbe: ((response: Response) => void) | undefined;
  let probeCalls = 0;
  const probeFetch = (async () => {
    probeCalls += 1;
    return await new Promise<Response>((resolve) => {
      releaseProbe = resolve;
    });
  }) as typeof fetch;
  const probe = invoke({
    operation: "manifest",
    resilience: sharedResilience,
    fetchRunner: probeFetch,
  });
  await assert.rejects(
    () => invoke({
      operation: "manifest",
      resilience: sharedResilience,
      fetchRunner: probeFetch,
    }),
    /GAME_SDK_REMOTE_RUNNER_CIRCUIT_OPEN/,
  );
  assert.equal(probeCalls, 1);
  assert.ok(releaseProbe);
  releaseProbe(Response.json({ ok: true, value: { recovered: true } }));
  await probe;
  assert.ok(events.some(({ type }) => type === "breaker-open"));
  assert.ok(events.some(({ type }) => type === "breaker-half-open"));
  assert.ok(events.some(({ type }) => type === "breaker-closed"));

  let resumedCalls = 0;
  await invoke({
    operation: "manifest",
    resilience: sharedResilience,
    fetchRunner: (async () => {
      resumedCalls += 1;
      return Response.json({ ok: true, value: { recovered: true } });
    }) as typeof fetch,
  });
  assert.equal(resumedCalls, 1);
});
