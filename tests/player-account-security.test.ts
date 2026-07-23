import assert from "node:assert/strict";
import test from "node:test";
import {
  maskRecoveryEmail,
  playerAccountSecuritySummary,
} from "../lib/player-account-security.ts";
import {
  isValidPlayerPassword,
  playerPasswordChangeError,
} from "../lib/player-password-policy.ts";

test("本人向けの復旧用メール表示はアドレスを識別できる範囲でマスクする", () => {
  assert.equal(maskRecoveryEmail("player@example.com"), "p***@e***.com");
  assert.equal(maskRecoveryEmail("a@b.co.jp"), "a***@b***.co.jp");
  assert.equal(maskRecoveryEmail(null), null);
});

test("復旧用メールの状態とマスク表示を一つの応答へまとめる", () => {
  assert.deepEqual(
    playerAccountSecuritySummary({ email: "player@example.com", emailVerifiedAt: null }),
    {
      recoveryEmailStatus: "unverified",
      recoveryEmailHint: "p***@e***.com",
    },
  );
  assert.deepEqual(
    playerAccountSecuritySummary({ email: "player@example.com", emailVerifiedAt: 100 }),
    {
      recoveryEmailStatus: "verified",
      recoveryEmailHint: "p***@e***.com",
    },
  );
});

test("パスワード変更はログイン本人と現在のパスワードを必須にする", () => {
  const base = {
    accountPlayerId: "player-1",
    authenticatedPlayerId: "player-1",
    currentPasswordValid: true,
    newPassword: "new-password",
    newPasswordMatchesCurrent: false,
  };
  assert.equal(playerPasswordChangeError(base), null);
  assert.equal(
    playerPasswordChangeError({ ...base, authenticatedPlayerId: "player-2" }),
    "PLAYER_ACCOUNT_INVALID_CREDENTIALS",
  );
  assert.equal(
    playerPasswordChangeError({ ...base, currentPasswordValid: false }),
    "PLAYER_ACCOUNT_INVALID_CREDENTIALS",
  );
  assert.equal(
    playerPasswordChangeError({ ...base, newPasswordMatchesCurrent: true }),
    "PLAYER_ACCOUNT_PASSWORD_UNCHANGED",
  );
});

test("新しいパスワードは既存の長さ制約をサーバー側でも適用する", () => {
  assert.equal(isValidPlayerPassword("123"), false);
  assert.equal(isValidPlayerPassword("1234"), true);
  assert.equal(isValidPlayerPassword("x".repeat(128)), true);
  assert.equal(isValidPlayerPassword("x".repeat(129)), false);
});
