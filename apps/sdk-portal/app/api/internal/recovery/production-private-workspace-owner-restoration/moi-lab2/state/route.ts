import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { projectProductionOwnerRestorationWorkspace } from "../../../../../../../../../lib/production-owner-restoration";
import { readProductionOwnerRestorationWorkspace } from "@/lib/production-owner-restoration-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/state";

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development" });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const url = new URL(request.url);
  if (url.pathname !== exactPath || url.search || request.method !== "GET") {
    return Response.json({ error: "OWNER_RESTORATION_INPUT_INVALID" }, { status: 400, headers });
  }
  try {
    const environment = process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development";
    const workspace = await readProductionOwnerRestorationWorkspace();
    if (!workspace) return Response.json({ error: "OWNER_RESTORATION_WORKSPACE_NOT_FOUND" }, { status: 404, headers });
    return Response.json(projectProductionOwnerRestorationWorkspace({
      workspace,
      environment,
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    }), { headers });
  } catch {
    return Response.json({ error: "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE" }, { status: 503, headers });
  }
}
