import { createHash } from "node:crypto";

const CACHE_SCHEMA = "game-fields-runtime-artifact-v1";
const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_ENTRY_LIMIT = 16;
const DEFAULT_TOTAL_BYTE_LIMIT = 16 * 1024 * 1024;
const DEFAULT_SINGLE_ARTIFACT_BYTE_LIMIT = 1024 * 1024;

export type RuntimeArtifactCacheEnvironment = "production" | "development";

export type RuntimeArtifactCacheKey = {
  environment: RuntimeArtifactCacheEnvironment;
  instanceId: string;
  gameId: string;
  packageRevision: string;
  serverBundleSha256: string;
};

export type RuntimeArtifactCacheBytes = ArrayBuffer | Uint8Array;

export type RuntimeArtifactCacheEntry = {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly byteLength: number;
  readonly insertedAt: number;
  readonly accessedAt: number;
};

export type RuntimeArtifactCacheLookup = {
  artifact: RuntimeArtifactCacheEntry;
  outcome: "hit" | "miss" | "waiter" | "bypass";
};

export class RuntimeArtifactCacheError extends Error {
  readonly code: "IDENTITY_INVALID" | "ARTIFACT_TOO_LARGE" | "HASH_MISMATCH";

  constructor(code: RuntimeArtifactCacheError["code"]) {
    super(`SDK_RUNTIME_ARTIFACT_CACHE_${code}`);
    this.name = "RuntimeArtifactCacheError";
    this.code = code;
  }
}

type CacheLoadResult = {
  artifact: RuntimeArtifactCacheEntry | null;
  cached: boolean;
};

type CacheOptions = {
  entryLimit?: number;
  totalByteLimit?: number;
  singleArtifactByteLimit?: number;
  clock?: () => number;
};

export type RuntimeArtifactCacheResolveInput = RuntimeArtifactCacheKey & {
  load: () => Promise<RuntimeArtifactCacheBytes | null>;
  recordHashDuration?: (durationMs: number) => void;
};

function copyBytes(value: RuntimeArtifactCacheBytes) {
  return value instanceof Uint8Array
    ? new Uint8Array(value)
    : new Uint8Array(value.slice(0));
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateKey(key: RuntimeArtifactCacheKey) {
  if (
    (key.environment !== "production" && key.environment !== "development")
    || !ID.test(key.instanceId)
    || !ID.test(key.gameId)
    || !REVISION.test(key.packageRevision)
    || !SHA256.test(key.serverBundleSha256)
  ) {
    throw new RuntimeArtifactCacheError("IDENTITY_INVALID");
  }
}

export function runtimeArtifactCacheKey(key: RuntimeArtifactCacheKey) {
  validateKey(key);
  return JSON.stringify([
    CACHE_SCHEMA,
    key.environment,
    key.instanceId,
    key.gameId,
    key.packageRevision,
    key.serverBundleSha256,
  ]);
}

function positiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Runtime artifact cache limits must be non-negative integers.");
  }
  return value;
}

export class RuntimeArtifactCache {
  readonly #entryLimit: number;
  readonly #totalByteLimit: number;
  readonly #singleArtifactByteLimit: number;
  readonly #clock: () => number;
  readonly #entries = new Map<string, RuntimeArtifactCacheEntry>();
  readonly #flights = new Map<string, Promise<CacheLoadResult>>();
  #totalBytes = 0;
  #generation = 0;
  #enabled = true;

