import assert from "node:assert/strict";
import test from "node:test";
import { AuthoritativeTimeoutFinalizer } from "../lib/game-timer/client-finalizer.ts";
import {
  AuthoritativeTimerNotExpiredError,
  authoritativeTimerErrorDirective,
} from "../lib/game-timer/retry.ts";

type Scheduled = { id: number; at: number; callback: () => void };

function fakeTime() {
  let now = 0;
  let nextId = 1;
  let scheduled: Scheduled[] = [];
  const flush = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return {
    now: () => now,
    scheduler: {
      set(callback: () => void, delayMs: number) {
        const item = { id: nextId++, at: now + delayMs, callback };
        scheduled.push(item);
        return item.id;
      },
      clear(handle: unknown) {
        scheduled = scheduled.filter((item) => item.id !== handle);
      },
    },
    setNow(value: number) { now = value; },
    async advanceTo(value: number) {
      now = value;
      for (;;) {
        const due = scheduled
          .filter((item) => item.at <= now)
          .sort((left, right) => left.at - right.at || left.id - right.id)[0];
        if (!due) break;
        scheduled = scheduled.filter((item) => item.id !== due.id);
        due.callback();
        await flush();
      }
    },
  };
}

const plan = {
  attemptKey: "timer:ROOM:1",
  generationKey: "ROOM:1",
  serverDeadlineAt: 1_000,
  claimantDelayMs: 0,
};

test("early rejection releases and rearms the same generation attempt key", async () => {
  const time = fakeTime();
  const attempts: string[] = [];
  const finalizer = new AuthoritativeTimeoutFinalizer({
    now: time.now,
    scheduler: time.scheduler,
    attempt: async (attemptKey) => {
      attempts.push(attemptKey);
      if (attempts.length === 1) {
        throw new AuthoritativeTimerNotExpiredError(
          "TIMER_NOT_EXPIRED",
          1_200,
          time.now(),
        );
      }
    },
    reconcile: async () => "terminal",
    classifyError: (error) => authoritativeTimerErrorDirective(error, new Set()),
  });
  finalizer.update(plan);
  await time.advanceTo(1_000);
  assert.deepEqual(attempts, [plan.attemptKey]);
  await time.advanceTo(1_199);
  assert.equal(attempts.length, 1);
  await time.advanceTo(1_200);
  assert.deepEqual(attempts, [plan.attemptKey, plan.attemptKey]);
  finalizer.dispose();
});

test("one active fallback client eventually finalizes without a primary client", async () => {
  const time = fakeTime();
  let attempts = 0;
  const finalizer = new AuthoritativeTimeoutFinalizer({
    now: time.now,
    scheduler: time.scheduler,
    attempt: async () => { attempts += 1; },
    reconcile: async () => "terminal",
    classifyError: (error) => authoritativeTimerErrorDirective(error, new Set()),
  });
  finalizer.update({ ...plan, claimantDelayMs: 4_250 });
  await time.advanceTo(5_249);
  assert.equal(attempts, 0);
  await time.advanceTo(5_250);
  assert.equal(attempts, 1);
  finalizer.dispose();
});

test("ambiguous transport reconciles before retrying the stable attempt key", async () => {
  const time = fakeTime();
  const attempts: string[] = [];
  let reconciliations = 0;
  const finalizer = new AuthoritativeTimeoutFinalizer({
    now: time.now,
    scheduler: time.scheduler,
    attempt: async (attemptKey) => {
      attempts.push(attemptKey);
      if (attempts.length === 1) throw new TypeError("network interrupted");
    },
    reconcile: async () => {
      reconciliations += 1;
      return "active";
    },
    classifyError: (error) => authoritativeTimerErrorDirective(error, new Set()),
  });
  finalizer.update(plan);
  await time.advanceTo(1_000);
  assert.equal(reconciliations, 0);
  await time.advanceTo(2_000);
  assert.equal(reconciliations, 1);
  await time.advanceTo(2_025);
  assert.deepEqual(attempts, [plan.attemptKey, plan.attemptKey]);
  finalizer.dispose();
});

test("sleep/resume refresh recomputes an overdue deadline and stale generation is canceled", async () => {
  const time = fakeTime();
  const attempts: string[] = [];
  const finalizer = new AuthoritativeTimeoutFinalizer({
    now: time.now,
    scheduler: time.scheduler,
    attempt: async (attemptKey) => { attempts.push(attemptKey); },
    reconcile: async () => "terminal",
    classifyError: (error) => authoritativeTimerErrorDirective(error, new Set()),
  });
  finalizer.update(plan);
  time.setNow(5_000);
  finalizer.refresh();
  await time.advanceTo(5_000);
  assert.deepEqual(attempts, [plan.attemptKey]);

  finalizer.update({
    attemptKey: "timer:ROOM:2",
    generationKey: "ROOM:2",
    serverDeadlineAt: 8_000,
    claimantDelayMs: 0,
  });
  finalizer.update(null);
  await time.advanceTo(9_000);
  assert.deepEqual(attempts, [plan.attemptKey]);
  finalizer.dispose();
});
