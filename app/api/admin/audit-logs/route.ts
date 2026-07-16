import { requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { listSiteAdminAuditLogs } from "@/lib/site-admin-passkey-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSiteAdminSession();
    const logs = (await listSiteAdminAuditLogs()).map((entry) => ({
      id: entry.id,
      actorEmail: entry.actor_email,
      authMethod: entry.auth_method,
      action: entry.action,
      target: entry.target,
      beforeValue: entry.before_value,
      afterValue: entry.after_value,
      createdAt: Number(entry.created_at),
    }));
    return Response.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? Response.json({ error: "SITE_ADMIN_AUDIT_LOAD_FAILED" }, { status: 500 });
  }
}
