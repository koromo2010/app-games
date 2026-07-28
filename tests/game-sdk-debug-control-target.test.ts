import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  completeGameSdkDebugControlSwitch,
  gameSdkDebugControlCanSend,
  gameSdkDebugTargetActorSeat,
  gameSdkDebugTargetViewer,
  resetGameSdkDebugControl,
  wrapGameSdkDebugCommand,
} from "../lib/game-sdk-debug-control-target.ts";

test("debug control keeps viewer and actor on one target", () => {
  const switching = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 4 },
  );
  assert.equal(gameSdkDebugTargetViewer(switching.target), 4);
  assert.equal(gameSdkDebugTargetActorSeat(switching), null);
  assert.equal(gameSdkDebugControlCanSend(switching), false);
  assert.throws(
    () => wrapGameSdkDebugCommand(switching, { type: "skull/place-card" }),
    /DEBUG_ACTOR_SWITCH_PENDING/,
  );

  const ready = completeGameSdkDebugControlSwitch(
    switching,
    switching.generation,
  );
  assert.equal(gameSdkDebugTargetActorSeat(ready), 4);
  assert.deepEqual(
    wrapGameSdkDebugCommand(ready, { type: "skull/place-card", card: "flower" }),
    {
      type: "room/debug-act-as-dummy",
      seat: 4,
      command: { type: "skull/place-card", card: "flower" },
    },
  );
});

test("stale viewer completion cannot confirm a newer target", () => {
  const seatTwo = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 1 },
  );
  const seatFive = beginGameSdkDebugControlSwitch(
    seatTwo,
    { mode: "dummy", seat: 4 },
  );
  const staleCompletion = completeGameSdkDebugControlSwitch(
    seatFive,
    seatTwo.generation,
  );
  assert.equal(staleCompletion, seatFive);
  assert.equal(staleCompletion.status, "switching");
  assert.equal(gameSdkDebugTargetActorSeat(staleCompletion), null);

  const completed = completeGameSdkDebugControlSwitch(
    seatFive,
    seatFive.generation,
  );
  assert.equal(completed.status, "ready");
  assert.equal(gameSdkDebugTargetActorSeat(completed), 4);
});

test("all six seats can be selected sequentially without retaining an old actor", () => {
  let state = INITIAL_GAME_SDK_DEBUG_CONTROL_STATE;
  for (let seat = 0; seat < 6; seat += 1) {
    state = beginGameSdkDebugControlSwitch(state, { mode: "dummy", seat });
    assert.equal(gameSdkDebugTargetActorSeat(state), null);
    state = completeGameSdkDebugControlSwitch(state, state.generation);
    assert.equal(gameSdkDebugTargetActorSeat(state), seat);
  }
});

test("spectator and self never become command actors", () => {
  let state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "spectator" },
  );
  state = completeGameSdkDebugControlSwitch(state, state.generation);
  assert.equal(gameSdkDebugTargetViewer(state.target), "spectator");
  assert.equal(gameSdkDebugTargetActorSeat(state), null);
  assert.deepEqual(
    wrapGameSdkDebugCommand(state, { type: "skull/place-card" }),
    { type: "skull/place-card" },
  );

  state = resetGameSdkDebugControl(state);
  assert.equal(gameSdkDebugTargetViewer(state.target), "self");
  assert.equal(gameSdkDebugTargetActorSeat(state), null);
});
