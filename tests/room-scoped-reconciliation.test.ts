import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptRoomRevision,
  isRoomScopedResponseCurrent,
  recordRoomRevision,
} from "../lib/room-scoped-reconciliation.ts";
import { preferLatestOnlineRoom } from "../lib/online-room-client-state.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

test("a delayed Room A success, failure, retry, and reconciliation cannot affect Room B", async () => {
  const lateSuccess = deferred<{ code: string; revision: number }>();
  const lateFailure = deferred<Error>();
  const lateRetry = deferred<{ code: string; revision: number }>();
  const lateReconciliation = deferred<{ code: string; revision: number }>();
  let activeRoomCode = "ROOM-A";
  const effects: string[] = [];

  const apply = (originRoomCode: string, response: { code: string; revision: number }) => {
    if (isRoomScopedResponseCurrent(activeRoomCode, originRoomCode, response.code)) effects.push(`${response.code}:${response.revision}`);
  };
  const reportFailure = (originRoomCode: string) => {
    if (activeRoomCode === originRoomCode) effects.push("failure");
  };

  activeRoomCode = "ROOM-B";
  lateSuccess.resolve({ code: "ROOM-A", revision: 8 });
  lateFailure.resolve(new Error("late"));
  lateRetry.resolve({ code: "ROOM-A", revision: 9 });
  lateReconciliation.resolve({ code: "ROOM-A", revision: 10 });
  apply("ROOM-A", await lateSuccess.promise);
  try { throw await lateFailure.promise; } catch { reportFailure("ROOM-A"); }
  apply("ROOM-A", await lateRetry.promise);
  apply("ROOM-A", await lateReconciliation.promise);

  assert.deepEqual(effects, []);
  assert.deepEqual(
    preferLatestOnlineRoom({ code: "ROOM-B", revision: 1 }, { code: "ROOM-A", revision: 10 }),
    { code: "ROOM-B", revision: 1 },
  );
});

test("Room B accepts a lower revision after Room A and still rejects equal or older same-Room responses", () => {
  const watermarks = new Map<string, number>();
  assert.equal(recordRoomRevision(watermarks, "ROOM-A", 100), true);
  assert.equal(canAcceptRoomRevision(watermarks, "ROOM-B", 1), true);
  assert.equal(recordRoomRevision(watermarks, "ROOM-B", 1), true);
  assert.equal(canAcceptRoomRevision(watermarks, "ROOM-B", 1), false);
  assert.equal(canAcceptRoomRevision(watermarks, "ROOM-B", 0), false);
  assert.equal(isRoomScopedResponseCurrent("ROOM-B", "ROOM-A", "ROOM-A"), false);
});
