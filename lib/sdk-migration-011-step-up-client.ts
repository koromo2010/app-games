export type SdkMigration011StepUpFailureCode =
  | "INVALID_TOTP_FORMAT"
  | "ADMIN_AUTH_REQUIRED"
  | "ADMIN_FULL_AUTH_REQUIRED"
  | "ADMIN_STEP_UP_REQUIRED"
  | "SITE_ADMIN_TOTP_UNAVAILABLE"
  | "SITE_ADMIN_CHALLENGE_EXPIRED"
  | "INVALID_TOTP_CODE"
  | "RATE_LIMITED"
  | "INVALID_RESPONSE"
  | "TRANSPORT_FAILED";

export type SdkMigration011StepUpResult =
  | { kind: "verified" }
  | { kind: "failed"; code: SdkMigration011StepUpFailureCode };

const exposedFailureCodes = new Set<SdkMigration011StepUpFailureCode>([
  "ADMIN_AUTH_REQUIRED",
  "ADMIN_FULL_AUTH_REQUIRED",
  "ADMIN_STEP_UP_REQUIRED",
  "SITE_ADMIN_TOTP_UNAVAILABLE",
  "SITE_ADMIN_CHALLENGE_EXPIRED",
  "INVALID_TOTP_CODE",
  "RATE_LIMITED",
]);

async function readRecord(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function failedFromPayload(payload: Record<string, unknown> | null): SdkMigration011StepUpResult {
  const code = payload?.error;
  return typeof code === "string" && exposedFailureCodes.has(code as SdkMigration011StepUpFailureCode)
    ? { kind: "failed", code: code as SdkMigration011StepUpFailureCode }
    : { kind: "failed", code: "INVALID_RESPONSE" };
}

export async function performSdkMigration011TotpStepUp(
  totpCode: string,
  fetcher: typeof fetch = fetch,
): Promise<SdkMigration011StepUpResult> {
  if (!/^\d{6}$/.test(totpCode)) return { kind: "failed", code: "INVALID_TOTP_FORMAT" };

  try {
    const beginResponse = await fetcher("/api/admin/passkeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "begin-totp-step-up" }),
    });
    const begin = await readRecord(beginResponse);
    if (!beginResponse.ok) return failedFromPayload(begin);
    if (begin?.verified === true && Object.keys(begin).length === 1) return { kind: "verified" };
    if (
      begin?.verified !== false
      || begin.totpAvailable !== true
      || Object.keys(begin).length !== 2
    ) return { kind: "failed", code: "INVALID_RESPONSE" };

    const verifyResponse = await fetcher("/api/admin/passkeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify-totp", totpCode }),
    });
    const verified = await readRecord(verifyResponse);
    if (!verifyResponse.ok) return failedFromPayload(verified);
    const session = verified?.session;
    if (
      verified?.verified !== true
      || !session
      || typeof session !== "object"
      || Array.isArray(session)
      || (session as Record<string, unknown>).scope !== "full"
      || typeof (session as Record<string, unknown>).mfaAt !== "number"
      || Object.keys(verified).length !== 2
    ) return { kind: "failed", code: "INVALID_RESPONSE" };
    return { kind: "verified" };
  } catch {
    return { kind: "failed", code: "TRANSPORT_FAILED" };
  }
}
