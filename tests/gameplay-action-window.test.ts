import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameplayActionWindowSnapshot,
  GameplayActionDispatchGate,
  type GameplayActionWindowPlan,
} from "../lib/gameplay-action-window.ts";
import type { ServerClockSnapshot } from "../lib/server-clock.ts";

const plan: GameplayActionWindowPlan = {
  scope: { roomCode: "ROOM", generation: "1:1000", phase: "answer" },
  countdownDeadlineAt: 1_000,
  serverDeadlineAt: 1_500,
};

function clock(serverNow: number | null, sampleState: ServerClockSnapshot["sampleState"] = "fresh"): ServerClockSnapshot {
  return {
    environmentKey: "development.example",
    sessionKey: "session-1",
    sampleState,
    serverNow,
    sampleAgeMs: serverNow === null ? null : 0,
    observationVersion: 1,
  };
}

test("deadline直前・一致・grace内・直後をserver timeで分類する", () => {
  const before = createGameplayActionWindowSnapshot({ plan, clock: clock(999) });
  assert.equal(before.state, "OPEN");
  assert.equal(before.remainingSeconds, 1);
  const exact = createGameplayActionWindowSnapshot({ plan, clock: clock(1_500) });
  assert.equal(exact.state, "OPEN");
  assert.equal(exact.remainingSeconds, 0);
  const after = createGameplayActionWindowSnapshot({ plan, clock: clock(1_501) });
  assert.equal(after.state, "CLOSED");
  assert.equal(after.canAttemptManualAction, false);
});

test("missing/invalid/stale sampleはUNCERTAINでmanual actionを永久抑止しない", () => {
  for (const state of ["missing", "invalid", "stale"] as const) {
    const snapshot = createGameplayActionWindowSnapshot({ plan, clock: clock(null, state) });
    assert.equal(snapshot.state, "UNCERTAIN");
    assert.equal(snapshot.canAttemptManualAction, true);
    assert.equal(snapshot.remainingSeconds, null);
  }
});

test("Room/phase replacementはscopeを変え、authoritative expiryは同scopeだけ閉じる", () => {
  const first = createGameplayActionWindowSnapshot({ plan, clock: clock(900) });
  const closed = createGameplayActionWindowSnapshot({
    plan,
    clock: clock(900),
    authoritativeClosedScopeKey: first.scopeKey,
  });
  assert.equal(closed.reason, "authoritative-expired");
  const next = createGameplayActionWindowSnapshot({
    plan: { ...plan, scope: { ...plan.scope, phase: "vote" } },
    clock: clock(900),
    authoritativeClosedScopeKey: first.scopeKey,
  });
  assert.equal(next.state, "OPEN");
  assert.notEqual(next.scopeKey, first.scopeKey);
});

test("manual dispatchは同じscope/action keyをat-most-onceに共有する", async () => {
  const gate = new GameplayActionDispatchGate();
  let resolve!: (value: string) => void;
  let calls = 0;
  const execute = () => {
    calls += 1;
    return new Promise<string>((done) => { resolve = done; });
  };
  const input = {
    scopeKey: "scope-1",
    state: "OPEN" as const,
    actionKey: "submit:seat-1",
    execute,
    classifyError: () => "retryable" as const,
  };
  const first = gate.dispatch(input);
  const duplicate = gate.dispatch(input);
  assert.equal(calls, 1);
  resolve("accepted");
  assert.deepEqual(await first, { kind: "accepted", value: "accepted" });
  assert.deepEqual(await duplicate, { kind: "accepted", value: "accepted" });
  assert.deepEqual(await gate.dispatch(input), { kind: "duplicate" });
  gate.dispose();
});

test("authoritative expiryはblind retryせず、retryable failureだけ明示再試行できる", async () => {
  const gate = new GameplayActionDispatchGate();
  let expiredCalls = 0;
  const expiredInput = {
    scopeKey: "scope-1",
    state: "UNCERTAIN" as const,
    actionKey: "vote:seat-1",
    execute: async () => { expiredCalls += 1; throw new Error("expired"); },
    classifyError: () => "authoritative-expired" as const,
  };
  assert.equal((await gate.dispatch(expiredInput)).kind, "authoritative-expired");
  assert.equal((await gate.dispatch(expiredInput)).kind, "duplicate");
  assert.equal(expiredCalls, 1);

  let retryCalls = 0;
  const retryInput = {
    ...expiredInput,
    actionKey: "guess:seat-1",
    execute: async () => { retryCalls += 1; if (retryCalls === 1) throw new TypeError("network"); return "ok"; },
    classifyError: () => "ambiguous" as const,
  };
  assert.equal((await gate.dispatch(retryInput)).kind, "failed");
  assert.deepEqual(await gate.dispatch(retryInput), { kind: "accepted", value: "ok" });
  assert.equal(retryCalls, 2);
  gate.dispose();
});

test("scope replacementとunmount disposeは旧action keyを新しいlifecycleへ持ち越さない", async () => {
  const gate = new GameplayActionDispatchGate();
  let calls = 0;
  const dispatch = (scopeKey: string) => gate.dispatch({
    scopeKey,
    state: "OPEN",
    actionKey: "submit:seat-1",
    execute: async () => { calls += 1; return calls; },
    classifyError: () => "ambiguous",
  });
  assert.deepEqual(await dispatch("room-1:phase-1"), { kind: "accepted", value: 1 });
  assert.equal((await dispatch("room-1:phase-1")).kind, "duplicate");
  assert.deepEqual(await dispatch("room-1:phase-2"), { kind: "accepted", value: 2 });
  gate.dispose();
  assert.deepEqual(await dispatch("room-1:phase-2"), { kind: "accepted", value: 3 });
});

test("旧scopeの遅延失敗は新scopeの同名in-flight actionを解放しない", async () => {
  const gate = new GameplayActionDispatchGate();
  let rejectOld!: (error: Error) => void;
  let resolveCurrent!: (value: string) => void;
  let currentCalls = 0;
  const old = gate.dispatch({
    scopeKey: "room-1:phase-1",
    state: "OPEN",
    actionKey: "submit:seat-1",
    execute: () => new Promise<string>((_resolve, reject) => { rejectOld = reject; }),
    classifyError: () => "ambiguous",
  });
  const currentInput = {
    scopeKey: "room-1:phase-2",
    state: "OPEN" as const,
    actionKey: "submit:seat-1",
    execute: () => {
      currentCalls += 1;
      return new Promise<string>((resolve) => { resolveCurrent = resolve; });
    },
    classifyError: () => "ambiguous" as const,
  };
  const current = gate.dispatch(currentInput);
  rejectOld(new Error("late old-scope failure"));
  assert.equal((await old).kind, "failed");
  const duplicate = gate.dispatch(currentInput);
  assert.equal(currentCalls, 1);
  resolveCurrent("accepted-current-scope");
  assert.deepEqual(await current, { kind: "accepted", value: "accepted-current-scope" });
  assert.deepEqual(await duplicate, { kind: "accepted", value: "accepted-current-scope" });
});
