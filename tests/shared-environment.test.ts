import assert from "node:assert/strict";
import test from "node:test";
import { sharedEnvironmentVariable } from "../lib/shared-environment.ts";

test("Shared変数を旧Project変数より優先する", () => {
  assert.equal(sharedEnvironmentVariable("OPENAI_API_KEY", {
    SHARED_OPENAI_API_KEY: " shared-key ",
    OPENAI_API_KEY: "legacy-key",
  }), "shared-key");
});

test("6個のShared変数名を対応する旧名へ割り当てる", () => {
  const names = [
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "RESEND_API_KEY",
    "VOCABULARY_DATABASE_URL",
    "VOCABULARY_ADMIN_DATABASE_URL",
  ] as const;
  const env = Object.fromEntries(names.map((name) => [`SHARED_${name}`, `shared:${name}`]));
  for (const name of names) {
    assert.equal(sharedEnvironmentVariable(name, env), `shared:${name}`);
  }
});

test("Shared変数が未設定なら旧Project変数へフォールバックする", () => {
  assert.equal(sharedEnvironmentVariable("RESEND_API_KEY", {
    RESEND_API_KEY: " legacy-key ",
  }), "legacy-key");
});

test("Shared・旧Project変数がともに未設定ならundefinedを返す", () => {
  assert.equal(sharedEnvironmentVariable("VOCABULARY_DATABASE_URL", {}), undefined);
});
