import {
  requireRecentSiteAdminMfa,
  requireSiteAdminSession,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { sdkPortalInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function internalUrl() {
  return `${sdkPortalInternalBaseUrl()}/api/internal/promotions`;
}

async function proxyPayload(response: Response) {
  return response.json().catch(() => ({ error: "SDK_PROMOTION_INVALID_RESPONSE" }));
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    const url = internalUrl();
    const response = await fetch(url, {
      headers: sdkServiceHeaders("GET", url),
      cache: "no-store",
    });
    return Response.json(await proxyPayload(response), {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: "SDK_PROMOTIONS_LOAD_FAILED" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null);
    const url = internalUrl();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...sdkServiceHeaders("POST", url),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await proxyPayload(response);
    if (response.ok) {
      await appendSiteAdminAuditLog(
        request,
        session,
        "sdk-game.promote",
        payload && typeof payload === "object" && "publicGameId" in payload
          ? String(payload.publicGameId)
          : "sdk-game",
        null,
        payload,
      );
    }
    return Response.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: "SDK_PROMOTION_FAILED" }, { status: 503 });
  }
}
