import {
  isProductionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportErrorStatus,
} from "@/apps/sdk-portal/lib/production-private-workspace-import";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import {
  isCanonicalProductionPlatformRuntime,
  productionPrivateWorkspaceImportInternalUrl,
  productionPrivateWorkspaceImportRuntimeIdentity,
} from "@/lib/production-private-workspace-import-proxy";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ target: string; operationId: string }> },
) {
  try {
    await requireFullSiteAdminSession();
    const { target, operationId } = await context.params;
    if (
      sdkSupportEnvironment() !== "production"
      || !isCanonicalProductionPlatformRuntime(productionPrivateWorkspaceImportRuntimeIdentity())
      || !isProductionPrivateWorkspaceImportTarget(target)
      || new URL(request.url).search !== ""
    ) return Response.json({ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    const url = productionPrivateWorkspaceImportInternalUrl(
      `/api/internal/recovery/production-private-workspace-import/${encodeURIComponent(target)}/status/${encodeURIComponent(operationId)}`,
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...sdkServiceHeaders("GET", url, { environment: "production" }),
        "X-Game-Fields-Production-Private-Import-Plan-Receipt":
          request.headers.get("x-game-fields-production-private-import-plan-receipt") ?? "",
        "X-Game-Fields-Production-Private-Import-Bundle-Sha256":
          request.headers.get("x-game-fields-production-private-import-bundle-sha256") ?? "",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    return Response.json(payload ?? { error: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE" }, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? Response.json({
      error: error instanceof Error ? error.message : "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: productionPrivateWorkspaceImportErrorStatus(error), headers });
  }
}
