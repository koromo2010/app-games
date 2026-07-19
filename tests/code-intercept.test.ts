import assert from "node:assert/strict";
import test from "node:test";
import {
  canReviseCodeInterceptAnswers,
  canSetCodeInterceptPlayerTeam,
  codeInterceptClueHistory,
  codeInterceptDefaults,
  codeInterceptRoomIsStartable,
  codeInterceptTeamHasSubmittedAnswers,
  consensusCodeInterceptAnswer,
  codeInterceptTeamsAreStartable,
  expireCodeInterceptPhase,
  finishCodeInterceptRound,
  isCodeInterceptPhaseExpired,
  isValidCodeInterceptAnswer,
  normalizeCodeInterceptCardCount,
  normalizeCodeInterceptCodeLength,
  normalizeCodeInterceptTimeLimits,
  randomizeCodeInterceptPlayers,
  sanitizeCodeInterceptRoomForPlayer,
  withCodeInterceptConsensusAnswer,
  type CodeInterceptRoom,
} from "../lib/code-intercept.ts";
import { beginGame, dealSecretWords, resetGame } from "../lib/code-intercept-room-domain.ts";
import { codeInterceptWordSelectionBounds } from "../lib/code-intercept-word-repository.ts";

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
    cardCount: 4, teamAssignmentMode: "manual", codeLengthMode: "fixed", codeRevealMode: "all", fixedCodeLength: 3, initialPoints: 5, miscommunicationDamage: 1, interceptionDamage: 2, interceptionStartsAtRound: 2,
    clueTimeLimitSeconds: 0, answerTimeLimitSeconds: 0, phaseStartedAt: now, debugMode: false, debugReplayEnabled: false,
    teams: [
      { id: "red", name: "赤チーム", points: 5, secretWords: ["猫", "宇宙", "寿司", "雨"] },
      { id: "blue", name: "青チーム", points: 2, secretWords: ["山", "海", "空", "森"] },
    ],
    clueGiverIds: { red: "r1", blue: "b1" }, codeLengthChoices: {}, roundCodeLengths: { red: 3, blue: 3 }, secretCodes: { red: [3, 1, 4], blue: [2, 4, 1] },
    clues: { red: ["醤油", "肉球", "傘"], blue: ["高原", "木陰", "波"] },
    allyAnswerProposals: {}, interceptAnswerProposals: {}, allyAnswers: { red: [3, 1, 2], blue: [2, 4, 1] }, interceptAnswers: { red: [2, 4, 1], blue: [3, 1, 4] }, timeoutPenaltyPhases: {},
    roundHistory: [], winner: null, debugLog: [], createdAt: now, updatedAt: now,
  };
}

test("team balance requires two players per team and at most one player difference", () => {
  const base = room();
  assert.equal(codeInterceptTeamsAreStartable(base), true);
  assert.equal(codeInterceptTeamsAreStartable({ players: base.players.slice(0, 3) }), false);
});

test("manual team assignment lets the host move anyone and players move only themselves", () => {
  const current = { ...room(), phase: "lobby" as const, teamAssignmentMode: "manual" as const };
  assert.equal(canSetCodeInterceptPlayerTeam(current, "r1", "b2"), true);
  assert.equal(canSetCodeInterceptPlayerTeam(current, "r2", "r2"), true);
  assert.equal(canSetCodeInterceptPlayerTeam(current, "r2", "b2"), false);
  assert.equal(canSetCodeInterceptPlayerTeam({ ...current, teamAssignmentMode: "random" }, "r1", "b2"), false);
});

