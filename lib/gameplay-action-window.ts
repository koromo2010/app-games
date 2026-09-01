import type { ServerClockSnapshot } from "./server-clock.ts";

export type GameplayActionWindowState = "OPEN" | "CLOSED" | "UNCERTAIN";

export type GameplayActionWindowScope = {
  roomCode: string;
  generation: string | number;
  phase: string;
};

export type GameplayActionWindowPlan = {
  scope: GameplayActionWindowScope;
  countdownDeadlineAt: number | null;
  serverDeadlineAt?: number | null;
};

export type GameplayActionWindowSnapshot = {
  scopeKey: string;
  state: GameplayActionWindowState;
  reason:
    | "active"
    | "deadline-reached"
    | "authoritative-expired"
    | "inactive"
    | "invalid-scope"
    | "invalid-deadline"
    | "missing-server-sample"
    | "invalid-server-sample"
    | "stale-server-sample";
  remainingMs: number | null;
  remainingSeconds: number | null;
  serverNow: number | null;
  sampleState: ServerClockSnapshot["sampleState"];
  canAttemptManualAction: boolean;
};

export type GameplayActionErrorDisposition = "authoritative-expired" | "retryable" | "ambiguous";

export type GameplayActionDispatchResult<T> =
  | { kind: "accepted"; value: T }
  | { kind: "closed" }
  | { kind: "duplicate" }
  | { kind: "authoritative-expired"; error: unknown }
  | { kind: "failed"; error: unknown; disposition: "retryable" | "ambiguous" };

function validScopeValue(value: string | number) {
  return typeof value === "number"
    ? Number.isSafeInteger(value)
    : value.trim().length > 0 && value.length <= 240;
}

export function gameplayActionWindowScopeKey(
  clock: Pick<ServerClockSnapshot, "environmentKey" | "sessionKey">,
  scope: GameplayActionWindowScope,
) {
  if (
    !validScopeValue(scope.roomCode)
    || !validScopeValue(scope.generation)
    || !validScopeValue(scope.phase)
  ) return "";
  return JSON.stringify([
    clock.environmentKey,
    clock.sessionKey,
    scope.roomCode,
    scope.generation,
    scope.phase,
  ]);
}

function uncertainReason(sampleState: ServerClockSnapshot["sampleState"]) {
  if (sampleState === "invalid") return "invalid-server-sample" as const;
  if (sampleState === "stale") return "stale-server-sample" as const;
  return "missing-server-sample" as const;
}

export function createGameplayActionWindowSnapshot(input: {
  plan: GameplayActionWindowPlan | null;
  clock: ServerClockSnapshot;
  authoritativeClosedScopeKey?: string | null;
}): GameplayActionWindowSnapshot {
  const scopeKey = input.plan
    ? gameplayActionWindowScopeKey(input.clock, input.plan.scope)
    : "";
  const inactive = (reason: GameplayActionWindowSnapshot["reason"]): GameplayActionWindowSnapshot => ({
    scopeKey,
    state: "CLOSED",
    reason,
    remainingMs: null,
    remainingSeconds: null,
    serverNow: input.clock.serverNow,
    sampleState: input.clock.sampleState,
    canAttemptManualAction: false,
  });
  if (!input.plan) return inactive("inactive");
  if (!scopeKey) return inactive("invalid-scope");
  if (input.authoritativeClosedScopeKey === scopeKey) {
    return inactive("authoritative-expired");
  }

  const countdownDeadlineAt = input.plan.countdownDeadlineAt;
  const serverDeadlineAt = input.plan.serverDeadlineAt ?? countdownDeadlineAt;
  if (countdownDeadlineAt === null && serverDeadlineAt === null) {
    return {
      scopeKey,
      state: "OPEN",
      reason: "active",
      remainingMs: null,
      remainingSeconds: null,
      serverNow: input.clock.serverNow,
      sampleState: input.clock.sampleState,
      canAttemptManualAction: true,
    };
  }
  if (
    countdownDeadlineAt !== null && !Number.isFinite(countdownDeadlineAt)
    || serverDeadlineAt !== null && !Number.isFinite(serverDeadlineAt)
  ) {
    return {
      ...inactive("invalid-deadline"),
      state: "UNCERTAIN",
      canAttemptManualAction: true,
    };
  }
  if (input.clock.sampleState !== "fresh" || input.clock.serverNow === null) {
    return {
      scopeKey,
      state: "UNCERTAIN",
      reason: uncertainReason(input.clock.sampleState),
      remainingMs: null,
      remainingSeconds: null,
      serverNow: input.clock.serverNow,
      sampleState: input.clock.sampleState,
      canAttemptManualAction: true,
    };
  }

  const remainingMs = countdownDeadlineAt === null
    ? null
    : Math.max(0, countdownDeadlineAt - input.clock.serverNow);
  const closed = serverDeadlineAt !== null && input.clock.serverNow > serverDeadlineAt;
  return {
    scopeKey,
    state: closed ? "CLOSED" : "OPEN",
    reason: closed ? "deadline-reached" : "active",
    remainingMs,
    remainingSeconds: remainingMs === null ? null : Math.ceil(remainingMs / 1_000),
    serverNow: input.clock.serverNow,
    sampleState: input.clock.sampleState,
    canAttemptManualAction: !closed,
  };
}

type DispatchEntry<T> = {
  status: "pending" | "accepted" | "authoritative-expired";
  promise?: Promise<GameplayActionDispatchResult<T>>;
};

/**
 * Shares one in-flight manual dispatch by stable action key. The server remains
 * authoritative: UNCERTAIN is allowed through, while an explicit expired
 * response terminally closes the key and is never retried by this gate.
 */
export class GameplayActionDispatchGate {
  #scopeKey = "";
  #entries = new Map<string, DispatchEntry<unknown>>();

  replaceScope(scopeKey: string) {
    if (scopeKey === this.#scopeKey) return;
    this.#scopeKey = scopeKey;
    this.#entries.clear();
  }

  dispatch<T>(input: {
    scopeKey: string;
    state: GameplayActionWindowState;
    actionKey: string;
    execute: () => Promise<T>;
    classifyError: (error: unknown) => GameplayActionErrorDisposition;
  }): Promise<GameplayActionDispatchResult<T>> {
    this.replaceScope(input.scopeKey);
    if (!input.scopeKey || input.state === "CLOSED") {
      return Promise.resolve({ kind: "closed" });
    }
    const existing = this.#entries.get(input.actionKey) as DispatchEntry<T> | undefined;
    if (existing?.status === "pending" && existing.promise) return existing.promise;
    if (existing) return Promise.resolve({ kind: "duplicate" });

    const entry: DispatchEntry<T> = { status: "pending" };
    const promise = input.execute().then<GameplayActionDispatchResult<T>>((value) => {
      entry.status = "accepted";
      entry.promise = undefined;
      return { kind: "accepted", value };
    }).catch<GameplayActionDispatchResult<T>>((error: unknown) => {
      const disposition = input.classifyError(error);
      if (disposition === "authoritative-expired") {
        entry.status = "authoritative-expired";
        entry.promise = undefined;
        return { kind: "authoritative-expired", error };
      }
      if (this.#entries.get(input.actionKey) === entry) {
        this.#entries.delete(input.actionKey);
      }
      return { kind: "failed", error, disposition };
    });
    entry.promise = promise;
    this.#entries.set(input.actionKey, entry as DispatchEntry<unknown>);
    return promise;
  }

  dispose() {
    this.#scopeKey = "";
    this.#entries.clear();
  }
}
