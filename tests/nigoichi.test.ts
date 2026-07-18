import assert from "node:assert/strict";
import test from "node:test";
import {
  allNigoichiAssociationsSubmitted,
  allNigoichiGuessesSubmitted,
  areValidNigoichiAssociations,
  calculateNigoichiRoundScores,
  correctNigoichiConfig,
  dealNigoichiRound,
  finishNigoichiRound,
  expireNigoichiPhase,
  isNigoichiPhaseExpired,
  isValidNigoichiGuess,
  isValidNigoichiConfig,
  nigoichiConfigBounds,
  nigoichiGuessIsCorrect,
  nigoichiPlayerOwnsCard,
  nigoichiRoomHasSpace,
  nigoichiShareText,
  normalizeNigoichiPlayerCapacity,
  sanitizeNigoichiRoomForPlayer,
  type NigoichiRoom,
} from "../lib/nigoichi.ts";

const players = ["a", "b", "c"].map((id) => ({ id }));
const words = Array.from({ length: 30 }, (_, index) => `単語${index + 1}`);

test("B=P×A+1枚から、重複しない手札と余り1枚を作る", () => {
  const round = dealNigoichiRound(players, words, 2, () => 0.25);
  assert.equal(round.words.length, 7);
  const dealt = Object.values(round.hands).flat();
  assert.equal(dealt.length, 6);
  assert.equal(new Set(dealt).size, 6);
  assert.ok(!dealt.includes(round.missingNumber));
  assert.deepEqual([...dealt, round.missingNumber].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6]);
});

test("P・A・M・Bの境界と上限21枚を検証する", () => {
  assert.deepEqual(nigoichiConfigBounds(2, 5), { minCardsPerPlayer: 10, maxCardsPerPlayer: 10, isFeasible: true });
  assert.equal(isValidNigoichiConfig(2, 10, 5), true);
  assert.equal(isValidNigoichiConfig(3, 6, 3), true);
  assert.equal(isValidNigoichiConfig(4, 4, 2), true);
  assert.equal(isValidNigoichiConfig(5, 2, 1), true);
  assert.equal(isValidNigoichiConfig(3, 7, 3), false);
  assert.equal(isValidNigoichiConfig(4, 3, 2), false);
});

test("PまたはM変更時にAを選択可能範囲へ補正する", () => {
  assert.deepEqual(correctNigoichiConfig(4, 2, 2), { cardsPerPlayer: 4, associationWordCount: 2, totalCards: 17 });
  assert.deepEqual(correctNigoichiConfig(3, 10, 3), { cardsPerPlayer: 6, associationWordCount: 3, totalCards: 19 });
  assert.deepEqual(correctNigoichiConfig(5, 10, 5), { cardsPerPlayer: 4, associationWordCount: 2, totalCards: 21 });
});

test("最大募集人数を2〜6人に補正し、満員を判定する", () => {
  assert.equal(normalizeNigoichiPlayerCapacity(1), 2);
  assert.equal(normalizeNigoichiPlayerCapacity(4), 4);
  assert.equal(normalizeNigoichiPlayerCapacity(9), 6);
  assert.equal(normalizeNigoichiPlayerCapacity(undefined), 6);
  assert.equal(nigoichiRoomHasSpace({ players: players.slice(0, 2), playerCapacity: 3 }), true);
  assert.equal(nigoichiRoomHasSpace({ players, playerCapacity: 3 }), false);
});

test("M個の連想語を要求し、カードとの分類は求めない", () => {
  assert.equal(areValidNigoichiAssociations(["前半", "後半"], 2), true);
  assert.equal(areValidNigoichiAssociations(["五枚全体", "別の見方"], 2), true);
  assert.equal(areValidNigoichiAssociations(["一語だけ"], 2), false);
  assert.equal(areValidNigoichiAssociations(["入力済み", ""], 2), false);
});

test("連想語と予想は全参加者が提出したときだけ完了する", () => {
  assert.equal(allNigoichiAssociationsSubmitted({ players, associations: { a: ["A"], b: ["B"] } }), false);
  assert.equal(allNigoichiAssociationsSubmitted({ players, associations: { a: ["A"], b: ["B"], c: ["C"] } }), true);
  assert.equal(allNigoichiGuessesSubmitted({ players, guesses: { a: 1, b: 2 } }), false);
  assert.equal(allNigoichiGuessesSubmitted({ players, guesses: { a: 1, b: 2, c: 0 } }), true);
});

test("余り番号と同じ予想だけを正解にする", () => {
  const room = { missingNumber: 4, guesses: { a: 4, b: 3 } };
  assert.equal(nigoichiGuessIsCorrect(room, "a"), true);
  assert.equal(nigoichiGuessIsCorrect(room, "b"), false);
});

