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
  type GameSdkDebugControlState,
} from "../lib/game-sdk-debug-control-target.ts";

function createDeterministicRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

function randomInteger(random: () => number, minimum: number, maximum: number) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function completeCurrentSwitch(state: GameSdkDebugControlState) {
  return completeGameSdkDebugControlSwitch(state, state.generation);
}

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

  const ready = completeCurrentSwitch(switching);
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

test("debug target invariants hold for arbitrary seat counts and switch orders", () => {
  const random = createDeterministicRandom(0x5eed_c0de);

  for (let scenario = 0; scenario < 1_000; scenario += 1) {
    const seatCount = randomInteger(random, 1, 256);
    const switchCount = randomInteger(random, 1, 300);
    let state = INITIAL_GAME_SDK_DEBUG_CONTROL_STATE;
    let lastSelectedSeat = 0;
    const priorGenerations: number[] = [];

    for (let step = 0; step < switchCount; step += 1) {
      lastSelectedSeat = randomInteger(random, 0, seatCount - 1);
      state = beginGameSdkDebugControlSwitch(state, {
        mode: "dummy",
        seat: lastSelectedSeat,
      });
      priorGenerations.push(state.generation);

      assert.equal(state.status, "switching");
      assert.equal(gameSdkDebugTargetViewer(state.target), lastSelectedSeat);
      assert.equal(gameSdkDebugTargetActorSeat(state), null);
      assert.equal(gameSdkDebugControlCanSend(state), false);
      assert.throws(
        () => wrapGameSdkDebugCommand(state, { type: "property/command" }),
        /DEBUG_ACTOR_SWITCH_PENDING/,
      );

      if (priorGenerations.length > 1 && random() < 0.7) {
        const staleIndex = randomInteger(random, 0, priorGenerations.length - 2);
        const beforeStaleCompletion = state;
        state = completeGameSdkDebugControlSwitch(
          state,
          priorGenerations[staleIndex]!,
        );
        assert.equal(state, beforeStaleCompletion);
        assert.equal(state.status, "switching");
        assert.equal(gameSdkDebugTargetActorSeat(state), null);
      }
    }

    state = completeCurrentSwitch(state);
    assert.equal(state.status, "ready");
    assert.equal(gameSdkDebugTargetActorSeat(state), lastSelectedSeat);
    assert.deepEqual(
      wrapGameSdkDebugCommand(state, { type: "property/command" }),
      {
        type: "room/debug-act-as-dummy",
        seat: lastSelectedSeat,
        command: { type: "property/command" },
      },
    );

    for (const staleGeneration of priorGenerations.slice(0, -1)) {
      const completed = completeGameSdkDebugControlSwitch(state, staleGeneration);
      assert.equal(completed, state);
      assert.equal(gameSdkDebugTargetActorSeat(completed), lastSelectedSeat);
    }
  }
});

test("spectator and self never become command actors", () => {
  let state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "spectator" },
  );
  state = completeCurrentSwitch(state);
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
