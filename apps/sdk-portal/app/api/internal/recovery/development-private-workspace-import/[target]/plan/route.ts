import {
  developmentPrivateWorkspaceImportErrorStatus,
  isDevelopmentPrivateWorkspaceImportTarget,
  prepareDevelopmentPrivateWorkspaceImportPlan,
  readDevelopmentPrivateWorkspaceImportBody,
} from "@/lib/development-private-workspace-import";
import { developmentPrivateWorkspaceImportStore } from "@/lib/development-private-workspace-import-store";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "development" });
    const { target } = await context.params;
    if (!isDevelopmentPrivateWorkspaceImportTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const archive = await readDevelopmentPrivateWorkspaceImportBody(request, target);
    const plan = await prepareDevelopmentPrivateWorkspaceImportPlan({
      target,
      archive,
      adapter: developmentPrivateWorkspaceImportStore,
    });
    return Response.json(plan.response, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
    return Response.json({ error: code }, {
      status: developmentPrivateWorkspaceImportErrorStatus(error),
      headers,
    });
  }
}
