import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEmailProviderError,
  isEmailDeliveryError,
} from "../lib/email-delivery-error.ts";

test("メール送信サービスの認証失敗を安全なエラーコードへ分類する", () => {
  assert.equal(classifyEmailProviderError({ name: "invalid_api_key" }), "EMAIL_PROVIDER_AUTH_FAILED");
  assert.equal(classifyEmailProviderError({ name: "restricted_api_key" }), "EMAIL_PROVIDER_AUTH_FAILED");
});

test("未確認送信元とテスト送信先制限をプロバイダー本文を露出せず分類する", () => {
  assert.equal(
    classifyEmailProviderError({
      name: "validation_error",
      message: "The example.com domain is not verified.",
    }),
    "EMAIL_SENDER_NOT_VERIFIED",
  );
  assert.equal(
    classifyEmailProviderError({
      name: "validation_error",
      message: "You can only send testing emails to your own email address.",
    }),
    "EMAIL_RECIPIENT_RESTRICTED",
  );
});

test("送信枠と一時的なレート制限を区別する", () => {
  assert.equal(classifyEmailProviderError({ name: "daily_quota_exceeded" }), "EMAIL_DELIVERY_QUOTA_EXCEEDED");
  assert.equal(classifyEmailProviderError({ name: "rate_limit_exceeded" }), "EMAIL_DELIVERY_RATE_LIMITED");
  assert.equal(classifyEmailProviderError({ name: "application_error" }), "EMAIL_SEND_FAILED");
  assert.equal(isEmailDeliveryError(new Error("EMAIL_SENDER_NOT_VERIFIED")), true);
  assert.equal(isEmailDeliveryError(new Error("PLAYER_ACCOUNT_INVALID_CREDENTIALS")), false);
});
