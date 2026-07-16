import { loadAdminHyperparameterCatalog } from "@/lib/admin-hyperparameters";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json(
      { catalog: loadAdminHyperparameterCatalog() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") {
      return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
    }
    if (isSiteAdminConfigurationError(error)) {
      return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
    }
    return Response.json({ error: "HYPERPARAMETERS_LOAD_FAILED" }, { status: 500 });
  }
}
