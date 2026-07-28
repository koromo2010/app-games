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
  assert.match(hook, /const postRoom = useCallback\([\s\S]*?\}, \[clearRetry, commit\]\)/);
  assert.match(hook, /const reset = useCallback\([\s\S]*?\}, \[clearRetry, commit\]\)/);
  assert.doesNotMatch(
    hook,
    /\[commit, getRoom, onViewerError, postRoomSnapshot, readRoomAsDebugViewer\]/,
  );
});

test("debug viewer read failures retry without resetting the actor to HOST", () => {
  const catchBlock = hook.match(/\.catch\(\(\) => \{([\s\S]*?)\n      \}\);/)?.[1] ?? "";
  assert.match(catchBlock, /DEBUG_VIEWER_RETRY_DELAYS_MS/);
  assert.match(catchBlock, /setTimeout/);
  assert.match(catchBlock, /requestViewerRoom\(retryRoom\)/);
  assert.doesNotMatch(catchBlock, /resetGameSdkDebugControl/);
  assert.doesNotMatch(catchBlock, /postRoomSnapshot\(.*getRoom/);
});

test("debug viewer retries remain bound to the selected generation, viewer and room", () => {
  assert.match(hook, /retryState\.generation === generation/);
  assert.match(hook, /gameSdkDebugTargetViewer\(retryState\.target\) === viewer/);
  assert.match(hook, /retryRoom\?\.code === requestedRoom\.code/);
  assert.match(hook, /\[500, 1_000, 2_000, 5_000\]/);
});
