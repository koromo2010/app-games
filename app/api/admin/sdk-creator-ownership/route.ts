import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const incoming = new URL(request.url);
    const slug = incoming.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    if (
      !slugPattern.test(slug)
      || [...incoming.searchParams.keys()].some((key) => key !== "slug")
    ) {
      return Response.json(
        { error: "CREATOR_OWNERSHIP_DIAGNOSTIC_INPUT_INVALID" },
        { status: 400, headers },
      );
    }
    const target = new URL("/api/internal/audit/creator-ownership", sdkPromotionInternalBaseUrl());
    target.searchParams.set("slug", slug);
    const url = target.toString();
    const response = await fetch(url, {
      headers: sdkServiceHeaders("GET", url, {
        environment: sdkSupportEnvironment(),
      }),
      cache: "no-store",
    });
    return Response.json(await response.json().catch(() => ({
      error: "CREATOR_OWNERSHIP_DIAGNOSTIC_INVALID_RESPONSE",
    })), { status: response.status, headers });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json(
        { error: "CREATOR_OWNERSHIP_DIAGNOSTIC_UNAVAILABLE" },
        { status: 503, headers },
      );
  }
}
