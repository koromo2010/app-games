import { productionOwnerRestorationWorkspaceOperationId } from "../../../../../../../../../lib/production-owner-restoration";
import { diagnoseCompletedProductionPrivateWorkspaceImport } from "@/lib/production-private-workspace-import-store";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic";

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request, {
      expectedEnvironment: process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development",
    });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const url = new URL(request.url);
  if (url.pathname !== exactPath || url.search || request.method !== "GET") {
    return Response.json({ error: "OWNER_RESTORATION_DIAGNOSTIC_INPUT_INVALID" }, { status: 400, headers });
  }
  try {
    return Response.json(
      await diagnoseCompletedProductionPrivateWorkspaceImport(productionOwnerRestorationWorkspaceOperationId),
      { headers },
    );
  } catch {
    return Response.json({ error: "OWNER_RESTORATION_DIAGNOSTIC_UNAVAILABLE" }, { status: 503, headers });
  }
}
