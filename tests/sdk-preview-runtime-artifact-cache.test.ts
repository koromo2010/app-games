import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  RuntimeArtifactCache,
  RuntimeArtifactCacheError,
  runtimeArtifactCacheKey,
  type RuntimeArtifactCacheKey,
} from "../apps/sdk-preview/lib/runtime-artifact-cache.ts";

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function key(bytes: Uint8Array, overrides: Partial<RuntimeArtifactCacheKey> = {}): RuntimeArtifactCacheKey {
  return {
    environment: "development",
    instanceId: "creator-lab",
    gameId: "sample-game",
    packageRevision: "a".repeat(40),
    serverBundleSha256: sha256(bytes),
    ...overrides,
  };
}

function loadBytes(bytes: Uint8Array, counter: { value: number }) {
  return async () => {
    counter.value += 1;
    return new Uint8Array(bytes);
  };
}

test("cache key is canonical and malformed identity fails before source access", async () => {
  const bytes = new TextEncoder().encode("bundle");
  const identity = key(bytes);
  assert.equal(
    runtimeArtifactCacheKey(identity),
    JSON.stringify([
      "game-fields-runtime-artifact-v1",
      "development",
      "creator-lab",
      "sample-game",
      "a".repeat(40),
      sha256(bytes),
    ]),
  );
  let sourceReads = 0;
  await assert.rejects(
    new RuntimeArtifactCache().resolve({
      ...identity,
      gameId: "../other",
      load: async () => {
        sourceReads += 1;
        return bytes;
      },
    }),
    (error: unknown) => error instanceof RuntimeArtifactCacheError && error.code === "IDENTITY_INVALID",
  );
  assert.equal(sourceReads, 0);
});

test("first miss, second hit, hash-once, and mutation isolation are enforced", async () => {
  const bytes = new TextEncoder().encode("immutable bundle");
  const identity = key(bytes);
  const reads = { value: 0 };
  const hashDurations: number[] = [];
  const cache = new RuntimeArtifactCache({ clock: () => 100 });
  const first = await cache.resolve({
    ...identity,
    load: loadBytes(bytes, reads),
    recordHashDuration: (duration) => hashDurations.push(duration),
  });
  assert.equal(first?.outcome, "miss");
  assert.equal(first?.artifact.sha256, identity.serverBundleSha256);
  assert.equal(first?.artifact.byteLength, bytes.byteLength);
  assert.equal(reads.value, 1);
  assert.equal(hashDurations.length, 1);

  first!.artifact.bytes[0] = 0;
  const second = await cache.resolve({ ...identity, load: loadBytes(bytes, reads) });
  assert.equal(second?.outcome, "hit");
  assert.equal(second?.artifact.bytes[0], bytes[0]);
  assert.equal(reads.value, 1);
  assert.equal(cache.stats().totalBytes, bytes.byteLength);
});

test("same-key misses use one source read and give waiters the verified bytes", async () => {
  const bytes = new TextEncoder().encode("concurrent bundle");
  const identity = key(bytes);
  let sourceReads = 0;
  let release!: (value: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => { release = resolve; });
  const cache = new RuntimeArtifactCache();
  const load = async () => {
    sourceReads += 1;
    return pending;
  };
  const leaderPromise = cache.resolve({ ...identity, load });
  const waiterPromise = cache.resolve({ ...identity, load });
  release(bytes);
  const [leader, waiter] = await Promise.all([leaderPromise, waiterPromise]);
  assert.equal(leader?.outcome, "miss");
  assert.equal(waiter?.outcome, "waiter");
  assert.deepEqual(waiter?.artifact.bytes, bytes);
  assert.equal(sourceReads, 1);
});

