import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/admin/sdk-yabobojpn-lab-safe-projection";
const targetOverrideHeaders = [
  "creator-slug",
  "slug",
  "target",
  "target-slug",
  "x-creator-slug",
  "x-creator-target",
  "x-target-slug",
];

function acceptsExactTargetSafeProjectionRequest(request: Request) {
  const incoming = new URL(request.url);
  const contentLength = request.headers.get("content-length");
  return request.method === "GET"
    && incoming.pathname === exactPath
    && incoming.search === ""
    && request.body === null
    && (contentLength === null || contentLength === "0")
    && targetOverrideHeaders.every((name) => !request.headers.has(name));
}

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    if (!acceptsExactTargetSafeProjectionRequest(request)) {
      return Response.json(
        { error: "EXACT_TARGET_SAFE_PROJECTION_INPUT_INVALID" },
        { status: 400, headers },
      );
    }
    const target = new URL(
      "/api/internal/audit/yabobojpn-lab-safe-projection",
      sdkPromotionInternalBaseUrl(),
    );
    const url = target.toString();
    const response = await fetch(url, {
      headers: sdkServiceHeaders("GET", url, { environment: sdkSupportEnvironment() }),
      cache: "no-store",
    });
    return Response.json(await response.json().catch(() => ({
      error: "EXACT_TARGET_SAFE_PROJECTION_INVALID_RESPONSE",
    })), { status: response.status, headers });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json(
        { error: "EXACT_TARGET_SAFE_PROJECTION_UNAVAILABLE" },
        { status: 503, headers },
      );
  }
}
