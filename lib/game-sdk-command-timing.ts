import type {
  GameSdkRuntimeTiming,
  GameSdkRuntimeTimingStage,
} from "@game-fields/game-sdk/runtime";
import { observabilityRef } from "./observability/index.ts";

export type GameSdkCommandTimingStage = GameSdkRuntimeTimingStage
  | "auth"
  | "runtime-resolve"
  | "http-receive"
  | "iframe-state"
  | "next-animation-frame"
  | "command-resolve"
  | "total";

export type GameSdkCommandTimingEntry = {
  stage: GameSdkCommandTimingStage;
  durationMs: number;
  count: number;
};

const serverTimingStages = new Set<GameSdkCommandTimingStage>([
  "auth",
  "runtime-resolve",
  "room-load",
  "runner-call",
  "runner-bundle",
  "runner-hash",
  "quickjs-init",
  "bundle-eval",
  "apply-command",
  "room-cas",
  "revision-publish",
  "present-room",
  "http-receive",
  "total",
]);

function safeDuration(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export class GameSdkCommandTimingCollector implements GameSdkRuntimeTiming {
  readonly #startedAt: number;
  readonly #now: () => number;
  readonly #samples = new Map<GameSdkCommandTimingStage, {
    durationMs: number;
    count: number;
  }>();
  #commandRef: string | undefined;
  #revision: number | undefined;
  #finished = false;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
    this.#startedAt = now();
  }

  record(stage: GameSdkCommandTimingStage, durationMs: number, count = 1) {
    if (!serverTimingStages.has(stage) && ![
      "iframe-state",
      "next-animation-frame",
      "command-resolve",
    ].includes(stage)) return;
    const previous = this.#samples.get(stage) ?? { durationMs: 0, count: 0 };
    this.#samples.set(stage, {
      durationMs: previous.durationMs + safeDuration(durationMs),
      count: previous.count + Math.max(1, Math.floor(count)),
    });
  }

  async measure<T>(
    stage: GameSdkCommandTimingStage,
    operation: () => T | Promise<T>,
  ) {
    const startedAt = this.#now();
    try {
      return await operation();
    } finally {
      this.record(stage, this.#now() - startedAt);
    }
  }

  setCommandId(commandId: string) {
    this.#commandRef = observabilityRef("command", commandId);
  }

  setRevision(revision: number) {
    if (Number.isSafeInteger(revision) && revision >= 1) {
      this.#revision = revision;
    }
  }

  importServerTiming(value: string | null) {
    if (!value) return;
    const importable = new Set<GameSdkCommandTimingStage>([
      "runner-bundle",
      "runner-hash",
      "quickjs-init",
      "bundle-eval",
      "apply-command",
      "present-room",
    ]);
    for (const item of value.split(",")) {
      const [rawStage, ...parameters] = item.trim().split(";");
      const stage = rawStage as GameSdkCommandTimingStage;
      if (!importable.has(stage)) continue;
      const duration = parameters.find((parameter) => parameter.startsWith("dur="));
      const durationMs = Number(duration?.slice("dur=".length));
      if (Number.isFinite(durationMs)) this.record(stage, durationMs);
    }
  }

  finish() {
    if (!this.#finished) {
      this.record("total", this.#now() - this.#startedAt);
      this.#finished = true;
    }
    return this.entries();
  }

  entries(): GameSdkCommandTimingEntry[] {
    return [...this.#samples.entries()].map(([stage, sample]) => ({
      stage,
      durationMs: safeDuration(sample.durationMs),
      count: sample.count,
    }));
  }

  serverTimingHeader() {
    this.finish();
    return this.entries()
      .filter((entry) => serverTimingStages.has(entry.stage))
      .map((entry) => (
        `${entry.stage};dur=${entry.durationMs.toFixed(1)};desc="count=${entry.count}"`
      ))
      .join(", ");
  }

  decorate(response: Response) {
    const headers = new Headers(response.headers);
    const serverTiming = this.serverTimingHeader();
    if (serverTiming) headers.set("Server-Timing", serverTiming);
    if (this.#commandRef) headers.set("X-Game-Sdk-Trace", this.#commandRef);
    if (this.#revision !== undefined) {
      headers.set("X-Game-Sdk-Revision", String(this.#revision));
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  observabilityFields(entry: GameSdkCommandTimingEntry) {
    return {
      action: entry.stage,
      durationMs: entry.durationMs,
      commandCount: entry.count,
      ...(this.#commandRef ? { commandRef: this.#commandRef } : {}),
      ...(this.#revision !== undefined ? { revision: this.#revision } : {}),
    };
  }
}

export function createGameSdkCommandTimingCollector(now?: () => number) {
  return new GameSdkCommandTimingCollector(now);
}
