"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

type PasskeyResponse = {
  error?: string;
  detail?: string;
  stage?: string;
  verified?: boolean;
  options?: unknown;
};

async function responseJson(response: Response) {
  return await response.json().catch(() => null) as PasskeyResponse | null;
}

function diagnosticError(data: PasskeyResponse | null, fallback: string) {
  const code = data?.error || fallback;
  const context = [data?.stage, data?.detail].filter(Boolean).join(" / ");
  return context ? `${code}\n[${context}]` : code;
}

function isCancelledWebAuthn(error: unknown) {
  return error instanceof Error
    && (error.name === "NotAllowedError" || error.name === "AbortError");
}

async function useRecoveryCodeForStepUp() {
  const accepted = window.confirm(
    "パスキー認証を完了できませんでした。復旧コードを使って本人確認しますか？\n復旧コードは使用すると無効になります。",
  );
  if (!accepted) throw new Error("ADMIN_STEP_UP_CANCELLED");

  const recoveryCode = window.prompt("未使用の復旧コードを入力してください。")?.trim();
  if (!recoveryCode) throw new Error("ADMIN_STEP_UP_CANCELLED");

  const response = await fetch("/api/admin/passkeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "use-recovery-code", recoveryCode }),
  });
  const data = await responseJson(response);
  if (!response.ok || !data?.verified) {
    throw new Error(diagnosticError(data, "ADMIN_RECOVERY_CODE_STEP_UP_FAILED"));
  }
}

export async function ensureSiteAdminStepUp() {
  const begin = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-step-up" }),
  });
  const beginData = await responseJson(begin);
  if (!begin.ok) throw new Error(diagnosticError(beginData, "ADMIN_STEP_UP_FAILED"));
  if (beginData?.verified) return;
  if (!beginData?.options) throw new Error(diagnosticError(beginData, "ADMIN_STEP_UP_FAILED"));

  let credential;
  try {
    credential = await startAuthentication({
      optionsJSON: beginData.options as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (error) {
    if (!isCancelledWebAuthn(error)) throw error;
    await useRecoveryCodeForStepUp();
    return;
  }

  const verify = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-authentication", response: credential }),
  });
  const verifyData = await responseJson(verify);
  if (!verify.ok || !verifyData?.verified) throw new Error(diagnosticError(verifyData, "ADMIN_STEP_UP_FAILED"));
}

export async function addSiteAdminPasskey() {
  await ensureSiteAdminStepUp();
  const begin = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-add-passkey" }),
  });
  const beginData = await responseJson(begin);
  if (!begin.ok || !beginData?.options) throw new Error(diagnosticError(beginData, "SITE_ADMIN_PASSKEY_ADD_FAILED"));
  const credential = await startRegistration({ optionsJSON: beginData.options as PublicKeyCredentialCreationOptionsJSON });
  const verify = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-registration", response: credential }),
  });
  const verifyData = await responseJson(verify);
  if (!verify.ok || !verifyData?.verified) throw new Error(diagnosticError(verifyData, "SITE_ADMIN_PASSKEY_ADD_FAILED"));
}
