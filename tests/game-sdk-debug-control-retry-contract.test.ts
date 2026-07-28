import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hook = readFileSync(
  "app/hooks/use-game-sdk-debug-control-target.ts",
  "utf8",
);

test("debug viewer hook keeps public callbacks stable across caller renders", () => {
  assert.match(hook, /const optionsRef = useRef\(options\)/);
  assert.match(hook, /optionsRef\.current = options/);
  assert.match(hook, /const postRoom = useCallback\([\s\S]*?\}, \[clearOperation, clearRetryTimer, commit, emitTelemetry\]\)/);
  assert.match(hook, /const reset = useCallback\([\s\S]*?\}, \[clearOperation, commit\]\)/);
  assert.doesNotMatch(
    hook,
    /\[commit, getRoom, onViewerError, postRoomSnapshot, readRoomAsDebugViewer\]/,
  );
});

test("debug viewer read failures retry without dispatching under an unconfirmed actor", () => {
  const catchBlock = hook.match(/\.catch\(\(error\) => \{([\s\S]*?)\n      \}\);/)?.[1] ?? "";
  assert.match(catchBlock, /DEBUG_VIEWER_RETRY_DELAYS_MS/);
  assert.match(catchBlock, /DEBUG_VIEWER_MAX_ERROR_RETRIES/);
  assert.match(catchBlock, /setTimeout/);
  assert.match(catchBlock, /requestViewerRoom\(retryRoom, "error-retry"\)/);
  assert.doesNotMatch(catchBlock, /completeGameSdkDebugControlSwitch/);
});

test("debug viewer retries remain bound to the selected generation, viewer and room", () => {
  assert.match(hook, /retryState\.generation === generation/);
  assert.match(hook, /gameSdkDebugTargetViewer\(retryState\.target\) === viewer/);
  assert.match(hook, /retryRoom\?\.code === requestedRoom\.code/);
  assert.match(hook, /\[500, 1_000, 2_000, 5_000\]/);
});

test("debug viewer synchronization has explicit retry, refetch and deadline limits", () => {
  assert.match(hook, /DEBUG_VIEWER_MAX_ERROR_RETRIES = DEBUG_VIEWER_RETRY_DELAYS_MS\.length/);
  assert.match(hook, /DEBUG_VIEWER_MAX_REVISION_REFETCHES = 3/);
  assert.match(hook, /DEBUG_VIEWER_OPERATION_DEADLINE_MS = 10_000/);
  assert.match(hook, /operation\.revisionRefetchCount >= DEBUG_VIEWER_MAX_REVISION_REFETCHES/);
  assert.match(hook, /operation\.errorRetryCount >= DEBUG_VIEWER_MAX_ERROR_RETRIES/);
  assert.match(hook, /failSwitch\("refetch_limit"/);
  assert.match(hook, /failSwitch\("retry_limit"/);
  assert.match(hook, /failSwitch\("timeout"/);
});

test("revision refetch keeps commands blocked until the final viewer snapshot is ready", () => {
  const refetchBlock = hook.match(/if \(decision\.refetch && latestRoom\) \{([\s\S]*?)\n        \}/)?.[1] ?? "";
  assert.match(refetchBlock, /requestViewerRoom\(latestRoom, "revision-refetch"\)/);
  assert.doesNotMatch(refetchBlock, /completeGameSdkDebugControlSwitch/);
  assert.match(hook, /commit\(completeGameSdkDebugControlSwitch\(latest, generation\)\)/);
});

test("debug viewer telemetry distinguishes initial, retry and revision-refetch traffic", () => {
  assert.match(hook, /"initial" \| "error-retry" \| "revision-refetch"/);
  assert.match(hook, /errorRetryCount/);
  assert.match(hook, /revisionRefetchCount/);
  assert.match(hook, /totalRequestCount/);
  assert.match(hook, /requestedRevision/);
  assert.match(hook, /latestRevision/);
  assert.match(hook, /requestDurationMs/);
  assert.match(hook, /totalSwitchDurationMs/);
  assert.match(hook, /operationId/);
});

test("debug viewer telemetry does not expose raw room or player identifiers", () => {
  const telemetryType = hook.match(/export type GameSdkDebugViewerTelemetry = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.doesNotMatch(telemetryType, /roomCode|playerId|playerName|displayName|actorId/);
});
