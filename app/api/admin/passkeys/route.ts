import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
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
import { appendSiteAdminAuditLog, consumeSiteAdminRecoveryCode, replaceSiteAdminRecoveryCodes, saveSiteAdminPasskey, updateSiteAdminPasskeyCounter } from "@/lib/site-admin-passkey-store";

export const runtime = "nodejs";

function errorResponse(error: unknown, stage: string) {
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  const code = error instanceof Error ? error.message : "SITE_ADMIN_PASSKEY_FAILED";
  const diagnostic = (base: string) => `${base} [${stage} / ${code}]`;
  if (code === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") return Response.json({ error: diagnostic(code), stage, detail: code }, { status: 503 });
  if (code === "SITE_ADMIN_PASSKEY_LIMIT_REACHED") return Response.json({ error: diagnostic(code), stage, detail: code }, { status: 409 });
  if (code === "SITE_ADMIN_CHALLENGE_INVALID") return Response.json({ error: diagnostic("SITE_ADMIN_CHALLENGE_EXPIRED"), detail: code, stage }, { status: 400 });
  return Response.json({ error: diagnostic("SITE_ADMIN_PASSKEY_VERIFICATION_FAILED"), detail: code, stage }, { status: 400 });
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/passkeys", { operation: "site-admin-passkey" });
  let stage = "parse-request";
  try {
    const body = await request.json() as { action?: unknown; response?: unknown; recoveryCode?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    stage = `rate-limit:${action || "unknown"}`;
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.adminAuth, { identity: action });
    if (limited) return limited;

    if (action === "begin-step-up") {
      stage = "begin-step-up:session";
      const session = await requireFullSiteAdminSession();
      if (isRecentSiteAdminMfa(session)) return Response.json({ verified: true });
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      stage = "begin-step-up:options";
      const options = await siteAdminAuthenticationOptions(session.email);
      if (!options) throw new Error("SITE_ADMIN_PASSKEY_NOT_FOUND");
      stage = "begin-step-up:challenge-cookie";
      await setSiteAdminChallengeCookie({ email: session.email, purpose: "step-up", challenge: options.challenge });
      return Response.json({ verified: false, options });
    }

    if (action === "begin-add-passkey") {
      stage = "begin-add-passkey:session";
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      stage = "begin-add-passkey:options";
      const options = await siteAdminRegistrationOptions(session.email);
      stage = "begin-add-passkey:challenge-cookie";
      await setSiteAdminChallengeCookie({ email: session.email, purpose: "add-passkey", challenge: options.challenge });
      return Response.json({ options });
    }

    if (action === "regenerate-recovery-codes") {
      stage = "regenerate-recovery-codes:session";
      const session = await requireFullSiteAdminSession();
      if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      stage = "regenerate-recovery-codes:replace";
      const recoveryCodes = await replaceSiteAdminRecoveryCodes(session.email);
      stage = "regenerate-recovery-codes:audit";
      await appendSiteAdminAuditLog(request, session, "admin.recovery-codes-regenerate", session.email);
      return Response.json({ recoveryCodes });
    }

    stage = `${action || "unknown"}:read-challenge`;
    const challenge = await readSiteAdminChallenge();
    if (!challenge) throw new Error("SITE_ADMIN_CHALLENGE_INVALID");

    if (action === "verify-authentication") {
      if (challenge.purpose !== "login" && challenge.purpose !== "step-up") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      const response = body.response as AuthenticationResponseJSON;
      stage = "verify-authentication:webauthn";
      const { verification, passkey } = await verifySiteAdminAuthentication(response, challenge.challenge, challenge.email);
      if (!verification.verified) throw new Error("SITE_ADMIN_PASSKEY_NOT_VERIFIED");
      stage = "verify-authentication:update-counter";
      await updateSiteAdminPasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);
      const now = Date.now();
      let session: SiteAdminSessionPayload;
      if (challenge.purpose === "login") {
        stage = "verify-authentication:set-session-cookie";
        await setSiteAdminCookie({ scope: "full", method: "passkey", email: challenge.email });
        session = { version: 2, scope: "full", method: "passkey", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      } else {
        stage = "verify-authentication:refresh-step-up";
        const current = await requireFullSiteAdminSession();
        await refreshSiteAdminMfaCookie();
        session = { ...current, mfaAt: now };
      }
      stage = "verify-authentication:clear-challenge";
      await clearSiteAdminChallengeCookie();
      stage = "verify-authentication:audit";
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "login" ? "admin.passkey-login" : "admin.step-up", "site-admin");
      telemetry.success("auth.access", { action: challenge.purpose });
      return Response.json({ verified: true, session: publicSiteAdminSession(session) });
    }

    if (action === "verify-registration") {
      if (challenge.purpose !== "enroll" && challenge.purpose !== "add-passkey") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      if (challenge.purpose === "add-passkey") {
        stage = "verify-registration:session";
        const session = await requireFullSiteAdminSession();
        if (session.email !== challenge.email || !isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      }
      stage = "verify-registration:webauthn";
      const verification = await verifySiteAdminRegistration(body.response as RegistrationResponseJSON, challenge.challenge);
      if (!verification.verified) throw new Error("SITE_ADMIN_PASSKEY_NOT_VERIFIED");
      const info = verification.registrationInfo;
      stage = "verify-registration:save-passkey";
      await saveSiteAdminPasskey({ email: challenge.email, credential: info.credential, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp });
      stage = "verify-registration:recovery-codes";
      const recoveryCodes = challenge.purpose === "enroll" ? await replaceSiteAdminRecoveryCodes(challenge.email) : undefined;
      const now = Date.now();
      let session: SiteAdminSessionPayload;
      if (challenge.purpose === "enroll") {
        stage = "verify-registration:set-session-cookie";
        await setSiteAdminCookie({ scope: "full", method: "passkey", email: challenge.email });
        session = { version: 2, scope: "full", method: "passkey", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      } else {
        stage = "verify-registration:load-session";
        session = await requireFullSiteAdminSession();
      }
      stage = "verify-registration:clear-challenge";
      await clearSiteAdminChallengeCookie();
      stage = "verify-registration:audit";
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "enroll" ? "admin.passkey-enroll" : "admin.passkey-add", challenge.email);
      telemetry.success("auth.access", { action: challenge.purpose });
      return Response.json({ verified: true, session: publicSiteAdminSession(session), ...(recoveryCodes ? { recoveryCodes } : {}) });
    }

    if (action === "use-recovery-code") {
      if (challenge.purpose !== "login" || typeof body.recoveryCode !== "string") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      stage = "use-recovery-code:consume";
      if (!(await consumeSiteAdminRecoveryCode(challenge.email, body.recoveryCode))) {
        telemetry.reject("auth.access", 401, { action: "recovery-code", errorCode: "INVALID_RECOVERY_CODE" });
        return Response.json({ error: "INVALID_RECOVERY_CODE" }, { status: 401 });
      }
      stage = "use-recovery-code:set-session-cookie";
      await setSiteAdminCookie({ scope: "full", method: "recovery-code", email: challenge.email });
      await clearSiteAdminChallengeCookie();
      const now = Date.now();
      const session: SiteAdminSessionPayload = { version: 2, scope: "full", method: "recovery-code", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      stage = "use-recovery-code:audit";
      await appendSiteAdminAuditLog(request, session, "admin.recovery-code-login", "site-admin");
      telemetry.success("auth.access", { action: "recovery-code" });
      return Response.json({ verified: true, session: publicSiteAdminSession(session) });
    }

    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  } catch (error) {
    telemetry.responseError("auth.access", error, 400, { action: "site-admin-passkey", stage });
    return errorResponse(error, stage);
  }
}