test("random team assignment can start from an unbalanced lobby and produces balanced shuffled teams", () => {
  const base = room();
  const players = [
    ...base.players.map((player) => ({ ...player, teamId: "red" as const })),
    { id: "p5", name: "5人目", joinedAt: Date.now(), teamId: "red" as const },
  ];
  assert.equal(codeInterceptRoomIsStartable({ players, teamAssignmentMode: "manual" }), false);
  assert.equal(codeInterceptRoomIsStartable({ players, teamAssignmentMode: "random" }), true);

  const randomized = randomizeCodeInterceptPlayers(players, () => 0);
  assert.deepEqual(randomized.map((player) => player.id), ["r2", "b1", "b2", "p5", "r1"]);
  assert.deepEqual(randomized.map((player) => player.teamId), ["red", "blue", "red", "blue", "red"]);
  assert.deepEqual(new Set(randomized.map((player) => player.id)), new Set(players.map((player) => player.id)));
});

test("a rematch clears the previous game history and deals only the supplied database words", () => {
  const previousGame = finishCodeInterceptRound(room());
  const lobby = resetGame(previousGame);
  assert.equal(lobby.phase, "lobby");
  assert.deepEqual(lobby.roundHistory, []);

  const databaseWords = ["時計", "鉛筆", "図書館", "雪", "扉", "砂漠", "飛行機", "朝焼け"];
  const started = beginGame(lobby, databaseWords);
  assert.deepEqual(started.roundHistory, []);
  assert.equal(started.teams.flatMap((team) => team.secretWords).length, lobby.cardCount * 2);
  assert.deepEqual(new Set(started.teams.flatMap((team) => team.secretWords)), new Set(databaseWords));
});

test("secret cards reject a database pool that is too small after normalization", () => {
  assert.throws(
    () => dealSecretWords(2, [" 猫 ", "猫", "犬", "鳥"]),
    /CODE_INTERCEPT_WORDS_UNAVAILABLE/,
  );
});

