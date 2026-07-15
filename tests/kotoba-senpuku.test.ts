import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidKotobaSenpukuWord,
  isFullyRevealedKotobaSenpukuWord,
  kotobaSenpukuChallengeLogMessage,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  maskKotobaSenpukuWord,
  minimumKotobaSenpukuWordLength,
  normalizeKotobaSenpukuWord,
  normalizeKotobaSenpukuConfig,
  kotobaSenpukuThemes,
  nextKotobaSenpukuSurvivorIndex,
  resolveKotobaSenpukuWinnerIds,
} from "../lib/kotoba-senpuku.ts";

test("ワードソナーは長音符を独立したスキャン候補として隠す", () => {
  assert.ok(kotobaSenpukuKana.includes("ー"));
  assert.equal(maskKotobaSenpukuWord("すーぷ", []), "");
  assert.equal(maskKotobaSenpukuWord("すーぷ", ["ー"]), "ー");
});

test("ワードソナーは濁点・半濁点・小書きかなを同じ文字群にまとめる", () => {
  assert.equal(kotobaSenpukuKanaKey("が"), "か");
  assert.equal(kotobaSenpukuKanaKey("ぷ"), "ふ");
  assert.equal(kotobaSenpukuKanaKey("ゃ"), "や");
  assert.equal(maskKotobaSenpukuWord("きゃく", ["や"]), "ゃ");
});

test("公開文字は語順どおり左詰めで、重複文字もすべて表示する", () => {
  assert.equal(maskKotobaSenpukuWord("おむらいす", ["ら"]), "ら");
  assert.equal(maskKotobaSenpukuWord("おむらいす", ["ら", "む", "す", "い"]), "むらいす");
  assert.equal(maskKotobaSenpukuWord("ばなな", ["な"]), "なな");
  assert.equal(isFullyRevealedKotobaSenpukuWord("ばなな", ["は", "な"]), true);
  assert.equal(isFullyRevealedKotobaSenpukuWord("ばなな", ["な"]), false);
});

test("ワードソナーの秘密語はひらがなだけを受け付け、カタカナを変換しない", () => {
  assert.equal(normalizeKotobaSenpukuWord(" スープ "), "スープ");
  assert.equal(isValidKotobaSenpukuWord("スープ"), false);
  assert.equal(isValidKotobaSenpukuWord("すーぷ"), true);
  assert.equal(isValidKotobaSenpukuWord("ーー"), false);
  assert.equal(isValidKotobaSenpukuWord("あ"), true);
  assert.equal(isValidKotobaSenpukuWord("とてもながいひみつのことばでももじすうせいげんはない"), true);
  assert.equal(isValidKotobaSenpukuWord("ことば123"), false);
});

test("ワードソナーの秘密語は通常プレイを妨げない技術上限で保護する", () => {
  assert.equal(isValidKotobaSenpukuWord("あ".repeat(100)), true);
  assert.equal(isValidKotobaSenpukuWord("あ".repeat(101)), false);
});

test("ワードソナーのお題候補を十分な種類から選べる", () => {
  assert.ok(kotobaSenpukuThemes.length >= 40);
  assert.equal(new Set(kotobaSenpukuThemes.map((theme) => theme.id)).size, kotobaSenpukuThemes.length);
});

test("2人対戦だけ秘密語を2文字以上にする", () => {
  assert.equal(minimumKotobaSenpukuWordLength(2), 2);
  assert.equal(minimumKotobaSenpukuWordLength(3), 1);
  assert.equal(minimumKotobaSenpukuWordLength(10), 1);
});

test("連続探知・秘密語回答・回答ログ・最初の手番を部屋ごとに設定できる", () => {
  assert.deepEqual(
    normalizeKotobaSenpukuConfig({ continuousScan: false, allowWordGuess: false, showWordGuessInLog: false, randomFirstTurn: false }),
    { roundsTotal: 1, secretTimeLimitSeconds: 0, turnTimeLimitSeconds: 0, debugMode: false, continuousScan: false, allowWordGuess: false, showWordGuessInLog: false, randomFirstTurn: false },
  );
});

test("直接回答ログは設定に応じて回答語を表示または非表示にする", () => {
  const visible = kotobaSenpukuChallengeLogMessage({ actorName: "赤", targetName: "青", guess: "すいか", correct: false, showGuess: true });
  const hidden = kotobaSenpukuChallengeLogMessage({ actorName: "赤", targetName: "青", guess: "すいか", correct: false, showGuess: false });
  assert.match(visible, /すいか/);
  assert.doesNotMatch(hidden, /すいか/);
  assert.match(hidden, /不正解/);
});

test("脱落者の手番を飛ばして次の生存者へ進む", () => {
  assert.equal(nextKotobaSenpukuSurvivorIndex(["a", "b", "c", "d"], ["b", "c"], 0), 3);
  assert.equal(nextKotobaSenpukuSurvivorIndex(["a", "b", "c", "d"], ["a", "d"], 2), 1);
});

test("同時全滅では最短の秘密語を勝者にし、同じ長さなら同率にする", () => {
  const secrets = { a: "ねこ", b: "たぬき", c: "きつね" };
  assert.deepEqual(resolveKotobaSenpukuWinnerIds(["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"], secrets), ["a"]);
  assert.deepEqual(resolveKotobaSenpukuWinnerIds(["a", "b", "c"], ["a", "b", "c"], ["b", "c"], secrets), ["b", "c"]);
  assert.deepEqual(resolveKotobaSenpukuWinnerIds(["a", "b", "c"], ["a", "b"], ["a", "b"], secrets), ["c"]);
});
