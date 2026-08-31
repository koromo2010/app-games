import {
  isProductionPrivateWorkspaceImportTarget,
  prepareProductionPrivateWorkspaceImportPlan,
  productionPrivateWorkspaceImportErrorStatus,
  readProductionPrivateWorkspaceImportBody,
} from "@/lib/production-private-workspace-import";
import { productionPrivateWorkspaceImportStore } from "@/lib/production-private-workspace-import-store";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function productionRuntime() {
  return process.env.APP_ENV === "production"
    && process.env.VERCEL_ENV === "production"
    && process.env.VERCEL_PROJECT_NAME === "app-games-sdk"
    && process.env.VERCEL_GIT_COMMIT_REF === "main";
}

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "production" });
    const { target } = await context.params;
    if (!productionRuntime() || !isProductionPrivateWorkspaceImportTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const archive = await readProductionPrivateWorkspaceImportBody(request, target);
    const plan = await prepareProductionPrivateWorkspaceImportPlan({
      target,
      archive,
      adapter: productionPrivateWorkspaceImportStore,
    });
    return Response.json(plan.response, { headers });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: productionPrivateWorkspaceImportErrorStatus(error), headers });
  }
}
