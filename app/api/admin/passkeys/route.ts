import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import {
  clearSiteAdminChallengeCookie,
  publicSiteAdminSession,
  readSiteAdminChallenge,
  refreshSiteAdminMfaCookie,
  requireFullSiteAdminSession,
  setSiteAdminChallengeCookie,
  setSiteAdminCookie,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { isRecentSiteAdminMfa, siteAdminSessionMaxAgeSeconds, type SiteAdminSessionPayload } from "@/lib/site-admin-auth-core";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { siteAdminAuthenticationOptions, siteAdminRegistrationOptions, verifySiteAdminAuthentication, verifySiteAdminRegistration } from "@/lib/site-admin-passkey";
import {
  appendSiteAdminAuditLog,
  consumeSiteAdminRecoveryCode,
  removeIncompatibleSiteAdminPasskeys,
  replaceSiteAdminRecoveryCodes,
  saveSiteAdminPasskey,
  updateSiteAdminPasskeyCounter,
} from "@/lib/site-admin-passkey-store";
import {
  beginSiteAdminTotpEnrollment,
  cancelSiteAdminTotpEnrollment,
  confirmSiteAdminTotpEnrollment,
  consumeSiteAdminTotpCode,
  resetSiteAdminTotp,
  siteAdminTotpStatus,
} from "@/lib/site-admin-totp-store";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  const code = error instanceof Error ? error.message : "SITE_ADMIN_PASSKEY_FAILED";
  if (code === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") return Response.json({ error: code }, { status: 503 });
  if (code === "SITE_ADMIN_PASSKEY_LIMIT_REACHED") return Response.json({ error: code }, { status: 409 });
  if (code === "SITE_ADMIN_PLATFORM_PASSKEY_REQUIRED") return Response.json({ error: code }, { status: 400 });
  if (code === "SITE_ADMIN_CHALLENGE_INVALID") return Response.json({ error: "SITE_ADMIN_CHALLENGE_EXPIRED" }, { status: 400 });
  if (code === "SITE_ADMIN_PASSKEY_NOT_FOUND") return Response.json({ error: "SITE_ADMIN_PASSKEY_VERIFICATION_FAILED" }, { status: 400 });
  if (code === "SITE_ADMIN_TOTP_ALREADY_ENROLLED") return Response.json({ error: code }, { status: 409 });
  if (code === "SITE_ADMIN_TOTP_UNAVAILABLE") return Response.json({ error: code }, { status: 503 });
  if (code === "SITE_ADMIN_TOTP_SECRET_UNAVAILABLE" || code === "SITE_ADMIN_TOTP_ENCRYPTION_NOT_CONFIGURED") return Response.json({ error: "SITE_ADMIN_TOTP_UNAVAILABLE" }, { status: 503 });
  return Response.json({ error: "SITE_ADMIN_PASSKEY_VERIFICATION_FAILED" }, { status: 400 });
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/passkeys", { operation: "site-admin-passkey" });
  try {
    const body = await request.json() as { action?: unknown; response?: unknown; recoveryCode?: unknown; totpCode?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.adminAuth, { identity: action });
    if (limited) return limited;

    if (action === "begin-totp-step-up") {
      const session = await requireFullSiteAdminSession();
      if (isRecentSiteAdminMfa(session)) return privateJson({ verified: true });
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const totp = await siteAdminTotpStatus(session.email);
      if (!totp.enabled) throw new Error("SITE_ADMIN_TOTP_UNAVAILABLE");
      await setSiteAdminChallengeCookie({
        email: session.email,
        purpose: "step-up",
        challenge: randomBytes(24).toString("base64url"),
      });
      return privateJson({ verified: false, totpAvailable: true });
    }

    if (action === "begin-step-up") {
      const session = await requireFullSiteAdminSession();
      if (isRecentSiteAdminMfa(session)) return Response.json({ verified: true });
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const [options, totp] = await Promise.all([
        siteAdminAuthenticationOptions(session.email),
        siteAdminTotpStatus(session.email),
      ]);
      if (!options && !totp.enabled) throw new Error("SITE_ADMIN_PASSKEY_NOT_FOUND");
      await setSiteAdminChallengeCookie({
        email: session.email,
        purpose: "step-up",
        challenge: options?.challenge ?? randomBytes(24).toString("base64url"),
      });
      return privateJson({ verified: false, ...(options ? { options } : {}), totpAvailable: totp.enabled });
    }

    if (action === "begin-add-passkey") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const options = await siteAdminRegistrationOptions(session.email);
      await setSiteAdminChallengeCookie({ email: session.email, purpose: "add-passkey", challenge: options.challenge });
      return Response.json({ options });
    }

    if (action === "regenerate-recovery-codes") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const recoveryCodes = await replaceSiteAdminRecoveryCodes(session.email);
      await appendSiteAdminAuditLog(request, session, "admin.recovery-codes-regenerate", session.email);
      return Response.json({ recoveryCodes });
    }

    if (action === "remove-incompatible-passkeys") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const removedCount = await removeIncompatibleSiteAdminPasskeys(session.email);
      await appendSiteAdminAuditLog(
        request,
        session,
        "admin.incompatible-passkeys-remove",
        session.email,
        undefined,
        { removedCount },
      );
      return Response.json({ removedCount });
    }

    if (action === "begin-totp-enrollment") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const enrollment = await beginSiteAdminTotpEnrollment(session.email);
      await setSiteAdminChallengeCookie({ email: session.email, purpose: "enroll-totp", challenge: enrollment.challenge });
      await appendSiteAdminAuditLog(request, session, "admin.totp-enrollment-start", session.email);
      return privateJson({ enrollment: { secret: enrollment.secret, provisioningUri: enrollment.provisioningUri } });
    }

    if (action === "cancel-totp-enrollment") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const cancelled = await cancelSiteAdminTotpEnrollment(session.email);
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, "admin.totp-enrollment-cancel", session.email, undefined, { cancelled });
      return privateJson({ cancelled });
    }

    if (action === "reset-totp") {
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const reset = await resetSiteAdminTotp(session.email);
      await appendSiteAdminAuditLog(request, session, "admin.totp-reset", session.email, undefined, { reset });
      return privateJson({ reset });
    }

    const challenge = await readSiteAdminChallenge();
    if (!challenge) throw new Error("SITE_ADMIN_CHALLENGE_INVALID");

    if (action === "verify-authentication") {
      if (challenge.purpose !== "login" && challenge.purpose !== "step-up") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      const response = body.response as AuthenticationResponseJSON;
      const { verification, passkey } = await verifySiteAdminAuthentication(response, challenge.challenge, challenge.email);
      if (!verification.verified) throw new Error("SITE_ADMIN_PASSKEY_VERIFICATION_FAILED");
      await updateSiteAdminPasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);
      const now = Date.now();
      let session: SiteAdminSessionPayload;
      if (challenge.purpose === "login") {
        await setSiteAdminCookie({ scope: "full", method: "passkey", email: challenge.email });
        session = { version: 2, scope: "full", method: "passkey", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      } else {
        const current = await requireFullSiteAdminSession();
        await refreshSiteAdminMfaCookie();
        session = { ...current, mfaAt: now };
      }
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "login" ? "admin.passkey-login" : "admin.step-up", "site-admin");
      telemetry.success("auth.access", { action: challenge.purpose });
      return Response.json({ verified: true, session: publicSiteAdminSession(session) });
    }

    if (action === "verify-registration") {
      if (challenge.purpose !== "enroll" && challenge.purpose !== "add-passkey") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      if (challenge.purpose === "add-passkey") {
        const session = await requireFullSiteAdminSession();
        if (session.email !== challenge.email || !isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      }
      const verification = await verifySiteAdminRegistration(body.response as RegistrationResponseJSON, challenge.challenge);
      if (!verification.verified) throw new Error("SITE_ADMIN_PASSKEY_VERIFICATION_FAILED");
      const info = verification.registrationInfo;
      await saveSiteAdminPasskey({ email: challenge.email, credential: info.credential, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp });
      const recoveryCodes = challenge.purpose === "enroll" ? await replaceSiteAdminRecoveryCodes(challenge.email) : undefined;
      const now = Date.now();
      let session: SiteAdminSessionPayload;
      if (challenge.purpose === "enroll") {
        await setSiteAdminCookie({ scope: "full", method: "passkey", email: challenge.email });
        session = { version: 2, scope: "full", method: "passkey", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      } else {
        const current = await requireFullSiteAdminSession();
        if (current.method === "recovery-code") {
          await setSiteAdminCookie({ scope: "full", method: "passkey", email: challenge.email });
          session = { version: 2, scope: "full", method: "passkey", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
        } else {
          session = current;
        }
      }
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "enroll" ? "admin.passkey-enroll" : "admin.passkey-add", challenge.email);
      telemetry.success("auth.access", { action: challenge.purpose });
      return Response.json({ verified: true, session: publicSiteAdminSession(session), ...(recoveryCodes ? { recoveryCodes } : {}) });
    }

    if (action === "verify-totp-enrollment") {
      if (challenge.purpose !== "enroll-totp" || typeof body.totpCode !== "string") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session) || !session.email || session.email !== challenge.email) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      const limitedTotp = await rateLimitResponseFor(request, rateLimitPolicies.adminTotp, { identity: challenge.email });
      if (limitedTotp) return limitedTotp;
      if (!(await confirmSiteAdminTotpEnrollment(challenge.email, challenge.challenge, body.totpCode))) {
        telemetry.reject("auth.access", 401, { action: "totp-enrollment", errorCode: "INVALID_TOTP_CODE" });
        return privateJson({ error: "INVALID_TOTP_CODE" }, { status: 401 });
      }
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, "admin.totp-enroll", challenge.email);
      telemetry.success("auth.access", { action: "totp-enrollment" });
      return privateJson({ verified: true });
    }

    if (action === "verify-totp") {
      if ((challenge.purpose !== "login" && challenge.purpose !== "step-up") || typeof body.totpCode !== "string") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      const current = challenge.purpose === "step-up" ? await requireFullSiteAdminSession() : null;
      if (current && (!current.email || current.email !== challenge.email)) throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      const limitedTotp = await rateLimitResponseFor(request, rateLimitPolicies.adminTotp, { identity: challenge.email });
      if (limitedTotp) return limitedTotp;
      if (!(await consumeSiteAdminTotpCode(challenge.email, body.totpCode))) {
        telemetry.reject("auth.access", 401, { action: "totp", errorCode: "INVALID_TOTP_CODE" });
        return privateJson({ error: "INVALID_TOTP_CODE" }, { status: 401 });
      }
      const now = Date.now();
      let session: SiteAdminSessionPayload;
      if (challenge.purpose === "login") {
        await setSiteAdminCookie({ scope: "full", method: "totp", email: challenge.email });
        session = { version: 2, scope: "full", method: "totp", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      } else {
        await refreshSiteAdminMfaCookie("totp");
        session = { ...current!, method: "totp", mfaAt: now };
      }
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "login" ? "admin.totp-login" : "admin.totp-step-up", "site-admin");
      telemetry.success("auth.access", { action: challenge.purpose === "login" ? "totp" : "totp-step-up" });
      return privateJson({ verified: true, session: publicSiteAdminSession(session) });
    }

    if (action === "use-recovery-code") {
      if (
        (challenge.purpose !== "login" && challenge.purpose !== "step-up")
        || typeof body.recoveryCode !== "string"
      ) throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      if (challenge.purpose === "step-up") {
        const current = await requireFullSiteAdminSession();
        if (!current.email || current.email !== challenge.email) throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      }
      if (!(await consumeSiteAdminRecoveryCode(challenge.email, body.recoveryCode))) {
        telemetry.reject("auth.access", 401, { action: "recovery-code", errorCode: "INVALID_RECOVERY_CODE" });
        return Response.json({ error: "INVALID_RECOVERY_CODE" }, { status: 401 });
      }
      await setSiteAdminCookie({ scope: "full", method: "recovery-code", email: challenge.email });
      await clearSiteAdminChallengeCookie();
      const now = Date.now();
      const session: SiteAdminSessionPayload = { version: 2, scope: "full", method: "recovery-code", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      const auditAction = challenge.purpose === "login" ? "admin.recovery-code-login" : "admin.recovery-code-step-up";
      await appendSiteAdminAuditLog(request, session, auditAction, "site-admin");
      telemetry.success("auth.access", { action: challenge.purpose === "login" ? "recovery-code" : "recovery-code-step-up" });
      return Response.json({ verified: true, session: publicSiteAdminSession(session) });
    }

    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  } catch (error) {
    telemetry.responseError("auth.access", error, 400, { action: "site-admin-passkey" });
    return errorResponse(error);
  }
}
