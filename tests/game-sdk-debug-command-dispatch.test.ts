import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  completeGameSdkDebugControlSwitch,
  gameSdkDebugControlCanDispatch,
  gameSdkDebugControlCanSend,
  wrapGameSdkDebugCommand,
} from "../lib/game-sdk-debug-control-target.ts";

test("transport dispatch does not trust stale rendered readiness", () => {
  const switching = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 3 },
  );

  assert.equal(gameSdkDebugControlCanDispatch(switching), true);
  assert.equal(gameSdkDebugControlCanSend(switching), false);
  assert.throws(
    () => wrapGameSdkDebugCommand(switching, { type: "skull/select-penalty-card" }),
    /DEBUG_ACTOR_SWITCH_PENDING/,
  );

  const ready = completeGameSdkDebugControlSwitch(
    switching,
    switching.generation,
  );

  assert.equal(gameSdkDebugControlCanDispatch(ready), true);
  assert.equal(gameSdkDebugControlCanSend(ready), true);
  assert.deepEqual(
    wrapGameSdkDebugCommand(ready, { type: "skull/select-penalty-card", index: 1 }),
    {
      type: "room/debug-act-as-dummy",
      seat: 3,
      command: { type: "skull/select-penalty-card", index: 1 },
    },
  );
});
