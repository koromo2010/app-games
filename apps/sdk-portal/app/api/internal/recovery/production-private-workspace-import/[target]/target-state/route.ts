import {
  isProductionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportErrorStatus,
  projectProductionPrivateWorkspaceImportTargetState,
} from "@/lib/production-private-workspace-import";
import { productionPrivateWorkspaceImportStore } from "@/lib/production-private-workspace-import-store";
import { resolveSdkProductionRuntimeIdentity } from "@/lib/production-private-workspace-runtime-identity";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "production" });
    const { target } = await context.params;
    if (!resolveSdkProductionRuntimeIdentity() || !isProductionPrivateWorkspaceImportTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const state = await productionPrivateWorkspaceImportStore.readBeforeState(target);
    return Response.json(projectProductionPrivateWorkspaceImportTargetState(target, state), { headers });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: productionPrivateWorkspaceImportErrorStatus(error), headers });
  }
}
