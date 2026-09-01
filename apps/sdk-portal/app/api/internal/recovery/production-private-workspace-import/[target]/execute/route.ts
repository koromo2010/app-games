import {
  executeProductionPrivateWorkspaceImport,
  isProductionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportErrorStatus,
  readProductionPrivateWorkspaceImportBody,
} from "@/lib/production-private-workspace-import";
import { productionPrivateWorkspaceImportStore } from "@/lib/production-private-workspace-import-store";
import { resolveSdkProductionRuntimeIdentity } from "@/lib/production-private-workspace-runtime-identity";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "production" });
    const { target } = await context.params;
    if (!resolveSdkProductionRuntimeIdentity() || !isProductionPrivateWorkspaceImportTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const archive = await readProductionPrivateWorkspaceImportBody(request, target);
    const result = await executeProductionPrivateWorkspaceImport({
      target,
      archive,
      identity: {
        operationId: request.headers.get("x-game-fields-production-private-import-operation-id"),
        planReceipt: request.headers.get("x-game-fields-production-private-import-plan-receipt"),
      },
      adapter: productionPrivateWorkspaceImportStore,
    });
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: productionPrivateWorkspaceImportErrorStatus(error), headers });
  }
}
