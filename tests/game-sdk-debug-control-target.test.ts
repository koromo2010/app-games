import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  gameSdkDebugAutoFollowTarget,
  beginGameSdkDebugViewerRequest,
  completeGameSdkDebugControlSwitch,
  completeGameSdkDebugViewerRequest,
  decideGameSdkDebugViewerResponse,
  gameSdkDebugControlCanSend,
  gameSdkDebugSelectedActorSeat,
  gameSdkDebugTargetActorSeat,
  gameSdkDebugTargetViewer,
  gameSdkDebugViewerRequestIsCurrent,
  resetGameSdkDebugControl,
  wrapGameSdkDebugCommand,
  type GameSdkDebugControlState,
  type GameSdkDebugViewerRequest,
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

test("debug control keeps the selected actor highlighted while command dispatch waits", () => {
  const switching = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 4 },
  );
  assert.equal(gameSdkDebugTargetViewer(switching.target), 4);
  assert.equal(gameSdkDebugSelectedActorSeat(switching), 4);
  assert.equal(gameSdkDebugTargetActorSeat(switching), null);
  assert.equal(gameSdkDebugControlCanSend(switching), false);
  assert.throws(
    () => wrapGameSdkDebugCommand(switching, { type: "skull/place-card" }),
    /DEBUG_ACTOR_SWITCH_PENDING/,
  );

  const ready = completeCurrentSwitch(switching);
  assert.equal(gameSdkDebugSelectedActorSeat(ready), 4);
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
      assert.equal(gameSdkDebugSelectedActorSeat(state), lastSelectedSeat);
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
        assert.equal(gameSdkDebugSelectedActorSeat(state), lastSelectedSeat);
        assert.equal(gameSdkDebugTargetActorSeat(state), null);
      }
    }

    state = completeCurrentSwitch(state);
    assert.equal(state.status, "ready");
    assert.equal(gameSdkDebugSelectedActorSeat(state), lastSelectedSeat);
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
      assert.equal(gameSdkDebugSelectedActorSeat(completed), lastSelectedSeat);
      assert.equal(gameSdkDebugTargetActorSeat(completed), lastSelectedSeat);
    }
  }
});

test("spectator and self never become command actors", () => {
  let state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "spectator" },
  );
  assert.equal(gameSdkDebugSelectedActorSeat(state), null);
  state = completeCurrentSwitch(state);
  assert.equal(gameSdkDebugTargetViewer(state.target), "spectator");
  assert.equal(gameSdkDebugSelectedActorSeat(state), null);
  assert.equal(gameSdkDebugTargetActorSeat(state), null);
  assert.deepEqual(
    wrapGameSdkDebugCommand(state, { type: "skull/place-card" }),
    { type: "skull/place-card" },
  );

  state = resetGameSdkDebugControl(state);
  assert.equal(gameSdkDebugTargetViewer(state.target), "self");
  assert.equal(gameSdkDebugSelectedActorSeat(state), null);
  assert.equal(gameSdkDebugTargetActorSeat(state), null);
});

test("only one debug viewer request starts in the same generation", () => {
  let inFlight: GameSdkDebugViewerRequest | null = null;
  let started = 0;

  for (let sequence = 1; sequence <= 100; sequence += 1) {
    const acquisition = beginGameSdkDebugViewerRequest(inFlight, 7, sequence);
    if (acquisition.started) {
      started += 1;
      inFlight = acquisition.request;
    }
  }

  assert.equal(started, 1);
  assert.deepEqual(inFlight, { generation: 7, sequence: 1 });

  const current = inFlight!;
  inFlight = completeGameSdkDebugViewerRequest(inFlight, current);
  assert.equal(inFlight, null);

  const next = beginGameSdkDebugViewerRequest(inFlight, 7, 101);
  assert.equal(next.started, true);
  assert.deepEqual(next.request, { generation: 7, sequence: 101 });
});

