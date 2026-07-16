"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

async function responseJson(response: Response) {
  return await response.json().catch(() => null) as { error?: string; verified?: boolean; options?: unknown } | null;
}

export async function ensureSiteAdminStepUp() {
  const begin = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-step-up" }),
  });
  const beginData = await responseJson(begin);
  if (!begin.ok) throw new Error(beginData?.error || "ADMIN_STEP_UP_FAILED");
  if (beginData?.verified) return;
  if (!beginData?.options) throw new Error("ADMIN_STEP_UP_FAILED");
  const credential = await startAuthentication({ optionsJSON: beginData.options as PublicKeyCredentialRequestOptionsJSON });
  const verify = await fetch("/api/admin/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-authentication", response: credential }),
  });
  const verifyData = await responseJson(verify);
  if (!verify.ok || !verifyData?.verified) throw new Error(verifyData?.error || "ADMIN_STEP_UP_FAILED");
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
