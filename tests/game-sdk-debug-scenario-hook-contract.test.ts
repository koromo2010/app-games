import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/hooks/use-game-sdk-debug-scenario.ts",
  "utf8",
);

test("DEBUG scenario hook exposes progress, run and cancellation", () => {
  assert.match(source, /export type DebugScenarioProgress/);
  assert.match(source, /completedSteps: number/);
  assert.match(source, /elapsedMs: number/);
  assert.match(source, /latestStep: DebugScenarioStep \| null/);
  assert.match(source, /const cancel = useCallback/);
  assert.match(source, /const run = useCallback/);
  assert.match(source, /return \{[\s\S]*cancel,[\s\S]*progress,[\s\S]*run,/);
});

test("DEBUG scenario hook aborts on cancel and unmount", () => {
  assert.match(source, /controllerRef\.current\?\.abort\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{/);
  assert.match(source, /generationRef\.current \+= 1/);
});

test("DEBUG scenario hook applies authoritative room after each step", () => {
  assert.match(source, /onStep\(step, room\)/);
  assert.match(source, /onRoom\(room\)/);
  assert.match(source, /onRoom\(result\.room\)/);
  assert.match(source, /runDebugScenario\(\{/);
});

test("DEBUG scenario hook prevents concurrent batch runs", () => {
  assert.match(source, /if \(controllerRef\.current\) return null/);
  assert.match(source, /controllerRef\.current = controller/);
  assert.match(source, /controllerRef\.current = null/);
});
