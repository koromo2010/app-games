import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidKotobaSenpukuWord,
  isFullyRevealedKotobaSenpukuWord,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  maskKotobaSenpukuWord,
  normalizeKotobaSenpukuWord,
  nextKotobaSenpukuSurvivorIndex,
  resolveKotobaSenpukuWinnerIds,
} from "../lib/kotoba-senpuku.ts";

test("ことばソナーは長音符を独立したスキャン候補として隠す", () => {
  assert.ok(kotobaSenpukuKana.includes("ー"));
  assert.equal(maskKotobaSenpukuWord("すーぷ", []), "");
  assert.equal(maskKotobaSenpukuWord("すーぷ", ["ー"]), "ー");
});

test("ことばソナーは濁点・半濁点・小書きかなを同じ文字群にまとめる", () => {
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

test("ことばソナーの秘密語はカタカナと長音を正規化・検証できる", () => {
  assert.equal(normalizeKotobaSenpukuWord(" スープ "), "すーぷ");
  assert.equal(isValidKotobaSenpukuWord("スープ"), true);
  assert.equal(isValidKotobaSenpukuWord("ーー"), false);
  assert.equal(isValidKotobaSenpukuWord("あ"), false);
  assert.equal(isValidKotobaSenpukuWord("ことば123"), false);
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
