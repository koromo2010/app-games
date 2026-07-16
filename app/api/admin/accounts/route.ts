import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { deleteSiteAdminAccount, listSiteAdminAccounts, saveSiteAdminAccount, updateSiteAdminAccountSubscriptions } from "@/lib/site-admin-account-store";
import { requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED") return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof Error && (error.message === "SITE_ADMIN_EMAIL_INVALID" || error.message === "SITE_ADMIN_ACCOUNT_PASSWORD_INVALID")) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNT_LIMIT_REACHED") return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "SITE_ADMIN_ACCOUNT_NOT_FOUND") return Response.json({ error: error.message }, { status: 404 });
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
    const session = await requireSiteAdminSession();
    if (session.scope === "full") await requireRecentSiteAdminMfa();
    const body = await request.json() as { email?: unknown; password?: unknown; receiveAlerts?: unknown; receiveContacts?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const before = await listSiteAdminAccounts();
    const account = await saveSiteAdminAccount(email, password, { receiveAlerts: body.receiveAlerts === true, receiveContacts: body.receiveContacts === true });
    const accounts = await listSiteAdminAccounts();
    await appendSiteAdminAuditLog(request, session, "admin-account.save", account.email, before.find((entry) => entry.email === account.email) ?? null, accounts.find((entry) => entry.email === account.email));
    telemetry.success("auth.access", { action: "site-admin-account-save" });
    return Response.json({ account, accounts });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "site-admin-account-save" });
    return Response.json({ error: "SITE_ADMIN_ACCOUNT_SAVE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/accounts", { operation: "site-admin-subscriptions-update" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { email?: unknown; receiveAlerts?: unknown; receiveContacts?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const before = (await listSiteAdminAccounts()).find((entry) => entry.email === email.trim().toLocaleLowerCase("en-US")) ?? null;
    await updateSiteAdminAccountSubscriptions(email, { receiveAlerts: body.receiveAlerts === true, receiveContacts: body.receiveContacts === true });
    const accounts = await listSiteAdminAccounts();
    await appendSiteAdminAuditLog(request, session, "admin-account.subscriptions", email.trim().toLocaleLowerCase("en-US"), before, accounts.find((entry) => entry.email === email.trim().toLocaleLowerCase("en-US")) ?? null);
    telemetry.success("auth.access", { action: "site-admin-subscriptions-update" });
    return Response.json({ accounts });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "site-admin-subscriptions-update" });
    return Response.json({ error: "SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/accounts", { operation: "site-admin-account-delete" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireSiteAdminSession();
    if (session.scope === "full") await requireRecentSiteAdminMfa();
    const body = await request.json() as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const before = (await listSiteAdminAccounts()).find((entry) => entry.email === email.trim().toLocaleLowerCase("en-US")) ?? null;
    await deleteSiteAdminAccount(email);
    await appendSiteAdminAuditLog(request, session, "admin-account.delete", email.trim().toLocaleLowerCase("en-US"), before, null);
    telemetry.success("auth.access", { action: "site-admin-account-delete" });
    return Response.json({ accounts: await listSiteAdminAccounts() });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "site-admin-account-delete" });
    return Response.json({ error: "SITE_ADMIN_ACCOUNT_DELETE_FAILED" }, { status: 500 });
  }
}
