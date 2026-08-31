import {
  isProductionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportErrorStatus,
  readProductionPrivateWorkspaceImportBody,
} from "@/apps/sdk-portal/lib/production-private-workspace-import";
import { requireRecentSiteAdminMfa, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
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

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    await requireRecentSiteAdminMfa();
    const { target } = await context.params;
    if (
      sdkSupportEnvironment() !== "production"
      || !isCanonicalProductionPlatformRuntime(productionPrivateWorkspaceImportRuntimeIdentity())
      || !isProductionPrivateWorkspaceImportTarget(target)
      || new URL(request.url).search !== ""
    ) return Response.json({ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    const archive = await readProductionPrivateWorkspaceImportBody(request, target);
    const operationId = request.headers.get("x-game-fields-production-private-import-operation-id") ?? "";
    const planReceipt = request.headers.get("x-game-fields-production-private-import-plan-receipt") ?? "";
    const url = productionPrivateWorkspaceImportInternalUrl(
      `/api/internal/recovery/production-private-workspace-import/${encodeURIComponent(target)}/execute`,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...sdkServiceHeaders("POST", url, { environment: "production" }),
        "Content-Type": "application/zip",
        "X-Game-Fields-Production-Private-Import-Operation-Id": operationId,
        "X-Game-Fields-Production-Private-Import-Plan-Receipt": planReceipt,
      },
      body: archive,
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