test("正解点P-1から自分のカードへの被投票数を減点する", () => {
  const scores = calculateNigoichiRoundScores({
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })),
    hands: { a: [0, 1], b: [2, 3], c: [4, 5] },
    guesses: { a: 6, b: 0, c: 2 },
    missingNumber: 6,
    totalScores: { a: 10, b: 5, c: 0 },
  });
  assert.deepEqual(scores, [
    { playerId: "a", isCorrect: true, correctBonus: 2, receivedWrongVotes: 1, roundScore: 1, totalScoreAfterRound: 11 },
    { playerId: "b", isCorrect: false, correctBonus: 0, receivedWrongVotes: 1, roundScore: -1, totalScoreAfterRound: 4 },
    { playerId: "c", isCorrect: false, correctBonus: 0, receivedWrongVotes: 0, roundScore: 0, totalScoreAfterRound: 0 },
  ]);

  const fourPlayers = ["a", "b", "c", "d"].map((id, index) => ({ id, name: id, joinedAt: index }));
  const maximumPenalty = calculateNigoichiRoundScores({
    players: fourPlayers,
    hands: { a: [0, 1], b: [2, 3], c: [4, 5], d: [6, 7] },
    guesses: { a: 8, b: 0, c: 1, d: 0 },
    missingNumber: 8,
    totalScores: { a: 0, b: 0, c: 0, d: 0 },
  });
  assert.deepEqual(maximumPenalty[0], {
    playerId: "a", isCorrect: true, correctBonus: 3, receivedWrongVotes: 3, roundScore: 0, totalScoreAfterRound: 0,
  });
});

test("自分のカードを回答候補から除外し、ラウンド得点とログを確定する", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "guess" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 2, cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal" as const, clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    associations: { a: ["A"], b: ["B"], c: ["C"] }, guesses: { a: 6, b: 0, c: 2 }, missingNumber: 6,
    totalScores: { a: 10, b: 5, c: 0 }, roundScores: {}, roundHistory: [], debugLog: [], createdAt: 100, updatedAt: 200,
  } satisfies NigoichiRoom;
  assert.equal(nigoichiPlayerOwnsCard(room, "a", 0), true);
  assert.equal(nigoichiPlayerOwnsCard(room, "a", 2), false);
  assert.equal(isValidNigoichiGuess(room, "a", 0), false);
  assert.equal(isValidNigoichiGuess(room, "a", 2), true);
  assert.equal(isValidNigoichiGuess(room, "a", 7), false);
  const finished = finishNigoichiRound(room);
  assert.equal(finished.phase, "result");
  assert.equal(finished.roundScores.a.roundScore, 1);
  assert.deepEqual(finished.totalScores, { a: 11, b: 4, c: 0 });
  assert.deepEqual(finished.roundHistory[0].votes, [
    { playerId: "a", selectedCardNumber: 6 },
    { playerId: "b", selectedCardNumber: 0 },
    { playerId: "c", selectedCardNumber: 2 },
  ]);
});

test("共有プレイログへ所有者・手札・連想語を匿名化して記載する", () => {
  const text = nigoichiShareText({
    players: [
      { id: "a", name: "非公開名", joinedAt: 1, shareNameAllowed: false },
      { id: "b", name: "公開名", joinedAt: 2, shareNameAllowed: true },
      { id: "c", name: "ダミー1", joinedAt: 3, isDummy: true },
    ],
    cardsPerPlayer: 2,
    associationWordCount: 1,
    wordDifficulty: "normal",
    words: ["猫", "犬", "鳥", "魚", "花", "月", "星"],
    hands: { a: [0, 1], b: [2, 3], c: [4, 5] },
    associations: { a: ["ペット"], b: ["生き物"], c: ["夜空"] },
    guesses: { a: 6, b: 5, c: 6 },
    missingNumber: 6,
    totalScores: { a: 2, b: 0, c: 1 },
    roundScores: {
      a: { playerId: "a", isCorrect: true, correctBonus: 2, receivedWrongVotes: 0, roundScore: 2, totalScoreAfterRound: 2 },
      b: { playerId: "b", isCorrect: false, correctBonus: 0, receivedWrongVotes: 0, roundScore: 0, totalScoreAfterRound: 0 },
      c: { playerId: "c", isCorrect: true, correctBonus: 2, receivedWrongVotes: 1, roundScore: 1, totalScoreAfterRound: 1 },
    },
  });
  assert.match(text, /2人が余り番号を正解/);
  assert.match(text, /1\. 猫 — PLAYER1/);
  assert.match(text, /3\. 鳥 — 公開名/);
  assert.match(text, /5\. 花 — ダミー1/);
  assert.match(text, /7\. 星 — 余り/);
  assert.match(text, /PLAYER1：1\.猫 ＋ 2\.犬 → ペット/);
  assert.match(text, /公開名：3\.鳥 ＋ 4\.魚 → 生き物/);
  assert.match(text, /正解点\+2・被投票-1・ラウンド\+1・累計1/);
  assert.doesNotMatch(text, /非公開名/);
});

