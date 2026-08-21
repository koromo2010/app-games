"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

type PasskeyResponse = {
  error?: string;
  verified?: boolean;
  options?: unknown;
  totpAvailable?: boolean;
  session?: SiteAdminPublicSession;
};

export type SiteAdminPublicSession = {
  scope: "full" | "recovery";
  method: "passkey" | "totp" | "recovery-code" | "master";
  email: string | null;
  expiresAt: number;
  mfaAt: number | null;
};

async function responseJson(response: Response) {
  return await response.json().catch(() => null) as PasskeyResponse | null;
}

function isCancelledWebAuthn(error: unknown) {
  return error instanceof Error
    && (error.name === "NotAllowedError" || error.name === "AbortError");
}

async function completeStepUpWithRecoveryCode() {
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
    throw new Error(data?.error || "ADMIN_RECOVERY_CODE_STEP_UP_FAILED");
  }
  if (!data.session || data.session.scope !== "full" || data.session.method !== "recovery-code") {
    throw new Error("ADMIN_RECOVERY_CODE_STEP_UP_FAILED");
  }
  return data.session;
}

async function completeStepUpWithTotp() {
  const accepted = window.confirm(
    "Authenticatorアプリの6桁コードで本人確認しますか？",
  );
  if (!accepted) throw new Error("ADMIN_STEP_UP_CANCELLED");

  const totpCode = window.prompt("Authenticatorに表示された6桁コードを入力してください。")?.replace(/\D/g, "");
  if (!totpCode || !/^\d{6}$/.test(totpCode)) throw new Error("ADMIN_STEP_UP_CANCELLED");

  const response = await fetch("/api/admin/passkeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify-totp", totpCode }),
  });
  const data = await responseJson(response);
  if (!response.ok || !data?.verified || !data.session || data.session.scope !== "full" || data.session.method !== "totp") {
    throw new Error(data?.error || "ADMIN_TOTP_STEP_UP_FAILED");
  }
  return data.session;
}

export async function ensureSiteAdminStepUp() {
  const begin = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-step-up" }),
  });
  const beginData = await responseJson(begin);
  if (!begin.ok) throw new Error(beginData?.error || "ADMIN_STEP_UP_FAILED");
  if (beginData?.verified) return null;
  if (!beginData?.options && !beginData?.totpAvailable) throw new Error("ADMIN_STEP_UP_FAILED");

  if (beginData.options) {
    let credential;
    try {
      credential = await startAuthentication({
        optionsJSON: beginData.options as PublicKeyCredentialRequestOptionsJSON,
      });
    } catch (error) {
      if (!isCancelledWebAuthn(error)) throw error;
      if (beginData.totpAvailable) {
        try { return await completeStepUpWithTotp(); }
        catch (totpError) {
          if (!(totpError instanceof Error) || totpError.message !== "ADMIN_STEP_UP_CANCELLED") throw totpError;
        }
      }
      return await completeStepUpWithRecoveryCode();
    }

    const verify = await fetch("/api/admin/passkeys", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-authentication", response: credential }),
    });
    const verifyData = await responseJson(verify);
    if (!verify.ok || !verifyData?.verified) throw new Error(verifyData?.error || "ADMIN_STEP_UP_FAILED");
    return verifyData.session ?? null;
  }
  return await completeStepUpWithTotp();
}

export async function addSiteAdminPasskey() {
  await ensureSiteAdminStepUp();
  const begin = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-add-passkey" }),
  });
  const beginData = await responseJson(begin);
  if (!begin.ok || !beginData?.options) throw new Error(beginData?.error || "SITE_ADMIN_PASSKEY_ADD_FAILED");
  const credential = await startRegistration({ optionsJSON: beginData.options as PublicKeyCredentialCreationOptionsJSON });
  const verify = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-registration", response: credential }),
  });
  const verifyData = await responseJson(verify);
  if (!verify.ok || !verifyData?.verified) throw new Error(verifyData?.error || "SITE_ADMIN_PASSKEY_ADD_FAILED");
}
