import assert from "node:assert/strict";
import test from "node:test";
import {
  codeInterceptDefaults,
  codeInterceptTeamsAreStartable,
  finishCodeInterceptRound,
  isValidCodeInterceptAnswer,
  normalizeCodeInterceptCardCount,
  normalizeCodeInterceptCodeLength,
  sanitizeCodeInterceptRoomForPlayer,
  type CodeInterceptRoom,
} from "../lib/code-intercept.ts";

function room(): CodeInterceptRoom {
  const now = Date.now();
  return {
    code: "TEST", revision: 0, hostId: "r1", passphrase: "secret", phase: "answer",
    players: [
      { id: "r1", name: "赤1", joinedAt: now, teamId: "red" },
      { id: "r2", name: "赤2", joinedAt: now, teamId: "red" },
      { id: "b1", name: "青1", joinedAt: now, teamId: "blue" },
      { id: "b2", name: "青2", joinedAt: now, teamId: "blue" },
    ],
    playerCapacity: 6, gameNumber: 1, roundNumber: 2,
    cardCount: 4, codeLengthMode: "fixed", fixedCodeLength: 3, initialPoints: 5, miscommunicationDamage: 1, interceptionDamage: 2,
    actionTimeLimitSeconds: 0, phaseStartedAt: now, debugMode: false, debugReplayEnabled: false,
    teams: [
      { id: "red", name: "赤チーム", points: 5, secretWords: ["猫", "宇宙", "寿司", "雨"] },
      { id: "blue", name: "青チーム", points: 2, secretWords: ["山", "海", "空", "森"] },
    ],
    clueGiverIds: { red: "r1", blue: "b1" }, codeLengthChoices: {}, roundCodeLengths: { red: 3, blue: 3 }, secretCodes: { red: [3, 1, 4], blue: [2, 4, 1] },
    clues: { red: ["醤油", "肉球", "傘"], blue: ["高原", "木陰", "波"] },
    allyAnswers: { red: [3, 1, 2], blue: [2, 4, 1] }, interceptAnswers: { red: [2, 4, 1], blue: [3, 1, 4] },
    roundHistory: [], winner: null, debugLog: [], createdAt: now, updatedAt: now,
  };
}

test("team balance requires two players per team and at most one player difference", () => {
  const base = room();
  assert.equal(codeInterceptTeamsAreStartable(base), true);
  assert.equal(codeInterceptTeamsAreStartable({ players: base.players.slice(0, 3) }), false);
});

test("answers must have the fixed length, range, and no duplicates", () => {
  assert.equal(isValidCodeInterceptAnswer([3, 1, 4], 4, 3), true);
  assert.equal(isValidCodeInterceptAnswer([1, 1, 3], 4, 3), false);
  assert.equal(isValidCodeInterceptAnswer([5, 2, 1], 4, 3), false);
});

test("card count and code length stay inside the supported range", () => {
  assert.equal(normalizeCodeInterceptCardCount(1), 2);
  assert.equal(normalizeCodeInterceptCardCount(20), 8);
  assert.equal(normalizeCodeInterceptCodeLength(4, 4), 4);
  assert.equal(normalizeCodeInterceptCodeLength(5, 4), 4);
});

test("each team can use a different code length in the same round", () => {
  const current = room();
  current.codeLengthMode = "per-round";
  current.codeLengthChoices = {
    red: { teamId: "red", selectedByPlayerId: "r1", codeLength: 2, lockedAt: Date.now() },
    blue: { teamId: "blue", selectedByPlayerId: "b1", codeLength: 4, lockedAt: Date.now() },
  };
  current.roundCodeLengths = { red: 2, blue: 4 };
  current.secretCodes = { red: [3, 1], blue: [2, 4, 1, 3] };
  current.clues = { red: ["醤油", "肉球"], blue: ["高原", "木陰", "波", "夜空"] };
  current.allyAnswers = { red: [3, 1], blue: [2, 4, 1, 3] };
  current.interceptAnswers = { red: [2, 4, 1, 3], blue: [3, 1] };
  const finished = finishCodeInterceptRound(current);
  assert.deepEqual(finished.roundHistory[0].teams.map((team) => team.codeLength), [2, 4]);
  assert.equal(finished.roundHistory[0].teams.every((team) => team.enemyIntercepted), true);
  assert.deepEqual(finished.roundHistory[0].teams.map((team) => team.codeLengthSelectedByPlayerId), ["r1", "b1"]);
});

test("round damage is calculated simultaneously and can end in a draw", () => {
  const current = room();
  current.teams[0].points = 2;
  const finished = finishCodeInterceptRound(current);
  const red = finished.teams.find((team) => team.id === "red")!;
  const blue = finished.teams.find((team) => team.id === "blue")!;
  assert.equal(red.points, 0);
  assert.equal(blue.points, 0);
  assert.equal(finished.winner, "draw");
  assert.equal(finished.phase, "game-result");
  assert.equal(finished.roundHistory[0].teams.find((team) => team.teamId === "red")?.totalDamage, 3);
});

test("first round does not apply interception damage", () => {
  const current = room();
  current.roundNumber = codeInterceptDefaults.interceptionStartsAtRound - 1;
  const finished = finishCodeInterceptRound(current);
  assert.equal(finished.roundHistory[0].teams.every((team) => team.interceptionDamage === 0), true);
});

test("sanitization hides enemy secrets and unresolved answers", () => {
  const sanitized = sanitizeCodeInterceptRoomForPlayer(room(), "r2");
  assert.deepEqual(sanitized.teams.find((team) => team.id === "blue")?.secretWords, []);
  assert.equal(sanitized.passphrase, "");
  assert.equal(sanitized.secretCodes.red, undefined);
  assert.equal(sanitized.interceptAnswers.blue, undefined);
  assert.deepEqual(sanitized.interceptAnswers.red, [2, 4, 1]);
});

test("per-round choices stay hidden from the enemy until both teams lock", () => {
  const current = room();
  current.phase = "code-length";
  current.codeLengthMode = "per-round";
  current.codeLengthChoices = { red: { teamId: "red", selectedByPlayerId: "r1", codeLength: 2, lockedAt: Date.now() } };
  current.roundCodeLengths = {};
  current.secretCodes = {};
  const redView = sanitizeCodeInterceptRoomForPlayer(current, "r2");
  const blueView = sanitizeCodeInterceptRoomForPlayer(current, "b2");
  assert.equal(redView.codeLengthChoices.red?.codeLength, 2);
  assert.equal(blueView.codeLengthChoices.red, undefined);
  assert.deepEqual(redView.roundCodeLengths, {});
});
