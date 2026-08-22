import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const targetSlug = "moi-lab2";

async function proxy(request: Request, method: "GET" | "POST") {
  try {
    await requireFullSiteAdminSession();
    const target = new URL(
      "/api/internal/recovery/creator-quarantine",
      sdkPromotionInternalBaseUrl(),
    );
    let body: string | undefined;
    if (method === "GET") {
      const incoming = new URL(request.url);
      const keys = [...incoming.searchParams.keys()];
      if (
        keys.length !== 1
        || keys[0] !== "slug"
        || incoming.searchParams.get("slug") !== targetSlug
      ) {
        return Response.json(
          {
            error: "CREATOR_RECOVERY_INPUT_INVALID",
            diagnostic: { phase: "request-validation", store: "request" },
          },
          { status: 400, headers },
        );
      }
      target.searchParams.set("slug", targetSlug);
    } else {
      body = await request.text();
      if (body.length > 4_096) {
        return Response.json(
          {
            error: "CREATOR_RECOVERY_INPUT_INVALID",
            diagnostic: { phase: "request-validation", store: "request" },
          },
          { status: 400, headers },
        );
      }
    }
    const url = target.toString();
    const response = await fetch(url, {
      method,
      headers: {
        ...sdkServiceHeaders(method, url, {
          environment: sdkSupportEnvironment(),
        }),
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
    });
    return Response.json(await response.json().catch(() => ({
      error: "CREATOR_RECOVERY_INVALID_RESPONSE",
    })), { status: response.status, headers });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json(
        {
          error: "CREATOR_RECOVERY_UNAVAILABLE",
          diagnostic: { phase: "request-processing", store: "sdk-portal" },
        },
        { status: 503, headers },
      );
  }
}

export async function GET(request: Request) {
  return proxy(request, "GET");
}

export async function POST(request: Request) {
  return proxy(request, "POST");
}
