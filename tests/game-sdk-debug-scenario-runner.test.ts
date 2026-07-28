import assert from "node:assert/strict";
import test from "node:test";
import { runDebugScenario } from "../lib/game-sdk-debug-scenario-runner.ts";

type Room = {
  code: string;
  revision: number;
  phase: string;
  view: { app: { phase: string } };
};

function room(revision: number, outerPhase = "playing", appPhase = "turn"): Room {
  return {
    code: "TEST",
    revision,
    phase: outerPhase,
    view: { app: { phase: appPhase } },
  };
}

test("runs a single authoritative DEBUG step", async () => {
  const result = await runDebugScenario({
    initialRoom: room(1),
    target: { kind: "step" },
    sendStep: async (current) => room(current.revision + 1),
  });
  assert.equal(result.reason, "target-reached");
  assert.equal(result.room.revision, 2);
  assert.equal(result.steps.length, 1);
});

test("stops when the app phase changes", async () => {
  const result = await runDebugScenario({
    initialRoom: room(1),
    target: { kind: "phase" },
    sendStep: async (current) => current.revision === 1
      ? room(2, "playing", "turn")
      : room(3, "playing", "score"),
  });
  assert.equal(result.reason, "target-reached");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1]?.appPhase, "score");
});

test("stops safely when revision does not advance", async () => {
  const result = await runDebugScenario({
    initialRoom: room(4),
    target: { kind: "result" },
    sendStep: async (current) => current,
  });
  assert.equal(result.reason, "unchanged-revision");
  assert.equal(result.steps.length, 0);
});

test("supports fixed step count and machine-readable step records", async () => {
  const result = await runDebugScenario({
    initialRoom: room(10),
    target: { kind: "steps", count: 3 },
    maximumSteps: 3,
    sendStep: async (current) => room(current.revision + 1),
  });
  assert.equal(result.reason, "target-reached");
  assert.deepEqual(result.steps.map((step) => step.nextRevision), [11, 12, 13]);
});

test("stops on cancellation before issuing another command", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runDebugScenario({
    initialRoom: room(1),
    target: { kind: "result" },
    signal: controller.signal,
    sendStep: async (current) => {
      calls += 1;
      controller.abort();
      return room(current.revision + 1);
    },
  });
  assert.equal(result.reason, "cancelled");
  assert.equal(calls, 1);
  assert.equal(result.steps.length, 1);
});

test("stops when the room changes unexpectedly", async () => {
  const result = await runDebugScenario({
    initialRoom: room(1),
    target: { kind: "result" },
    sendStep: async () => ({ ...room(2), code: "OTHER" }),
  });
  assert.equal(result.reason, "room-changed");
});
