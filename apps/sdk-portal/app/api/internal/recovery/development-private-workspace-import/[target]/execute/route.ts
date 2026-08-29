import {
  developmentPrivateWorkspaceImportErrorStatus,
  executeDevelopmentPrivateWorkspaceImport,
  isDevelopmentPrivateWorkspaceImportTarget,
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
    const identity = {
      operationId: request.headers.get("x-game-fields-private-import-operation-id"),
      planReceipt: request.headers.get("x-game-fields-private-import-plan-receipt"),
    };
    const archive = await readDevelopmentPrivateWorkspaceImportBody(request, target);
    const receipt = await executeDevelopmentPrivateWorkspaceImport({
      target,
      archive,
      identity,
      adapter: developmentPrivateWorkspaceImportStore,
    });
    return Response.json(receipt, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
    return Response.json({ error: code }, {
      status: developmentPrivateWorkspaceImportErrorStatus(error),
      headers,
    });
  }
}
