import { revalidatePath } from "next/cache";
import { clearSiteAdminCookie, publicSiteAdminSession, requireRecentSiteAdminMfa, requireSiteAdminSession, setSiteAdminChallengeCookie, setSiteAdminCookie, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { resolveSiteAdminPassword, verifySiteAdminPassword } from "@/lib/site-admin-auth-core";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { countSiteAdminAccounts, verifySiteAdminAccount } from "@/lib/site-admin-account-store";
import { normalizeSiteAdminEmail } from "@/lib/site-admin-account-core";
import { siteAdminAuthenticationOptions, siteAdminRegistrationOptions } from "@/lib/site-admin-passkey";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { validateSiteSettingsInput } from "@/lib/site-settings";
import { loadSiteSettings, saveSiteSettings } from "@/lib/site-settings-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authError(error: unknown) {
  return siteAdminAuthorizationError(error);
}

export async function GET() {
  try {
    const session = await requireSiteAdminSession();
    return Response.json({ settings: await loadSiteSettings(), session: publicSiteAdminSession(session) });
  } catch (error) {
    return authError(error) ?? Response.json({ error: "SITE_SETTINGS_LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/site-settings", { operation: "site-admin-login" });
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.adminAuth, { identity: email || "master" });
    if (limited) return limited;
    const configuredPassword = resolveSiteAdminPassword(process.env);
    if (!configuredPassword) {
      telemetry.reject("auth.access", 503, { action: "site-admin-login", errorCode: "ADMIN_AUTH_NOT_CONFIGURED" });
      return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
    }
    if (!email) {
      if (!verifySiteAdminPassword(password, configuredPassword)) {
        telemetry.reject("auth.access", 401, { action: "site-admin-login", errorCode: "INVALID_CREDENTIAL" });
        return Response.json({ error: "INVALID_ADMIN_CREDENTIALS" }, { status: 401 });
      }
      const accountCount = await countSiteAdminAccounts();
      const breakGlassEnabled = process.env.SITE_ADMIN_BREAK_GLASS_ENABLED?.trim().toLocaleLowerCase("en-US") === "true";
      if (accountCount > 0 && !breakGlassEnabled) {
        telemetry.reject("auth.access", 403, { action: "site-admin-login", errorCode: "MASTER_LOGIN_DISABLED" });
        return Response.json({ error: "MASTER_LOGIN_DISABLED" }, { status: 403 });
      }
      await setSiteAdminCookie({ scope: "recovery", method: "master", email: null });
      const session = { scope: "recovery" as const, method: "master" as const, email: null, expiresAt: Date.now() + 15 * 60_000, mfaAt: null };
      await appendSiteAdminAuditLog(request, { version: 2, authenticatedAt: Date.now(), ...session }, "admin.master-login", "site-admin");
      telemetry.success("auth.access", { action: "site-admin-master-login" });
      return Response.json({ settings: await loadSiteSettings(), session });
    }

    const normalizedEmail = normalizeSiteAdminEmail(email);
    if (!(await verifySiteAdminAccount(normalizedEmail, password))) {
      telemetry.reject("auth.access", 401, { action: "site-admin-login", errorCode: "INVALID_CREDENTIAL" });
      return Response.json({ error: "INVALID_ADMIN_CREDENTIALS" }, { status: 401 });
    }
    const authenticationOptions = await siteAdminAuthenticationOptions(normalizedEmail);
    const options = authenticationOptions ?? await siteAdminRegistrationOptions(normalizedEmail);
    const purpose = authenticationOptions ? "login" as const : "enroll" as const;
    await setSiteAdminChallengeCookie({ email: normalizedEmail, purpose, challenge: options.challenge });
    telemetry.success("auth.access", { action: authenticationOptions ? "site-admin-password-accepted" : "site-admin-enrollment-started" });
    return Response.json(authenticationOptions
      ? { mfaRequired: true, options }
      : { passkeySetupRequired: true, options });
  } catch (error) {
    if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") {
      telemetry.reject("auth.access", 503, { action: "site-admin-login", errorCode: error.message });
      return Response.json({ error: error.message }, { status: 503 });
    }
    telemetry.responseError("auth.access", error, 400, { action: "site-admin-login" });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/site-settings", { operation: "site-settings-update" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { settings?: unknown };
    const validationError = validateSiteSettingsInput(body.settings);
    if (validationError) {
      telemetry.reject("site.settings", 400, { action: "update", errorCode: validationError });
      return Response.json({ error: validationError }, { status: 400 });
    }
    const before = await loadSiteSettings();
    const saved = await saveSiteSettings(body.settings as Parameters<typeof saveSiteSettings>[0]);
    revalidatePath("/", "layout");
    revalidatePath("/site-icon");
    revalidatePath("/manifest.webmanifest");
    await appendSiteAdminAuditLog(request, session, "site-settings.update", "site-settings", before, saved);
    telemetry.success("site.settings", { action: "update" });
    return Response.json({ settings: saved });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    if (error instanceof Error && error.message === "SITE_SETTINGS_STORE_NOT_CONFIGURED") return Response.json({ error: "SITE_SETTINGS_STORE_NOT_CONFIGURED" }, { status: 503 });
    telemetry.failure("site.settings", error, 500, { action: "update" });
    return Response.json({ error: "SITE_SETTINGS_SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE() {
  await clearSiteAdminCookie();
  return Response.json({ ok: true });
}
