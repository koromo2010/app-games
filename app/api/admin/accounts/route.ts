import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { deleteSiteAdminAccount, listSiteAdminAccounts, saveSiteAdminAccount } from "@/lib/site-admin-account-store";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
  if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
  if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof Error && (error.message === "SITE_ADMIN_EMAIL_INVALID" || error.message === "SITE_ADMIN_ACCOUNT_PASSWORD_INVALID")) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNT_LIMIT_REACHED") return Response.json({ error: error.message }, { status: 409 });
  return null;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json({ accounts: await listSiteAdminAccounts() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error) ?? Response.json({ error: "SITE_ADMIN_ACCOUNTS_LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/accounts", { operation: "site-admin-account-save" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    await requireSiteAdminSession();
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const account = await saveSiteAdminAccount(email, password);
    telemetry.success("auth.access", { action: "site-admin-account-save" });
    return Response.json({ account, accounts: await listSiteAdminAccounts() });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "site-admin-account-save" });
    return Response.json({ error: "SITE_ADMIN_ACCOUNT_SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/accounts", { operation: "site-admin-account-delete" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    await requireSiteAdminSession();
    const body = await request.json() as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    await deleteSiteAdminAccount(email);
    telemetry.success("auth.access", { action: "site-admin-account-delete" });
    return Response.json({ accounts: await listSiteAdminAccounts() });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "site-admin-account-delete" });
    return Response.json({ error: "SITE_ADMIN_ACCOUNT_DELETE_FAILED" }, { status: 500 });
  }
}
