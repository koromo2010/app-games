import assert from "node:assert/strict";
import test from "node:test";
import { getVoteVoters } from "../app/wordwolf/game-flow.ts";
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
