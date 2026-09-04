import { productionOwnerRestorationDiagnosticInternalUrl } from "@/lib/production-private-workspace-import-proxy";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic";

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const incoming = new URL(request.url);
    if (incoming.pathname !== exactPath || incoming.search || request.method !== "GET") {
      return Response.json({ error: "OWNER_RESTORATION_DIAGNOSTIC_INPUT_INVALID" }, { status: 400, headers });
    }
    const environment = sdkSupportEnvironment();
    const url = productionOwnerRestorationDiagnosticInternalUrl(environment);
    const response = await fetch(url, {
      method: "GET",
      headers: sdkServiceHeaders("GET", url, { environment }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "OWNER_RESTORATION_DIAGNOSTIC_UNAVAILABLE" }, { status: 503, headers });
    }
    return Response.json(body, { headers });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    return Response.json({ error: "OWNER_RESTORATION_DIAGNOSTIC_UNAVAILABLE" }, { status: 503, headers });
  }
}
