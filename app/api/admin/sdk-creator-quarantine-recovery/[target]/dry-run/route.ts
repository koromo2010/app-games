import { requireRecentSiteAdminMfa, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    await requireRecentSiteAdminMfa();
    const { target } = await context.params;
    if (sdkSupportEnvironment() !== "production" || new URL(request.url).search !== "") {
      return Response.json({ error: "CREATOR_RECOVERY_INPUT_INVALID" }, { status: 400, headers });
    }
    const url = new URL(`/api/internal/recovery/creator-quarantine/${encodeURIComponent(target)}/dry-run`, sdkPromotionInternalBaseUrl()).toString();
    const response = await fetch(url, { method: "POST", headers: sdkServiceHeaders("POST", url, { environment: "production" }), cache: "no-store" });
    return Response.json(await response.json(), { status: response.status, headers });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? Response.json({ error: "CREATOR_RECOVERY_UNAVAILABLE" }, { status: 503, headers });
  }
}