test("結果前は本人の手札と連想だけを返し、余り番号を隠す", () => {
  const room: NigoichiRoom = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "secret", phase: "clue",
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 1, cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal", clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1], b: [2, 3], c: [4, 5] },
    associations: { a: ["自分の語"], b: ["他人の語"] }, guesses: { a: 6, b: 5 }, missingNumber: 6,
    totalScores: { a: 0, b: 0, c: 0 }, roundScores: {}, roundHistory: [],
    debugLog: [{ id: "debug", timestamp: 1, actorName: "a", action: "秘密なし", phaseBefore: "lobby", phaseAfter: "clue", revision: 1 }],
    createdAt: 1, updatedAt: 1,
  };
  const sanitized = sanitizeNigoichiRoomForPlayer(room, "a");
  assert.deepEqual(sanitized.hands, { a: [0, 1] });
  assert.deepEqual(sanitized.associations, { a: ["自分の語"] });
  assert.deepEqual(sanitized.guesses, { a: 6 });
  assert.equal(sanitized.missingNumber, null);
  assert.equal(sanitized.passphrase, "設定済み");
  assert.deepEqual(sanitized.debugLog, []);
});

test("予想中は連想語を全員へ公開する", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "guess" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 1, cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal" as const, clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    associations: { a: ["A"], b: ["B"], c: ["C"] }, guesses: {}, missingNumber: 6, debugLog: [], createdAt: 1, updatedAt: 1,
    totalScores: { a: 0, b: 0, c: 0 }, roundScores: {}, roundHistory: [],
  } satisfies NigoichiRoom;
  const sanitized = sanitizeNigoichiRoomForPlayer(room, "b");
  assert.equal(sanitized.associations.a[0], "A");
  assert.equal(sanitized.missingNumber, null);
});

test("デバッグホストは全手札・連想語・余り番号を確認できる", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "guess" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 1, cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal" as const, clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: true, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    associations: { a: ["A"], b: ["B"], c: ["C"] }, guesses: {}, missingNumber: 6, debugLog: [], createdAt: 1, updatedAt: 1,
    totalScores: { a: 0, b: 0, c: 0 }, roundScores: {}, roundHistory: [],
  } satisfies NigoichiRoom;
  const sanitized = sanitizeNigoichiRoomForPlayer(room, "a");
  assert.deepEqual(sanitized.hands, room.hands);
  assert.deepEqual(sanitized.associations, room.associations);
  assert.equal(sanitized.missingNumber, 6);
});

test("連想語の時間切れは未提出を補い、予想フェーズの時計を開始する", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "clue" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 1, cardsPerPlayer: 2, associationWordCount: 2, wordDifficulty: "normal" as const,
    clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    associations: { a: ["A", "AA"] }, guesses: {}, missingNumber: 6, debugLog: [], createdAt: 1, updatedAt: 1,
    totalScores: { a: 0, b: 0, c: 0 }, roundScores: {}, roundHistory: [],
  } satisfies NigoichiRoom;
  assert.equal(isNigoichiPhaseExpired(room, 60_999), false);
  assert.equal(isNigoichiPhaseExpired(room, 61_000), true);
  const expired = expireNigoichiPhase(room, 61_000);
  assert.equal(expired.phase, "guess");
  assert.equal(expired.phaseStartedAt, 61_000);
  assert.deepEqual(expired.associations.b, ["未提出", "未提出"]);
});

test("予想の時間切れは未回答を不正解としてラウンドを確定する", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "guess" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })), playerCapacity: 3,
    gameNumber: 1, cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal" as const,
    clueTimeLimitSeconds: 60, guessTimeLimitSeconds: 30, phaseStartedAt: 1_000, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    associations: { a: ["A"], b: ["B"], c: ["C"] }, guesses: { a: 6 }, missingNumber: 6, debugLog: [], createdAt: 1, updatedAt: 1,
    totalScores: { a: 0, b: 0, c: 0 }, roundScores: {}, roundHistory: [],
  } satisfies NigoichiRoom;
  const expired = expireNigoichiPhase(room, 31_000);
  assert.equal(expired.phase, "result");
  assert.equal(expired.phaseStartedAt, null);
  assert.equal(expired.roundScores.a.isCorrect, true);
  assert.equal(expired.roundScores.b.isCorrect, false);
  assert.deepEqual(expired.roundHistory[0].votes, [
    { playerId: "a", selectedCardNumber: 6 },
    { playerId: "b", selectedCardNumber: null },
    { playerId: "c", selectedCardNumber: null },
  ]);
});
