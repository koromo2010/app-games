import assert from "node:assert/strict";
import test from "node:test";
import {
  allGameSdkParticipantsComplete,
  assertGameSdkCanStart,
  assignGameSdkRoles,
  createInitialGameSdkModuleProfile,
  defineGameSdkStandardResult,
  distributeGameSdkBalancedTeams,
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_IDS,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  missingGameSdkParticipantIds,
  nextGameSdkEligibleSeat,
  nextGameSdkRoundStep,
  recordGameSdkParticipantValue,
  recordGameSdkVote,
  requiredGameSdkModuleIds,
  tallyGameSdkVotes,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

test("initial mock profile requires every shared module", () => {
  const profile = createInitialGameSdkModuleProfile();
  assert.deepEqual(requiredGameSdkModuleIds(profile), GAME_SDK_MODULE_IDS);
  assert.equal(
    GAME_SDK_MODULE_CATALOG.every(
      (definition) => profile[definition.id].mode === "required",
    ),
    true,
  );
});

test("only a human review path can disable reviewable modules with a reason", () => {
  const initial = createInitialGameSdkModuleProfile();
  const reviewed = updateGameSdkModuleProfile(initial, {
    vote: {
      mode: "disabled",
      reason: "投票を行わない協力ゲームのため",
    },
  });
  assert.deepEqual(reviewed.vote, {
    mode: "disabled",
    reason: "投票を行わない協力ゲームのため",
  });
  assert.throws(
    () => updateGameSdkModuleProfile(initial, {
      authentication: {
        mode: "disabled",
        reason: "外したい",
      },
    }),
    /GAME_SDK_MODULE_PLATFORM_LOCKED/,
  );
  assert.throws(
    () => updateGameSdkModuleProfile(initial, {
      vote: {
        mode: "disabled",
        reason: "",
      },
    }),
    /GAME_SDK_MODULE_REASON_REQUIRED/,
  );
});

test("participant collection handles duplicates, missing actions and immutable recording", () => {
  const participants = ["a", "b", "a"] as const;
  assert.deepEqual(
    missingGameSdkParticipantIds(participants, (id) => id === "a"),
    ["b"],
  );
  assert.equal(
    allGameSdkParticipantsComplete(participants, (id) => id === "a"),
    false,
  );
  const values = recordGameSdkParticipantValue(
    { a: "first" },
    "b",
    "second",
    { participantIds: participants },
  );
  assert.deepEqual(values, { a: "first", b: "second" });
  assert.throws(
    () => recordGameSdkParticipantValue(values, "b", "again", {
      participantIds: participants,
    }),
    /ALREADY_SUBMITTED/,
  );
  assert.equal(
    allGameSdkParticipantsComplete(participants, (id) => Boolean(values[id])),
    true,
  );
});

test("vote module enforces voter, target, self-vote and replacement policies", () => {
  const first = recordGameSdkVote(
    {},
    "a",
    "b",
    { voterIds: ["a", "b"], targetIds: ["a", "b"] },
  );
  assert.deepEqual(first, { a: "b" });
  assert.throws(
    () => recordGameSdkVote(first, "b", "b", {
      voterIds: ["a", "b"],
      targetIds: ["a", "b"],
    }),
    /SELF_VOTE_NOT_ALLOWED/,
  );
  assert.throws(
    () => recordGameSdkVote(first, "a", "b", {
      voterIds: ["a", "b"],
      targetIds: ["a", "b"],
    }),
    /VOTE_ALREADY_SUBMITTED/,
  );
  assert.deepEqual(
    recordGameSdkVote(first, "a", "a", {
      voterIds: ["a", "b"],
      targetIds: ["a", "b"],
      allowSelfVote: true,
      allowReplace: true,
    }),
    { a: "a" },
  );
});

test("vote tally reports ties and ignores values outside the target set", () => {
  assert.deepEqual(
    tallyGameSdkVotes(
      { a: "x", b: "y", c: "outside", d: "x" },
      ["x", "y"],
    ),
    {
      counts: { x: 2, y: 1 },
      maximumVotes: 2,
      leaderIds: ["x"],
      tied: false,
    },
  );
  assert.deepEqual(
    tallyGameSdkVotes({ a: "x", b: "y" }, ["x", "y"]).leaderIds,
    ["x", "y"],
  );
});

test("turn and round modules advance without game-specific state", () => {
  assert.equal(nextGameSdkEligibleSeat(["a", "b", "c"], 0, ["b"]), 2);
  assert.equal(nextGameSdkEligibleSeat(["a"], 0, new Set(["a"])), -1);
  assert.deepEqual(
    nextGameSdkRoundStep({
      currentRound: 1,
      totalRounds: 2,
      repeatPhase: "clue",
      completedPhase: "vote",
    }),
    { round: 2, phase: "clue", complete: false },
  );
  assert.deepEqual(
    nextGameSdkRoundStep({
      currentRound: 2,
      totalRounds: 2,
      repeatPhase: "clue",
      completedPhase: "vote",
    }),
    { round: 2, phase: "vote", complete: true },
  );
});

test("role and team modules assign every participant exactly once", () => {
  const roles = assignGameSdkRoles(
    ["a", "b", "c"],
    { wolf: 1 },
    "village",
    () => 0,
  );
  assert.equal(Object.values(roles).filter((role) => role === "wolf").length, 1);
  assert.equal(Object.values(roles).filter((role) => role === "village").length, 2);

  const teams = distributeGameSdkBalancedTeams(
    ["a", "b", "c", "d", "e"],
    ["red", "blue"],
    () => 0,
  );
  assert.deepEqual(teams.participantIds, ["b", "c", "d", "e", "a"]);
  assert.deepEqual(
    teams.participantIds.map((id) => teams.assignments[id]),
    ["red", "blue", "red", "blue", "red"],
  );
});

test("seat, start and standard result modules expose the shared contracts", () => {
  const players = [{ id: "a" }, { id: "b" }];
  assert.equal(gameSdkPlayerSeat(players, "b"), 1);
  assert.deepEqual(gameSdkPlayerSeats(players, ["b", "missing", "a"]), [1, 0]);
  assert.doesNotThrow(() => assertGameSdkCanStart({
    actorId: "host",
    hostId: "host",
    phase: "lobby",
    participantCount: 2,
    minimumPlayers: 2,
  }));
  assert.throws(() => assertGameSdkCanStart({
    actorId: "player",
    hostId: "host",
    phase: "lobby",
    participantCount: 2,
    minimumPlayers: 2,
  }), /HOST_REQUIRED/);

  assert.deepEqual(
    defineGameSdkStandardResult({
      winnerIds: ["a", "a"],
      rankings: [
        { participantId: "b", rank: 2, score: 0 },
        { participantId: "a", rank: 1, score: 3 },
      ],
      reason: "  score  ",
    }),
    {
      winnerIds: ["a"],
      rankings: [
        { participantId: "a", rank: 1, score: 3 },
        { participantId: "b", rank: 2, score: 0 },
      ],
      reason: "score",
    },
  );
});
