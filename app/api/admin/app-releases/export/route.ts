import {
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireMain() {
  if (expectedAppEnvironment() !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    throw new Error("APP_RELEASE_MAIN_ONLY");
  }
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "APP_RELEASE_MAIN_ONLY") {
    return Response.json({ error: error.message }, { status: 403 });
  }
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  console.error("[app-release-export] route failed", {
    cause: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return Response.json({ error: "APP_RELEASE_EXPORT_FAILED" }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    requireMain();
    const source = new URL(request.url);
    const target = new URL(`${sdkPromotionInternalBaseUrl()}/api/internal/app-releases/export`);
    for (const key of ["publicGameId", "lineageId", "revision", "packageRootSha256", "serverBundleSha256", "appSetSourceSha256"]) {
      const value = source.searchParams.get(key);
      if (value !== null) target.searchParams.set(key, value);
    }
    const response = await fetch(target, {
      headers: sdkServiceHeaders("GET", target.toString()),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "APP_RELEASE_EXPORT_UPSTREAM_FAILED" }));
      return Response.json(
        payload && typeof payload === "object" ? payload : { error: "APP_RELEASE_EXPORT_UPSTREAM_FAILED" },
        { status: response.status >= 500 ? 503 : response.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    await appendSiteAdminAuditLog(
      request,
      session,
      "sdk-app.operator-package-export",
      source.searchParams.get("publicGameId") ?? "sdk-app",
      null,
      { result: "downloaded", mode: "read-only", source: "main-release-store" },
    );
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": response.headers.get("Content-Disposition") ?? "attachment; filename=runtime-package.zip",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
