import { loadAdminDashboardCore, loadAdminDashboardDetails } from "@/lib/admin-dashboard-store";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";
import { loadRuntimeHyperparameterOverrides } from "@/lib/runtime-hyperparameters-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSiteAdminSession();
    await loadRuntimeHyperparameterOverrides();
    const section = new URL(request.url).searchParams.get("section");
    if (section === "details") {
      return Response.json({ details: await loadAdminDashboardDetails() }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ dashboard: await loadAdminDashboardCore() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
    if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
    return Response.json({ error: "ADMIN_DASHBOARD_LOAD_FAILED" }, { status: 500 });
  }
}
