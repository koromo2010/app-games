import assert from "node:assert/strict";
import test from "node:test";
import {
  allNigoichiCluesSubmitted,
  allNigoichiGuessesSubmitted,
  dealNigoichiRound,
  nigoichiGuessIsCorrect,
  nigoichiShareText,
  sanitizeNigoichiRoomForPlayer,
  type NigoichiRoom,
} from "../lib/nigoichi.ts";

const players = ["a", "b", "c"].map((id) => ({ id }));
const words = Array.from({ length: 20 }, (_, index) => `単語${index + 1}`);

test("人数の2倍+1語から、重複しない2番号と余り1番号を作る", () => {
  const round = dealNigoichiRound(players, words, () => 0.25);
  assert.equal(round.words.length, 7);
  const dealt = Object.values(round.hands).flat();
  assert.equal(dealt.length, 6);
  assert.equal(new Set(dealt).size, 6);
  assert.ok(!dealt.includes(round.missingNumber));
  assert.deepEqual([...dealt, round.missingNumber].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6]);
});

test("連想語と予想は全参加者が提出したときだけ完了する", () => {
  assert.equal(allNigoichiCluesSubmitted({ players, clues: { a: "A", b: "B" } }), false);
  assert.equal(allNigoichiCluesSubmitted({ players, clues: { a: "A", b: "B", c: "C" } }), true);
  assert.equal(allNigoichiGuessesSubmitted({ players, guesses: { a: 1, b: 2 } }), false);
  assert.equal(allNigoichiGuessesSubmitted({ players, guesses: { a: 1, b: 2, c: 0 } }), true);
});

test("余り番号と同じ予想だけを正解にする", () => {
  const room = { missingNumber: 4, guesses: { a: 4, b: 3 } };
  assert.equal(nigoichiGuessIsCorrect(room, "a"), true);
  assert.equal(nigoichiGuessIsCorrect(room, "b"), false);
});

test("共有プレイログへ言葉の持ち主と各人の連想語を匿名化して記載する", () => {
  const text = nigoichiShareText({
    players: [
      { id: "a", name: "非公開名", joinedAt: 1, shareNameAllowed: false },
      { id: "b", name: "公開名", joinedAt: 2, shareNameAllowed: true },
      { id: "c", name: "ダミー1", joinedAt: 3, isDummy: true },
    ],
    words: ["猫", "犬", "鳥", "魚", "花", "月", "星"],
    hands: { a: [0, 1], b: [2, 3], c: [4, 5] },
    clues: { a: "ペット", b: "生き物", c: "夜空" },
    guesses: { a: 6, b: 5, c: 6 },
    missingNumber: 6,
  });
  assert.match(text, /2人が余り番号を正解/);
  assert.match(text, /1\. 猫 — PLAYER1/);
  assert.match(text, /3\. 鳥 — 公開名/);
  assert.match(text, /5\. 花 — ダミー1/);
  assert.match(text, /7\. 星 — 余り/);
  assert.match(text, /PLAYER1：1\.猫 ＋ 2\.犬 → ペット/);
  assert.match(text, /公開名：3\.鳥 ＋ 4\.魚 → 生き物/);
  assert.doesNotMatch(text, /非公開名/);
});

test("結果前は本人の手札と入力だけを返し、余り番号を隠す", () => {
  const room: NigoichiRoom = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "secret", phase: "clue",
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })),
    gameNumber: 1, debugMode: false, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1], b: [2, 3], c: [4, 5] },
    clues: { a: "自分の語", b: "他人の語" }, guesses: { a: 6, b: 5 }, missingNumber: 6,
    debugLog: [{ id: "debug", timestamp: 1, actorName: "a", action: "秘密なし", phaseBefore: "lobby", phaseAfter: "clue", revision: 1 }],
    createdAt: 1, updatedAt: 1,
  };
  const sanitized = sanitizeNigoichiRoomForPlayer(room, "a");
  assert.deepEqual(sanitized.hands, { a: [0, 1] });
  assert.deepEqual(sanitized.clues, { a: "自分の語" });
  assert.deepEqual(sanitized.guesses, { a: 6 });
  assert.equal(sanitized.missingNumber, null);
  assert.equal(sanitized.passphrase, "設定済み");
  assert.deepEqual(sanitized.debugLog, []);
});

test("デバッグホストは全手札と余り番号を確認できる", () => {
  const room = {
    code: "AB12", revision: 1, hostId: "a", passphrase: "", phase: "guess" as const,
    players: players.map((player, index) => ({ ...player, name: player.id, joinedAt: index })),
    gameNumber: 1, debugMode: true, debugReplayEnabled: false,
    words: words.slice(0, 7), hands: { a: [0, 1] as const, b: [2, 3] as const, c: [4, 5] as const },
    clues: { a: "A", b: "B", c: "C" }, guesses: {}, missingNumber: 6, debugLog: [], createdAt: 1, updatedAt: 1,
  } satisfies NigoichiRoom;
  const sanitized = sanitizeNigoichiRoomForPlayer(room, "a");
  assert.deepEqual(sanitized.hands, room.hands);
  assert.equal(sanitized.missingNumber, 6);
});
