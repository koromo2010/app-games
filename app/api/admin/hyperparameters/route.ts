import { loadAdminHyperparameterCatalog } from "@/lib/admin-hyperparameters";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { isSiteAdminConfigurationError, requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { validateRuntimeHyperparameterPatch } from "@/lib/runtime-hyperparameters-core";
import { loadRuntimeHyperparameterOverrides, saveRuntimeHyperparameterOverrides } from "@/lib/runtime-hyperparameters-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSiteAdminSession();
    await loadRuntimeHyperparameterOverrides({ fresh: true });
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

export async function PATCH(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { changes?: unknown };
    const validation = validateRuntimeHyperparameterPatch(body.changes);
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const before = await loadRuntimeHyperparameterOverrides({ fresh: true });
    const saved = await saveRuntimeHyperparameterOverrides(validation.changes);
    await appendSiteAdminAuditLog(request, session, "hyperparameters.update", "runtime-hyperparameters", before, saved);
    return Response.json({ catalog: loadAdminHyperparameterCatalog() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "SITE_SETTINGS_STORE_NOT_CONFIGURED") return Response.json({ error: error.message }, { status: 503 });
    return Response.json({ error: "HYPERPARAMETERS_SAVE_FAILED" }, { status: 500 });
  }
}