test("not-found and failures are not negative cached, and mismatched hashes never fallback", async () => {
  const bytes = new TextEncoder().encode("retryable bundle");
  const identity = key(bytes);
  const cache = new RuntimeArtifactCache();
  let sourceReads = 0;
  const missing = async () => {
    sourceReads += 1;
    return null;
  };
  assert.equal(await cache.resolve({ ...identity, load: missing }), null);
  assert.equal(await cache.resolve({ ...identity, load: missing }), null);
  assert.equal(sourceReads, 2);

  const mismatchReads = { value: 0 };
  await assert.rejects(
    cache.resolve({
      ...identity,
      serverBundleSha256: "b".repeat(64),
      load: loadBytes(bytes, mismatchReads),
    }),
    (error: unknown) => error instanceof RuntimeArtifactCacheError && error.code === "HASH_MISMATCH",
  );
  const retry = await cache.resolve({ ...identity, load: loadBytes(bytes, mismatchReads) });
  assert.equal(retry?.outcome, "miss");
  assert.equal(mismatchReads.value, 2);
});

test("LRU eviction is deterministic and identity dimensions never share bytes", async () => {
  const a = new TextEncoder().encode("a");
  const b = new TextEncoder().encode("b");
  const c = new TextEncoder().encode("c");
  const cache = new RuntimeArtifactCache({ entryLimit: 2, totalByteLimit: 100 });
  const counts = { a: 0, b: 0, c: 0 };
  const resolve = (bytes: Uint8Array, name: keyof typeof counts, overrides?: Partial<RuntimeArtifactCacheKey>) => (
    cache.resolve({
      ...key(bytes, overrides),
      load: async () => {
        counts[name] += 1;
        return new Uint8Array(bytes);
      },
    })
  );
  await resolve(a, "a");
  await resolve(b, "b");
  await resolve(a, "a");
  await resolve(c, "c");
  await resolve(b, "b");
  assert.deepEqual(counts, { a: 1, b: 2, c: 1 });
  const differentEnvironment = await resolve(a, "a", { environment: "production" });
  assert.equal(differentEnvironment?.outcome, "miss");
  assert.equal(counts.a, 2);
});

test("oversized artifacts, byte-budget bypass, disable, and clear-during-flight are fail-safe", async () => {
  const oversized = new Uint8Array(5);
  const oversizedCache = new RuntimeArtifactCache({ singleArtifactByteLimit: 4 });
  await assert.rejects(
    oversizedCache.resolve({ ...key(oversized), load: async () => oversized }),
    (error: unknown) => error instanceof RuntimeArtifactCacheError && error.code === "ARTIFACT_TOO_LARGE",
  );

  const budgetBytes = new TextEncoder().encode("12345");
  const budgetIdentity = key(budgetBytes);
  const budgetCache = new RuntimeArtifactCache({ totalByteLimit: 4, singleArtifactByteLimit: 10 });
  const budgetReads = { value: 0 };
  const budgetLoad = loadBytes(budgetBytes, budgetReads);
  assert.equal((await budgetCache.resolve({ ...budgetIdentity, load: budgetLoad }))?.outcome, "bypass");
  assert.equal((await budgetCache.resolve({ ...budgetIdentity, load: budgetLoad }))?.outcome, "bypass");
  assert.equal(budgetReads.value, 2);

  budgetCache.setEnabled(false);
  assert.equal((await budgetCache.resolve({ ...budgetIdentity, load: budgetLoad }))?.outcome, "bypass");
  assert.equal(budgetReads.value, 3);
  budgetCache.setEnabled(true);

  const clearBytes = new TextEncoder().encode("clear flight");
  const clearCache = new RuntimeArtifactCache();
  let release!: (value: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => { release = resolve; });
  const clearIdentity = key(clearBytes);
  const pendingResult = clearCache.resolve({ ...clearIdentity, load: async () => pending });
  clearCache.clear();
  release(clearBytes);
  assert.equal((await pendingResult)?.outcome, "bypass");
  assert.equal(clearCache.stats().entries, 0);
  assert.equal((await clearCache.resolve({ ...clearIdentity, load: async () => clearBytes }))?.outcome, "miss");
});
