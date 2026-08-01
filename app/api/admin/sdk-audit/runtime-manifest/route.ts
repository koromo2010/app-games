import { requireFullSiteAdminSession } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { proxySiteAdminSdkAuditGet } from "@/lib/site-admin-sdk-audit-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxySiteAdminSdkAuditGet({
    request,
    kind: "runtime-manifest",
    authorize: requireFullSiteAdminSession,
    portalBaseUrl: sdkPromotionInternalBaseUrl(),
    serviceHeaders: sdkServiceHeaders,
    fetchRuntime: fetch,
  });
}
