import { loadAdminDashboardSnapshot } from "@/lib/admin-dashboard-store";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";
import { loadRuntimeHyperparameterOverrides } from "@/lib/runtime-hyperparameters-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSiteAdminSession();
    await loadRuntimeHyperparameterOverrides();
    return Response.json({ dashboard: await loadAdminDashboardSnapshot() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
    if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
    return Response.json({ error: "ADMIN_DASHBOARD_LOAD_FAILED" }, { status: 500 });
  }
}