test("a newer generation replaces the old request and stale failures cannot reset it", () => {
  const oldRequest = beginGameSdkDebugViewerRequest(null, 10, 1).request;
  const newRequest = beginGameSdkDebugViewerRequest(oldRequest, 11, 2).request;
  let inFlight: GameSdkDebugViewerRequest | null = newRequest;
  let state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 5 },
  );
  state = beginGameSdkDebugControlSwitch(state, { mode: "dummy", seat: 6 });

  assert.equal(gameSdkDebugViewerRequestIsCurrent(inFlight, oldRequest), false);
  if (gameSdkDebugViewerRequestIsCurrent(inFlight, oldRequest)) {
    state = resetGameSdkDebugControl(state);
  }
  assert.equal(state.generation, 2);
  assert.equal(gameSdkDebugTargetViewer(state.target), 6);
  assert.equal(gameSdkDebugSelectedActorSeat(state), 6);

  assert.equal(gameSdkDebugViewerRequestIsCurrent(inFlight, newRequest), true);
  if (gameSdkDebugViewerRequestIsCurrent(inFlight, newRequest)) {
    inFlight = completeGameSdkDebugViewerRequest(inFlight, newRequest);
    state = resetGameSdkDebugControl(state);
  }
  assert.equal(inFlight, null);
  assert.equal(state.generation, 3);
  assert.equal(gameSdkDebugTargetViewer(state.target), "self");
  assert.equal(gameSdkDebugSelectedActorSeat(state), null);
});

test("viewer response completes the switch when the room revision advanced", () => {
  const state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 4 },
  );
  const decision = decideGameSdkDebugViewerResponse({
    state,
    generation: state.generation,
    viewer: 4,
    requestedRoom: { code: "ROOM", revision: 10 },
    latestRoom: { code: "ROOM", revision: 11 },
  });

  assert.deepEqual(decision, { apply: true, refetch: true });
  assert.equal(
    completeGameSdkDebugControlSwitch(state, state.generation).status,
    "ready",
  );
});

test("viewer response at the latest revision does not request another fetch", () => {
  const state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "viewer", seat: 2 },
  );
  assert.deepEqual(
    decideGameSdkDebugViewerResponse({
      state,
      generation: state.generation,
      viewer: 2,
      requestedRoom: { code: "ROOM", revision: 12 },
      latestRoom: { code: "ROOM", revision: 12 },
    }),
    { apply: true, refetch: false },
  );
});

test("stale generations and changed room codes remain rejected", () => {
  let state = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 3 },
  );
  const staleGeneration = state.generation;
  state = beginGameSdkDebugControlSwitch(state, { mode: "dummy", seat: 4 });

  assert.deepEqual(
    decideGameSdkDebugViewerResponse({
      state,
      generation: staleGeneration,
      viewer: 3,
      requestedRoom: { code: "ROOM", revision: 1 },
      latestRoom: { code: "ROOM", revision: 2 },
    }),
    { apply: false, refetch: false },
  );
  assert.deepEqual(
    decideGameSdkDebugViewerResponse({
      state,
      generation: state.generation,
      viewer: 4,
      requestedRoom: { code: "OLD", revision: 1 },
      latestRoom: { code: "NEW", revision: 1 },
    }),
    { apply: false, refetch: false },
  );
});

test("a completed request can start exactly one follow-up in the same generation", () => {
  const first = beginGameSdkDebugViewerRequest(null, 9, 1).request;
  let inFlight: GameSdkDebugViewerRequest | null = first;
  inFlight = completeGameSdkDebugViewerRequest(inFlight, first);

  const followUp = beginGameSdkDebugViewerRequest(inFlight, 9, 2);
  assert.equal(followUp.started, true);
  inFlight = followUp.request;

  const duplicate = beginGameSdkDebugViewerRequest(inFlight, 9, 3);
  assert.equal(duplicate.started, false);
  assert.equal(duplicate.request, followUp.request);
});


test("DEBUG auto-follow maps host to self and dummy seats to unified targets", () => {
  const players = [
    { seat: 0, isHost: true, isSelf: true, isDummy: false },
    { seat: 1, isHost: false, isSelf: false, isDummy: true },
    { seat: 2, isHost: false, isSelf: false, isDummy: false },
  ];
  assert.deepEqual(gameSdkDebugAutoFollowTarget(0, players), { mode: "self" });
  assert.deepEqual(gameSdkDebugAutoFollowTarget(1, players), { mode: "dummy", seat: 1 });
  assert.equal(gameSdkDebugAutoFollowTarget(2, players), null);
  assert.equal(gameSdkDebugAutoFollowTarget(null, players), null);
});

test("DEBUG switch records auto-follow as the trigger source", () => {
  const next = beginGameSdkDebugControlSwitch(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
    { mode: "dummy", seat: 3 },
    "auto-follow",
  );
  assert.equal(next.source, "auto-follow");
  assert.equal(next.status, "switching");
});
