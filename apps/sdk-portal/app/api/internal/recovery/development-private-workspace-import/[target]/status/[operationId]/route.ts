import {
  developmentPrivateWorkspaceImportErrorStatus,
  isDevelopmentPrivateWorkspaceImportTarget,
  readDevelopmentPrivateWorkspaceImportStatus,
} from "@/lib/development-private-workspace-import";
import { developmentPrivateWorkspaceImportStore } from "@/lib/development-private-workspace-import-store";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ target: string; operationId: string }> },
) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "development" });
    const { target, operationId } = await context.params;
    if (!isDevelopmentPrivateWorkspaceImportTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const status = await readDevelopmentPrivateWorkspaceImportStatus({
      target,
      identity: {
        operationId,
        planReceipt: request.headers.get("x-game-fields-private-import-plan-receipt"),
        bundleSha256: request.headers.get("x-game-fields-private-import-bundle-sha256"),
      },
      adapter: developmentPrivateWorkspaceImportStore,
    });
    return Response.json(status, { status: status.state === "not-found" ? 404 : 200, headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
    return Response.json({ error: code }, {
      status: developmentPrivateWorkspaceImportErrorStatus(error),
      headers,
    });
  }
}
