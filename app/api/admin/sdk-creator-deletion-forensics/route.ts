import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const targetSlug = "moi-lab2";

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const incoming = new URL(request.url);
    const mode = incoming.searchParams.get("mode");
    const slug = incoming.searchParams.get("slug");
    const keys = [...incoming.searchParams.keys()];
    const targetRequest = mode === "target"
      && slug === targetSlug
      && keys.every((key) => key === "mode" || key === "slug")
      && new Set(keys).size === keys.length;
    const aggregateRequest = mode === "aggregate"
      && slug === null
      && keys.length === 1
      && keys[0] === "mode";
    if (!targetRequest && !aggregateRequest) {
      return Response.json(
        { error: "CREATOR_DELETION_FORENSICS_INPUT_INVALID" },
        { status: 400, headers },
      );
    }
    const target = new URL("/api/internal/audit/creator-deletion-forensics", sdkPromotionInternalBaseUrl());
    target.searchParams.set("mode", mode!);
    if (targetRequest) target.searchParams.set("slug", targetSlug);
    const url = target.toString();
    const response = await fetch(url, {
      headers: sdkServiceHeaders("GET", url, { environment: sdkSupportEnvironment() }),
      cache: "no-store",
    });
    return Response.json(await response.json().catch(() => ({
      error: "CREATOR_DELETION_FORENSICS_INVALID_RESPONSE",
    })), { status: response.status, headers });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json(
        { error: "CREATOR_DELETION_FORENSICS_UNAVAILABLE" },
        { status: 503, headers },
      );
  }
}
