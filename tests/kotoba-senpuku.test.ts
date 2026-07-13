import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidKotobaSenpukuWord,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  maskKotobaSenpukuWord,
  normalizeKotobaSenpukuWord,
} from "../lib/kotoba-senpuku.ts";

test("ことばソナーは長音符を独立したスキャン候補として隠す", () => {
  assert.ok(kotobaSenpukuKana.includes("ー"));
  assert.equal(maskKotobaSenpukuWord("すーぷ", []), "●●●");
  assert.equal(maskKotobaSenpukuWord("すーぷ", ["ー"]), "●ー●");
});

test("ことばソナーは濁点・半濁点・小書きかなを同じ文字群にまとめる", () => {
  assert.equal(kotobaSenpukuKanaKey("が"), "か");
  assert.equal(kotobaSenpukuKanaKey("ぷ"), "ふ");
  assert.equal(kotobaSenpukuKanaKey("ゃ"), "や");
  assert.equal(maskKotobaSenpukuWord("きゃく", ["や"]), "●ゃ●");
});

test("ことばソナーの秘密語はカタカナと長音を正規化・検証できる", () => {
  assert.equal(normalizeKotobaSenpukuWord(" スープ "), "すーぷ");
  assert.equal(isValidKotobaSenpukuWord("スープ"), true);
  assert.equal(isValidKotobaSenpukuWord("ーー"), false);
  assert.equal(isValidKotobaSenpukuWord("あ"), false);
  assert.equal(isValidKotobaSenpukuWord("ことば123"), false);
});