test("secret-card vocabulary excludes words below effective Zipf 4.5", () => {
  assert.deepEqual(codeInterceptWordSelectionBounds, {
    minimumEffectiveZipf: 4.5,
    maximumEffectiveZipf: 6.5,
  });
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

test("simultaneous elimination is won by the team with the smaller negative balance", () => {
  const current = room();
  current.teams[0].points = 2;
  current.teams[1].points = 1;
  current.allyAnswers.blue = [2, 4, 3];
  const finished = finishCodeInterceptRound(current);
  const red = finished.teams.find((team) => team.id === "red")!;
  const blue = finished.teams.find((team) => team.id === "blue")!;
  assert.equal(red.points, -1);
  assert.equal(blue.points, -2);
  assert.equal(finished.winner, "red");
  assert.equal(finished.phase, "game-result");
  assert.equal(finished.roundHistory[0].teams.find((team) => team.teamId === "red")?.totalDamage, 3);
});

test("simultaneous elimination only draws when both negative balances are equal", () => {
  const current = room();
  current.teams[0].points = 2;
  current.teams[1].points = 2;
  current.allyAnswers.blue = [2, 4, 3];
  const finished = finishCodeInterceptRound(current);
  assert.deepEqual(finished.teams.map((team) => team.points), [-1, -1]);
  assert.equal(finished.winner, "draw");
});

test("clue and answer phases use their separate configured timers", () => {
  const current = room();
  current.clueTimeLimitSeconds = 30;
  current.answerTimeLimitSeconds = 60;
  current.phaseStartedAt = 1_000;
  current.phase = "clue";
  assert.equal(isCodeInterceptPhaseExpired(current, 30_999), false);
  assert.equal(isCodeInterceptPhaseExpired(current, 31_000), true);
  current.phase = "answer";
  assert.equal(isCodeInterceptPhaseExpired(current, 60_999), false);
  assert.equal(isCodeInterceptPhaseExpired(current, 61_000), true);
  current.phase = "round-result";
  assert.equal(isCodeInterceptPhaseExpired(current, 100_000), false);
});

test("legacy action timer migrates to both separate timers", () => {
  assert.deepEqual(normalizeCodeInterceptTimeLimits({ actionTimeLimitSeconds: 90 }), {
    clueTimeLimitSeconds: 90,
    answerTimeLimitSeconds: 90,
  });
  assert.deepEqual(normalizeCodeInterceptTimeLimits({ actionTimeLimitSeconds: 90, clueTimeLimitSeconds: 30, answerTimeLimitSeconds: 60 }), {
    clueTimeLimitSeconds: 30,
    answerTimeLimitSeconds: 60,
  });
});

test("phase timeout fills missing input and keeps the round moving", () => {
  const current = room();
  current.clueTimeLimitSeconds = 30;
  current.answerTimeLimitSeconds = 60;
  current.phaseStartedAt = 1_000;
  current.phase = "code-length";
  current.codeLengthMode = "per-round";
  current.codeLengthChoices = {};
  current.roundCodeLengths = {};
  current.secretCodes = {};
  current.clues = {};
  const cluePhase = expireCodeInterceptPhase(current, 31_000);
  assert.equal(cluePhase.phase, "clue");
  assert.deepEqual(cluePhase.roundCodeLengths, { red: 3, blue: 3 });
  assert.equal(cluePhase.secretCodes.red?.length, 3);
  assert.deepEqual(cluePhase.timeoutPenaltyPhases, { red: ["code-length"], blue: ["code-length"] });

  cluePhase.phaseStartedAt = 31_000;
  const answerPhase = expireCodeInterceptPhase(cluePhase, 61_000);
  assert.equal(answerPhase.phase, "answer");
  assert.deepEqual(answerPhase.clues.red, ["時間切れ", "時間切れ", "時間切れ"]);
  assert.deepEqual(answerPhase.timeoutPenaltyPhases, { red: ["code-length", "clue"], blue: ["code-length", "clue"] });

  answerPhase.phaseStartedAt = 61_000;
  answerPhase.allyAnswers = {};
  answerPhase.interceptAnswers = {};
  assert.equal(expireCodeInterceptPhase(answerPhase, 120_999).phase, "answer");
  const result = expireCodeInterceptPhase(answerPhase, 121_000);
  assert.equal(result.phase, "game-result");
  assert.deepEqual(result.teams.map((team) => team.points), [2, -1]);
  assert.deepEqual(result.roundHistory[0].teams.map((team) => team.timeoutDamage), [3, 3]);
  assert.deepEqual(result.roundHistory[0].teams.map((team) => team.miscommunicationDamage), [0, 0]);
});

test("a timeout deducts only the team that did not finish the phase", () => {
  const current = room();
  current.phase = "clue";
  current.clueTimeLimitSeconds = 30;
  current.phaseStartedAt = 1_000;
  current.clues = { red: ["猫", "空", "雨"] };
  const expired = expireCodeInterceptPhase(current, 31_000);
  assert.deepEqual(expired.timeoutPenaltyPhases, { blue: ["clue"] });
});

test("first round does not apply interception damage", () => {
  const current = room();
  current.roundNumber = codeInterceptDefaults.interceptionStartsAtRound - 1;
  const finished = finishCodeInterceptRound(current);
  assert.equal(finished.roundHistory[0].teams.every((team) => team.interceptionDamage === 0), true);
});

test("failed transmission clues stay unknown instead of revealing their card numbers", () => {
  const failed = finishCodeInterceptRound(room());
  const history = codeInterceptClueHistory(failed, "red");
  assert.equal(history.numbered.every((column) => column.clues.length === 0), true);
  assert.deepEqual(history.unknown.map((entry) => entry.clue), ["醤油", "肉球", "傘"]);

  const successfulRoom = room();
  successfulRoom.allyAnswers.red = [3, 1, 4];
  const successful = codeInterceptClueHistory(finishCodeInterceptRound(successfulRoom), "red");
  assert.deepEqual(successful.numbered.map((column) => column.clues.map((entry) => entry.clue)), [["肉球"], [], ["醤油"], ["傘"]]);
  assert.deepEqual(successful.unknown, []);
});

test("sanitization hides enemy secrets and unresolved answers", () => {
  const sanitized = sanitizeCodeInterceptRoomForPlayer(room(), "r2");
  assert.deepEqual(sanitized.teams.find((team) => team.id === "blue")?.secretWords, []);
  assert.equal(sanitized.passphrase, "");
  assert.equal(sanitized.secretCodes.red, undefined);
  assert.equal(sanitized.interceptAnswers.blue, undefined);
  assert.deepEqual(sanitized.interceptAnswers.red, [2, 4, 1]);
});

test("own-team reveal mode hides the enemy correct code and successful ally answer after the round", () => {
  const finished = finishCodeInterceptRound({ ...room(), codeRevealMode: "own-team" });
  const redView = sanitizeCodeInterceptRoomForPlayer(finished, "r2");
  const redResult = redView.roundHistory[0].teams.find((team) => team.teamId === "red")!;
  const blueResult = redView.roundHistory[0].teams.find((team) => team.teamId === "blue")!;
  assert.deepEqual(redResult.secretCode, [3, 1, 4]);
  assert.deepEqual(redResult.allyAnswer, [3, 1, 2]);
  assert.deepEqual(blueResult.secretCode, []);
  assert.equal(blueResult.allyAnswer, null);
  assert.deepEqual(redView.secretCodes.red, [3, 1, 4]);
  assert.equal(redView.secretCodes.blue, undefined);
  assert.deepEqual(redView.teams.find((team) => team.id === "blue")?.secretWords, ["山", "海", "空", "森"]);
});

test("multiple answerers only reach consensus when every proposal matches", () => {
  assert.equal(consensusCodeInterceptAnswer({ r2: [3, 1, 4] }, ["r2", "r3"]), null);
  assert.equal(consensusCodeInterceptAnswer({ r2: [3, 1, 4], r3: [3, 4, 1] }, ["r2", "r3"]), null);
  assert.deepEqual(consensusCodeInterceptAnswer({ r2: [3, 1, 4], r3: [3, 1, 4] }, ["r2", "r3"]), [3, 1, 4]);
});

test("a team can revise its final answer until the opposing team finishes submitting", () => {
  const current = room();
  assert.equal(codeInterceptTeamHasSubmittedAnswers(current, "blue"), true);
  assert.equal(canReviseCodeInterceptAnswers(current, "red"), false);
  delete current.interceptAnswers.blue;
  assert.equal(codeInterceptTeamHasSubmittedAnswers(current, "blue"), false);
  assert.equal(canReviseCodeInterceptAnswers(current, "red"), true);
});

test("breaking multi-answerer consensus reopens the team answer", () => {
  const answers = { red: [3, 1, 4], blue: [2, 4, 1] };
  assert.deepEqual(withCodeInterceptConsensusAnswer(answers, "red", null), { blue: [2, 4, 1] });
  assert.deepEqual(withCodeInterceptConsensusAnswer(answers, "red", [3, 4, 1]), { red: [3, 4, 1], blue: [2, 4, 1] });
});

test("answer proposals are only visible to non-clue-giver teammates", () => {
  const current = room();
  current.players.push({ id: "r3", name: "赤3", joinedAt: Date.now(), teamId: "red" });
  current.allyAnswerProposals = { r2: [3, 1, 4], r3: [3, 4, 1], b2: [2, 4, 1] };
  assert.deepEqual(sanitizeCodeInterceptRoomForPlayer(current, "r2").allyAnswerProposals, { r2: [3, 1, 4], r3: [3, 4, 1] });
  assert.deepEqual(sanitizeCodeInterceptRoomForPlayer(current, "r1").allyAnswerProposals, {});
  assert.deepEqual(sanitizeCodeInterceptRoomForPlayer(current, "b2").allyAnswerProposals, { b2: [2, 4, 1] });
});

test("sanitization exposes team readiness without exposing the enemy answers", () => {
  const current = room();
  delete current.interceptAnswers.blue;
  const redView = sanitizeCodeInterceptRoomForPlayer(current, "r2");
  assert.deepEqual(redView.answerReadyTeamIds, ["red"]);
  assert.equal(redView.allyAnswers.blue, undefined);
  assert.equal(redView.interceptAnswers.blue, undefined);
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
