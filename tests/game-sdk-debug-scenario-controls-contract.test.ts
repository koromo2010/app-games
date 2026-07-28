import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/components/GameSdkDebugScenarioControls.tsx",
  "utf8",
);

test("DEBUG scenario controls expose progress, fixed steps and cancellation", () => {
  assert.match(source, /progress\.completedSteps/);
  assert.match(source, /progress\.elapsedMs/);
  assert.match(source, /progress\.latestStep/);
  assert.match(source, /onRun\("steps", normalizedStepCount\)/);
  assert.match(source, /自動進行を中止/);
  assert.match(source, /onClick=\{onCancel\}/);
});

test("DEBUG scenario controls bound fixed step count", () => {
  assert.match(source, /Math\.min\(160, Math\.max\(1/);
  assert.match(source, /min=\{1\}/);
  assert.match(source, /max=\{160\}/);
});

test("running scenario blocks new starts but keeps cancel available", () => {
  assert.match(source, /const disabled = !canRun \|\| progress\.running/);
  assert.match(source, /disabled=\{disabled\}/);
  assert.match(source, /progress\.running && \(/);
});
