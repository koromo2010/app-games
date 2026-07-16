import { revalidatePath } from "next/cache";
import { clearSiteAdminCookie, isSiteAdminConfigurationError, requireSiteAdminSession, setSiteAdminCookie } from "@/lib/site-admin-auth";
import { resolveSiteAdminPassword, verifySiteAdminPassword } from "@/lib/site-admin-auth-core";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { verifySiteAdminAccount } from "@/lib/site-admin-account-store";
import { validateSiteSettingsInput } from "@/lib/site-settings";
import { loadSiteSettings, saveSiteSettings } from "@/lib/site-settings-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authError(error: unknown) {
  if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
  if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
  return null;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json({ settings: await loadSiteSettings() });
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
    const authenticated = email
      ? await verifySiteAdminAccount(email, password)
      : verifySiteAdminPassword(password, configuredPassword);
    if (!authenticated) {
      telemetry.reject("auth.access", 401, { action: "site-admin-login", errorCode: "INVALID_CREDENTIAL" });
      return Response.json({ error: "INVALID_ADMIN_CREDENTIALS" }, { status: 401 });
    }
    await setSiteAdminCookie();
    telemetry.success("auth.access", { action: "site-admin-login" });
    return Response.json({ settings: await loadSiteSettings() });
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
    await requireSiteAdminSession();
    const body = await request.json() as { settings?: unknown };
    const validationError = validateSiteSettingsInput(body.settings);
    if (validationError) {
      telemetry.reject("site.settings", 400, { action: "update", errorCode: validationError });
      return Response.json({ error: validationError }, { status: 400 });
    }
    const saved = await saveSiteSettings(body.settings as Parameters<typeof saveSiteSettings>[0]);
    revalidatePath("/", "layout");
    revalidatePath("/site-icon");
    revalidatePath("/manifest.webmanifest");
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
