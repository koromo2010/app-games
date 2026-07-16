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

function errorResponse(error: unknown) {
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  const code = error instanceof Error ? error.message : "SITE_ADMIN_PASSKEY_FAILED";
  if (code === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") return Response.json({ error: code }, { status: 503 });
  if (code === "SITE_ADMIN_PASSKEY_LIMIT_REACHED") return Response.json({ error: code }, { status: 409 });
  if (code === "SITE_ADMIN_PASSKEY_NOT_FOUND" || code === "SITE_ADMIN_CHALLENGE_INVALID") return Response.json({ error: "SITE_ADMIN_PASSKEY_VERIFICATION_FAILED" }, { status: 400 });
  return Response.json({ error: "SITE_ADMIN_PASSKEY_VERIFICATION_FAILED" }, { status: 400 });
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/passkeys", { operation: "site-admin-passkey" });
  try {
    const body = await request.json() as { action?: unknown; response?: unknown; recoveryCode?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.adminAuth, { identity: action });
    if (limited) return limited;

    if (action === "begin-step-up") {
      const session = await requireFullSiteAdminSession();
      if (isRecentSiteAdminMfa(session)) return Response.json({ verified: true });
      if (!session.email) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
      const options = await siteAdminAuthenticationOptions(session.email);
      if (!options) throw new Error("SITE_ADMIN_PASSKEY_NOT_FOUND");
      await setSiteAdminChallengeCookie({ email: session.email, purpose: "step-up", challenge: options.challenge });
      return Response.json({ verified: false, options });
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
        session = await requireFullSiteAdminSession();
      }
      await clearSiteAdminChallengeCookie();
      await appendSiteAdminAuditLog(request, session, challenge.purpose === "enroll" ? "admin.passkey-enroll" : "admin.passkey-add", challenge.email);
      telemetry.success("auth.access", { action: challenge.purpose });
      return Response.json({ verified: true, session: publicSiteAdminSession(session), ...(recoveryCodes ? { recoveryCodes } : {}) });
    }

    if (action === "use-recovery-code") {
      if (challenge.purpose !== "login" || typeof body.recoveryCode !== "string") throw new Error("SITE_ADMIN_CHALLENGE_INVALID");
      if (!(await consumeSiteAdminRecoveryCode(challenge.email, body.recoveryCode))) {
        telemetry.reject("auth.access", 401, { action: "recovery-code", errorCode: "INVALID_RECOVERY_CODE" });
        return Response.json({ error: "INVALID_RECOVERY_CODE" }, { status: 401 });
      }
      await setSiteAdminCookie({ scope: "full", method: "recovery-code", email: challenge.email });
      await clearSiteAdminChallengeCookie();
      const now = Date.now();
      const session: SiteAdminSessionPayload = { version: 2, scope: "full", method: "recovery-code", email: challenge.email, authenticatedAt: now, mfaAt: now, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
      await appendSiteAdminAuditLog(request, session, "admin.recovery-code-login", "site-admin");
      telemetry.success("auth.access", { action: "recovery-code" });
      return Response.json({ verified: true, session: publicSiteAdminSession(session) });
    }

    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  } catch (error) {
    telemetry.responseError("auth.access", error, 400, { action: "site-admin-passkey" });
    return errorResponse(error);
  }
}
