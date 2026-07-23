import assert from "node:assert/strict";
import test from "node:test";
import {
  createWordWolfCommandScope,
  wordWolfCommandAlreadyApplied,
  wordWolfCommandScopeMatches,
} from "../lib/wordwolf-command-scope.ts";
import type { Room } from "../lib/wordwolf-game-types.ts";

const room = {
  code: "ABCD",
  revision: 5,
  gameNumber: 2,
  phase: "vote",
  currentRound: 3,
  currentTurnStartedAt: 1000,
  votes: {},
  voteHistory: [],
  clues: [],
  wolfGuess: "",
} as unknown as Room;

test("wordwolf command scopes survive same-phase CAS changes but not phase changes", () => {
  const scope = createWordWolfCommandScope(room);
  assert.equal(wordWolfCommandScopeMatches({ ...room, revision: 6 }, scope, "cast-vote"), true);
  assert.equal(wordWolfCommandScopeMatches({ ...room, revision: 6, currentTurnStartedAt: 2000 }, scope, "cast-vote"), false);
  assert.equal(wordWolfCommandScopeMatches({ ...room, revision: 6, phase: "result" }, scope, "cast-vote"), false);
});

test("start commands require the exact lobby revision", () => {
  const lobby = { ...room, phase: "lobby", currentTurnStartedAt: null } as Room;
  const scope = createWordWolfCommandScope(lobby);
  assert.equal(wordWolfCommandScopeMatches(lobby, scope, "start-game"), true);
  assert.equal(wordWolfCommandScopeMatches({ ...lobby, revision: lobby.revision + 1 }, scope, "start-game"), false);
});

test("accepted clues and completed votes are recognized after phase progression", () => {
  const clueScope = createWordWolfCommandScope({ ...room, phase: "clue", currentRound: 2 } as Room);
  const afterClue = { ...room, phase: "vote", clues: [{ playerId: "p1", round: 2, text: "hint", at: 1100 }] } as Room;
  assert.equal(wordWolfCommandAlreadyApplied(afterClue, clueScope, "submit-clue", "p1"), true);

  const voteScope = createWordWolfCommandScope(room);
  const afterVote = {
    ...room,
    phase: "result",
    voteHistory: [{ round: 1, votes: { p1: "p2" }, candidateIds: ["p2"], at: 1200 }],
  } as Room;
  assert.equal(wordWolfCommandAlreadyApplied(afterVote, voteScope, "cast-vote", "p1"), true);
});

test("old-game commands are never treated as already applied in a new game", () => {
  const scope = createWordWolfCommandScope(room);
  assert.equal(wordWolfCommandAlreadyApplied({ ...room, gameNumber: 3, phase: "result", wolfGuess: "answer" }, scope, "submit-wolf-guess", "p1"), false);
});
