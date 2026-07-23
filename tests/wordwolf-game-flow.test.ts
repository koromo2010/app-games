import assert from "node:assert/strict";
import test from "node:test";
import { getVoteCandidatesForVoter, getVoteVoters } from "../app/wordwolf/game-flow.ts";
import { hasAcceptedWordWolfVote, isValidWordWolfVoteTarget } from "../lib/wordwolf-voting.ts";
import type { Room } from "../lib/wordwolf-game-types.ts";

const players = ["p1", "p2", "p3", "p4"].map((id) => ({ id, name: id, joinedAt: 1 }));

function roomWithRunoff(runoffCandidateIds: string[] | null) {
  return { players, runoffCandidateIds } as Room;
}

test("通常投票では全員が投票者になる", () => {
  assert.deepEqual(getVoteVoters(roomWithRunoff(null)).map((player) => player.id), ["p1", "p2", "p3", "p4"]);
});

test("2人の決選投票では候補以外が投票者になる", () => {
  assert.deepEqual(getVoteVoters(roomWithRunoff(["p1", "p2"])).map((player) => player.id), ["p3", "p4"]);
});

test("3人以上の同率決選では候補を含む全員が投票者になる", () => {
  assert.deepEqual(getVoteVoters(roomWithRunoff(["p1", "p2", "p3"])).map((player) => player.id), ["p1", "p2", "p3", "p4"]);
});

test("投票候補には投票者本人を含めない", () => {
  assert.deepEqual(getVoteCandidatesForVoter(roomWithRunoff(null), "p2").map((player) => player.id), ["p1", "p3", "p4"]);
  assert.deepEqual(getVoteCandidatesForVoter(roomWithRunoff(["p1", "p2", "p3"]), "p2").map((player) => player.id), ["p1", "p3"]);
});

test("サーバーdomainも自己投票を拒否する", () => {
  const room = roomWithRunoff(null);
  assert.equal(isValidWordWolfVoteTarget(room, "p2", "p2"), false);
  assert.equal(isValidWordWolfVoteTarget(room, "p2", "p1"), true);
});

test("サーバーdomainは2人決選で候補者からの投票も拒否する", () => {
  const room = roomWithRunoff(["p1", "p2"]);
  assert.equal(isValidWordWolfVoteTarget(room, "p1", "p2"), false);
  assert.equal(isValidWordWolfVoteTarget(room, "p3", "p1"), true);
});

test("保存済みの投票は重複Commandとして判定できる", () => {
  const room = { ...roomWithRunoff(null), votes: { p2: "p1" } } as Room;
  assert.equal(hasAcceptedWordWolfVote(room, "p2"), true);
  assert.equal(hasAcceptedWordWolfVote(room, "p3"), false);
});