  constructor(options: CacheOptions = {}) {
    this.#entryLimit = positiveInteger(options.entryLimit, DEFAULT_ENTRY_LIMIT);
    this.#totalByteLimit = positiveInteger(options.totalByteLimit, DEFAULT_TOTAL_BYTE_LIMIT);
    this.#singleArtifactByteLimit = positiveInteger(
      options.singleArtifactByteLimit,
      DEFAULT_SINGLE_ARTIFACT_BYTE_LIMIT,
    );
    this.#clock = options.clock ?? (() => Date.now());
  }

  get enabled() {
    return this.#enabled;
  }

  setEnabled(enabled: boolean) {
    if (this.#enabled !== enabled) {
      this.#generation += 1;
      this.#enabled = enabled;
    }
  }

  clear() {
    this.#generation += 1;
    this.#entries.clear();
    this.#totalBytes = 0;
  }

  stats() {
    return {
      enabled: this.#enabled,
      entries: this.#entries.size,
      totalBytes: this.#totalBytes,
      inFlight: this.#flights.size,
    };
  }

  async resolve(input: RuntimeArtifactCacheResolveInput): Promise<RuntimeArtifactCacheLookup | null> {
    const key = runtimeArtifactCacheKey(input);

    if (!this.#enabled) {
      const loaded = await this.#loadAndVerify(input, this.#generation, false);
      return loaded.artifact ? { artifact: copyEntry(loaded.artifact), outcome: "bypass" } : null;
    }

    const cached = this.#entries.get(key);
    if (cached) {
      const touched = this.#touch(key, cached);
      return { artifact: copyEntry(touched), outcome: "hit" };
    }

    const existingFlight = this.#flights.get(key);
    if (existingFlight) {
      const loaded = await existingFlight;
      return loaded.artifact ? { artifact: copyEntry(loaded.artifact), outcome: "waiter" } : null;
    }

    const generation = this.#generation;
    const flight = this.#loadAndVerify(input, generation, true);
    this.#flights.set(key, flight);
    try {
      const loaded = await flight;
      if (!loaded.artifact) return null;
      return {
        artifact: copyEntry(loaded.artifact),
        outcome: loaded.cached ? "miss" : "bypass",
      };
    } finally {
      if (this.#flights.get(key) === flight) this.#flights.delete(key);
    }
  }

  async #loadAndVerify(
    input: RuntimeArtifactCacheResolveInput,
    generation: number,
    allowCache: boolean,
  ): Promise<CacheLoadResult> {
    const loaded = await input.load();
    if (loaded === null) return { artifact: null, cached: false };

    const bytes = copyBytes(loaded);
    if (bytes.byteLength > this.#singleArtifactByteLimit) {
      throw new RuntimeArtifactCacheError("ARTIFACT_TOO_LARGE");
    }

    const hashStartedAt = performance.now();
    const actualSha256 = digest(bytes);
    input.recordHashDuration?.(Math.max(0, performance.now() - hashStartedAt));
    if (actualSha256 !== input.serverBundleSha256) {
      throw new RuntimeArtifactCacheError("HASH_MISMATCH");
    }

    const timestamp = this.#clock();
    const artifact: RuntimeArtifactCacheEntry = {
      bytes,
      sha256: actualSha256,
      byteLength: bytes.byteLength,
      insertedAt: timestamp,
      accessedAt: timestamp,
    };
    const cached = allowCache
      && this.#enabled
      && generation === this.#generation
      && this.#insert(runtimeArtifactCacheKey(input), artifact);
    return { artifact, cached };
  }

  #insert(key: string, artifact: RuntimeArtifactCacheEntry) {
    if (
      this.#entryLimit === 0
      || artifact.byteLength > this.#totalByteLimit
    ) return false;

    while (
      this.#entries.size >= this.#entryLimit
      || this.#totalBytes + artifact.byteLength > this.#totalByteLimit
    ) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) return false;
      const oldest = this.#entries.get(oldestKey);
      this.#entries.delete(oldestKey);
      this.#totalBytes -= oldest?.byteLength ?? 0;
    }
    this.#entries.set(key, artifact);
    this.#totalBytes += artifact.byteLength;
    return true;
  }

  #touch(key: string, artifact: RuntimeArtifactCacheEntry) {
    const touched = { ...artifact, accessedAt: this.#clock() };
    this.#entries.delete(key);
    this.#entries.set(key, touched);
    return touched;
  }
}

function copyEntry(entry: RuntimeArtifactCacheEntry): RuntimeArtifactCacheEntry {
  return { ...entry, bytes: new Uint8Array(entry.bytes) };
}

export const sdkPreviewRuntimeArtifactCache = new RuntimeArtifactCache();
